"""
Seed the PostGIS database from the static files the front-end already fetched,
instead of re-downloading. Reads public/data/*.{geojson,json} (produced by
scripts/fetch-real-layers.mjs and scripts/fetch-real-data.mjs) and upserts them
into the tables defined in schema.sql. Idempotent (INSERT ... ON CONFLICT).

Run (dry run, no database needed - validates parsing and prints counts):
    python load_from_public_data.py --dry-run

Run (load into PostGIS):
    createdb soh && psql soh -f schema.sql
    SOH_DATABASE_URL=postgresql:///soh python load_from_public_data.py

What is seeded from real committed data:
    schools            <- schools.sample.geojson   (NCES CCD; real)
    opportunity_zones  <- opportunity_zones.geojson (HUD/Treasury; real)
    plps               <- plp.sample.json           (FL DOE PLP list; real)
    fish_capacity      <- fish_capacity.json (FISH; real) + enrollment_history.json
                          (NCES; real) for the FTE side of the utilization rate

What is NOT seeded here, and why:
    acs_demographics   income.sample.geojson is SYNTHETIC sample data; loading it
                       as if it were ACS would be misleading. Awaits a real
                       ACS 5-year + TIGER tract pull (the Census key is already
                       wired for that in .env).
    parcels            needs the FDOR statewide NAL/GIS download (served as
                       vector tiles, never committed GeoJSON).
    attendance_zones   needs district GIS / NCES SABS boundaries.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def _load(path: Path) -> dict:
    with path.open() as fh:
        return json.load(fh)


def shape_schools(fc: dict) -> list[dict]:
    rows = []
    for f in fc["features"]:
        p = f["properties"]
        rows.append({
            "msid": p["msid"],
            "ncessch": None,  # schools.sample keys on seasch (MSID); ncessch not carried
            "name": p["name"],
            "district": p.get("operator"),
            "county_fips": p.get("county_fips"),
            "level": p.get("level"),
            "type": p.get("type"),
            "is_public": True,  # NCES CCD = public schools (charters are public in FL)
            "current_grade": p.get("current_grade"),
            "grade_year": p.get("current_grade_year"),
            "title_i": bool(p.get("title_i_eligible")),
            "opened_year": None,  # not in NCES directory; needed for >4yr co-location test
            "geom": json.dumps(f["geometry"]),
        })
    return rows


def shape_opportunity_zones(fc: dict) -> list[dict]:
    rows = []
    for f in fc["features"]:
        p = f["properties"]
        rows.append({
            "geoid": p["geoid"],
            "county_fips": p.get("county_fips"),
            "rural": bool(p.get("rural")),
            "geom": json.dumps(f["geometry"]),
        })
    return rows


def shape_fish_capacity(cap_doc: dict, enroll_doc: dict, valid_msids: set[str]) -> tuple[list[dict], int]:
    """Rows for the fish_capacity table: FISH capacity + the latest real FTE.

    Capacity comes from FISH (fish_capacity.json). The FTE side of the Facility
    Utilization Rate comes from the most recent year of NCES enrollment
    (enrollment_history.json). A FISH row is emitted only when the school exists
    (FK) and has a real enrollment figure - never a fabricated FTE.
    """
    latest_fte = {}
    for msid, hist in enroll_doc.get("schools", {}).items():
        if hist:
            last = sorted(hist, key=lambda h: h["year"])[-1]
            latest_fte[msid] = (last["year"], last["enrollment"])

    rows, skipped = [], 0
    for msid, rec in cap_doc.get("schools", {}).items():
        if msid not in valid_msids or msid not in latest_fte:
            skipped += 1
            continue
        year, fte = latest_fte[msid]
        rows.append({
            "msid": msid,
            "survey_year": year,
            "permanent_capacity": rec.get("satisfactory_stations"),
            "relocatable_capacity": None,
            "satisfactory_capacity": rec["capacity"],
            "fte_enrollment": fte,
        })
    return rows, skipped


def shape_plps(doc: dict, valid_msids: set[str]) -> tuple[list[dict], int]:
    rows, skipped = [], 0
    designated_year = doc.get("designated_year", "unknown")
    for msid, rec in doc["schools"].items():
        if msid not in valid_msids:
            skipped += 1  # PLP school not in the geocoded schools set; FK would fail
            continue
        grades = ", ".join(
            f"{yr[-4:]}:{rec[yr]}" for yr in ("grade_2021", "grade_2022", "grade_2023", "grade_2024", "grade_2025")
            if rec.get(yr)
        )
        rows.append({
            "msid": msid,
            "designated_year": designated_year,
            "reason": f"FL DOE PLP designation ({rec.get('district_name', '')}). Grades {grades}.",
            "property_geom": None,  # PLPS parcel footprint not available; buffer falls back to point
        })
    return rows, skipped


UPSERTS = {
    "schools": """
        INSERT INTO schools (msid, ncessch, name, district, county_fips, level, type,
                             is_public, current_grade, grade_year, title_i, opened_year, geom)
        VALUES (%(msid)s, %(ncessch)s, %(name)s, %(district)s, %(county_fips)s, %(level)s, %(type)s,
                %(is_public)s, %(current_grade)s, %(grade_year)s, %(title_i)s, %(opened_year)s,
                ST_SetSRID(ST_GeomFromGeoJSON(%(geom)s), 4326))
        ON CONFLICT (msid) DO UPDATE SET
            name = EXCLUDED.name, district = EXCLUDED.district, county_fips = EXCLUDED.county_fips,
            level = EXCLUDED.level, type = EXCLUDED.type, current_grade = EXCLUDED.current_grade,
            grade_year = EXCLUDED.grade_year, title_i = EXCLUDED.title_i, geom = EXCLUDED.geom;
    """,
    "opportunity_zones": """
        INSERT INTO opportunity_zones (geoid, county_fips, rural, geom)
        VALUES (%(geoid)s, %(county_fips)s, %(rural)s,
                ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%(geom)s), 4326)))
        ON CONFLICT (geoid) DO UPDATE SET
            county_fips = EXCLUDED.county_fips, rural = EXCLUDED.rural, geom = EXCLUDED.geom;
    """,
    "plps": """
        INSERT INTO plps (msid, designated_year, reason, property_geom)
        VALUES (%(msid)s, %(designated_year)s, %(reason)s, NULL)
        ON CONFLICT (msid) DO UPDATE SET
            designated_year = EXCLUDED.designated_year, reason = EXCLUDED.reason;
    """,
    "fish_capacity": """
        INSERT INTO fish_capacity (msid, survey_year, permanent_capacity,
                                   relocatable_capacity, satisfactory_capacity, fte_enrollment)
        VALUES (%(msid)s, %(survey_year)s, %(permanent_capacity)s,
                %(relocatable_capacity)s, %(satisfactory_capacity)s, %(fte_enrollment)s)
        ON CONFLICT (msid, survey_year) DO UPDATE SET
            permanent_capacity = EXCLUDED.permanent_capacity,
            satisfactory_capacity = EXCLUDED.satisfactory_capacity,
            fte_enrollment = EXCLUDED.fte_enrollment;
    """,
}


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed PostGIS from public/data static files")
    ap.add_argument("--data-dir", default=str(Path(__file__).resolve().parent.parent / "public" / "data"))
    ap.add_argument("--dsn", default=os.environ.get("SOH_DATABASE_URL", "postgresql:///soh"))
    ap.add_argument("--dry-run", action="store_true", help="parse and report only; no DB connection")
    args = ap.parse_args()

    data = Path(args.data_dir)
    schools = shape_schools(_load(data / "schools.sample.geojson"))
    ozs = shape_opportunity_zones(_load(data / "opportunity_zones.geojson"))
    valid = {r["msid"] for r in schools}
    plps, plp_skip = shape_plps(_load(data / "plp.sample.json"), valid)
    fish, fish_skip = shape_fish_capacity(
        _load(data / "fish_capacity.json"), _load(data / "enrollment_history.json"), valid,
    )

    print(f"schools:           {len(schools):>6}")
    print(f"opportunity_zones: {len(ozs):>6}")
    print(f"plps:              {len(plps):>6}  ({plp_skip} skipped: MSID not in geocoded schools)")
    print(f"fish_capacity:     {len(fish):>6}  ({fish_skip} skipped: no capacity/FTE or not in schools)")

    if args.dry_run:
        sample = {k: v for k, v in schools[0].items() if k != "geom"}
        print("\n[dry run] no database written. sample school row:")
        print(" ", sample)
        if fish:
            print("sample fish_capacity row:", fish[0])
        return

    import psycopg  # imported lazily so --dry-run needs no driver

    batches = [("schools", schools), ("opportunity_zones", ozs), ("plps", plps), ("fish_capacity", fish)]
    with psycopg.connect(args.dsn) as conn:
        with conn.cursor() as cur:
            for table, rows in batches:
                cur.executemany(UPSERTS[table], rows)
                print(f"upserted {len(rows):>6} into {table}")
            cur.execute("REFRESH MATERIALIZED VIEW soh_eligibility_zones;")
        conn.commit()
    print("done. eligibility zones refreshed.")


if __name__ == "__main__":
    main()
