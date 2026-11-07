#!/usr/bin/env python3
"""Refresh the school directory to the freshest authoritative NCES CCD vintage
while PRESERVING the verified enrichments this project already built.

Why a bespoke script (not scripts/fetch-real-data.mjs): that older script is
pinned to 2022, uses the pre-integration schema, and OVERWRITES grades.sample.json
with an empty placeholder. This script instead:

  1. Pulls the newest CCD directory (2023-24) from the Urban Institute API
     (authoritative NCES mirror, no key) for the three counties, keeping only
     OPEN, geocoded schools -> so closed/consolidated schools drop and newly
     opened ones appear (freshest school SET).
  2. Rebuilds each school's directory fields from CCD: coordinates, name, level,
     type, operator, enrollment (2023-24), address, county.
  3. CARRIES OVER the enrichments that are not in the CCD directory, matched by
     MSID from the current file: Title I (tri-state), flood status. New schools
     get title_i "unknown" and null flood (disclosed).
  4. Sets current_grade from the verified grades.sample.json (latest A-F).
  5. Leaves capacity/COFTE/surplus null here; run parse-fish-los.py next to fill
     them from the FISH Level of Service reports.

Re-run:  python3 scripts/refresh-schools-directory.py && python3 scripts/parse-fish-los.py
         python3 scripts/refresh-schools-directory.py --spans-only   (level + grade span only)
         (then: npm run test / build)
"""
import json, re, sys, subprocess, tempfile, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
SCHOOLS = DATA / "schools.sample.geojson"
YEAR = 2024  # CCD 2023-24, the newest Urban Institute vintage
COUNTY = {"12086": "Miami-Dade", "12011": "Broward", "12095": "Orange"}
LEVEL_MAP = {1: "Elementary", 2: "Middle", 3: "High", 4: "Combination", 5: "Other", 6: "Adult"}

# Level comes from the GRADE SPAN, not CCD's school_level. NCES files any school
# whose lowest grade is PK-3 and highest is 8 or below as "Primary", and any
# school ending at 12 whose lowest grade is 7 or above as "High", so the raw code
# labeled every K-8 "Elementary" and every 6-12 "High". FL DOE calls both
# "Combination" (School Type 04), which is how a siting analyst reads them.
#   Elementary  = starts PK-5 and ends by grade 6 (PK-5, K-5, K-6)
#   Middle      = starts 5-7 and ends 8-9 (6-8, 5-8, 7-9)
#   High        = starts 9 or later (9-12)
#   Combination = everything else that spans levels (K-8, PK-8, 6-12, K-12, 4-8)
# PK-only centers and ungraded rows keep CCD's own level ("Other").
GRADE_NAMES = {-1: "PK", 0: "K"}

def grade_name(g):
    return GRADE_NAMES.get(g, str(g))

def span_label(lo, hi):
    if not isinstance(lo, int) or not isinstance(hi, int) or lo < -1 or hi < -1:
        return None
    return grade_name(lo) if lo == hi else f"{grade_name(lo)}-{grade_name(hi)}"

def level_from_span(lo, hi, fallback):
    if not isinstance(lo, int) or not isinstance(hi, int) or lo < -1 or hi < 0:
        return fallback  # ungraded or PK-only
    if lo <= 5 and hi <= 6: return "Elementary"
    if 5 <= lo <= 7 and hi <= 9: return "Middle"
    if lo >= 9: return "High"
    return "Combination"
GRADED = {"A", "B", "C", "D", "F"}
# CCD school_status: 1 open, 2 closed, 3 new, 4 added, 5 changed-agency, 6 temp-closed,
# 7 future/inactive, 8 reopened. "New/added/reopened/changed" schools are actively
# operating, so keeping only status==1 wrongly dropped real schools (some with a
# current A-F grade). Keep every non-closed status; drop only closed/future.
OPERATING_STATUS = {1, 3, 4, 5, 8}

def title_case(s):
    if not s:
        return s
    out = " ".join(w.upper() if len(w) <= 2 else w[0].upper() + w[1:].lower() for w in s.split())
    return re.sub(r"\bK (\d)", r"K-\1", out)

def infer_type(r):
    if r.get("charter") == 1: return "Charter"
    if r.get("magnet") == 1: return "Magnet"
    if r.get("virtual") == 1: return "Virtual"
    if r.get("school_type") == 4: return "Alternative"
    if r.get("school_type") == 1: return "Traditional"
    return "Other"

def fetch_ccd():
    # Use curl (system CA store); Python's SSL context lacks local certs here.
    url = f"https://educationdata.urban.org/api/v1/schools/ccd/directory/{YEAR}/?fips=12&limit=10000"
    fd, tmp = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    subprocess.run(["curl", "-sS", "--max-time", "120", "-H", "User-Agent: Mozilla/5.0 (Hope Siting refresh)", "-o", tmp, url], check=True)
    data = json.loads(Path(tmp).read_text())
    os.unlink(tmp)
    return data["results"]

def cur_grade(msid, grades):
    h = grades.get(msid) or []
    for e in reversed(h):
        if e["grade"] in GRADED:
            return e["grade"], e["year"]
    return (h[-1]["grade"], h[-1]["year"]) if h else ("NR", f"{YEAR-1}-{YEAR}")

def spans_only(rows):
    """Patch level + grades_offered on the CURRENT schools file in place, leaving
    every other field (FISH, enrollment, demographics, KIPP fixes) untouched."""
    by = {r.get("seasch"): r for r in rows if r.get("seasch")}
    data = json.loads(SCHOOLS.read_text())
    changed, nospan = [], []
    for f in data["features"]:
        p = f["properties"]
        r = by.get(p["msid"])
        if not r:
            nospan.append(p["msid"]); continue
        lo, hi = r.get("lowest_grade_offered"), r.get("highest_grade_offered")
        p["grades_offered"] = span_label(lo, hi)
        new = level_from_span(lo, hi, p["level"])
        if new != p["level"]:
            changed.append((p["msid"], p["name"], p["level"], new, p["grades_offered"]))
            p["level"] = new
    SCHOOLS.write_text(json.dumps(data, indent=2) + "\n")
    from collections import Counter
    print(f"recoded {len(changed)} levels from CCD grade span:", Counter((a, b) for _, _, a, b, _ in changed))
    for c in changed[:12]: print("  ", c)
    print(f"{len(nospan)} schools not in CCD {YEAR-1}-{YEAR} (level unchanged):", nospan)

def main():
    rows = fetch_ccd()
    if "--spans-only" in sys.argv:
        return spans_only(rows)
    print(f"fetched {len(rows)} FL schools from CCD {YEAR-1}-{YEAR}")
    grades = json.loads((DATA / "grades.sample.json").read_text())["schools"]
    prev = json.loads(SCHOOLS.read_text())
    carry = {}       # msid -> preserved enrichment (Title I, flood)
    prev_feat = {}   # msid -> full prior feature (for graded-school retention)
    for f in prev["features"]:
        p = f["properties"]
        carry[p["msid"]] = {k: p.get(k) for k in ("title_i", "title_i_eligible", "title_i_schoolwide", "flood_zone", "flood_sfha")}
        prev_feat[p["msid"]] = f
    prev_msids = set(carry)

    def has_recent_grade(msid):
        h = grades.get(msid) or []
        return any(e["grade"] in GRADED for e in h[-2:])

    feats = []
    kept = added = 0
    for r in rows:
        cc = str(r.get("county_code"))
        if cc not in COUNTY: continue
        if r.get("school_status") not in OPERATING_STATUS: continue   # drop only closed/future
        if not isinstance(r.get("latitude"), (int, float)) or not isinstance(r.get("longitude"), (int, float)): continue
        msid = r.get("seasch") or r.get("ncessch")
        g, gy = cur_grade(msid, grades)
        c = carry.get(msid)
        if c: kept += 1
        else: added += 1
        addr = ", ".join(x for x in [title_case(r.get("street_location") or ""), title_case(r.get("city_location") or ""), "FL", str(r.get("zip_location") or "")] if x).strip().strip(",")
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
            "properties": {
                "msid": msid,
                "name": title_case(r.get("school_name") or msid),
                "level": level_from_span(r.get("lowest_grade_offered"), r.get("highest_grade_offered"), LEVEL_MAP.get(r.get("school_level"), "Other")),
                "grades_offered": span_label(r.get("lowest_grade_offered"), r.get("highest_grade_offered")),
                "type": infer_type(r),
                "operator": title_case(r.get("lea_name")) if r.get("lea_name") else None,
                "county": COUNTY[cc],
                "county_fips": cc,
                "board_district": None,
                "current_grade": g,
                "current_grade_year": gy,
                "enrollment": r["enrollment"] if isinstance(r.get("enrollment"), (int, float)) and r["enrollment"] >= 0 else None,
                "enrollment_year": f"{YEAR-1}-{YEAR}",
                "capacity": None, "cofte": None, "fish_surplus": None, "fish_vintage": None,
                "title_i": (c or {}).get("title_i", "unknown"),
                "title_i_eligible": (c or {}).get("title_i_eligible", False),
                "title_i_schoolwide": (c or {}).get("title_i_schoolwide", False),
                "flood_zone": (c or {}).get("flood_zone"),
                "flood_sfha": (c or {}).get("flood_sfha", False),
                "geocode_source": f"NCES CCD {YEAR-1}-{YEAR}",
                "address": addr,
            },
        })
    # Retention safety net: never drop a school that has a current A-F grade (proof
    # it is operating in 2025-26) just because the CCD 2023-24 directory lags or
    # marks it closed/reopened. Carry its full prior feature over verbatim so its
    # verified enrichments (capacity/COFTE, districts, flood) survive.
    ccd_msids = {f["properties"]["msid"] for f in feats}
    retained = 0
    for msid in prev_msids - ccd_msids:
        if has_recent_grade(msid):
            feats.append(prev_feat[msid])
            retained += 1

    feats.sort(key=lambda f: f["properties"]["msid"])
    new_msids = {f["properties"]["msid"] for f in feats}
    dropped = sorted(prev_msids - new_msids)

    out = {
        "type": "FeatureCollection",
        "features": feats,
        "vintage": f"NCES CCD {YEAR-1}-{YEAR} directory, retrieved {__import__('datetime').date.today().isoformat()}",
        "source": "NCES Common Core of Data via Urban Institute Education Data Portal",
        "source_url": "https://educationdata.urban.org/documentation/schools.html#ccd_directory",
        "notes": "Directory fields (location, name, level, type, enrollment, address) from CCD. Grades from FL DOE (grades.sample.json); Title I and flood carried from the prior build by MSID (new schools: title_i 'unknown', flood unmapped); capacity/COFTE from FISH LOS (parse-fish-los.py).",
    }
    SCHOOLS.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {len(feats)} schools ({kept} carried over, {added} newly added, {retained} retained for a current grade, {len(dropped)} dropped as closed/not-in-{YEAR})")
    # PLP anchors must survive: verify official PLP MSIDs are still present.
    plp = json.loads((DATA / "plp.sample.json").read_text())["schools"]
    missing_plp = [m for m in plp if m not in new_msids]
    print(f"official PLP schools: {len(plp)}, present after refresh: {len(plp)-len(missing_plp)}" + (f"  MISSING: {missing_plp}" if missing_plp else ""))
    if dropped[:8]:
        print("sample dropped:", dropped[:8])

if __name__ == "__main__":
    sys.exit(main())
