#!/usr/bin/env python3
"""Add each school's free/reduced-price lunch (FRL) rate from the FL DOE 2025-26
Fall Survey 2 "Lunch Status by School" report (REAL DATA).

Until now the tool used Title I eligibility as its only economic-disadvantage
proxy and flagged a true FRL rate as a planned addition (see the note in
src/views/SchoolTable.tsx). This wires in that real rate. FRL is the share of a
school's students certified for free or reduced-price meals - the standard
school-level poverty measure - and for a Schools of Hope tool it names, directly,
where student need is concentrated.

Source file: scripts/sources/lunch-status/2526-fs2-lunch-status-school.xlsx
  Sheet "Lunch Status", one row per school. We read three columns:
    col 4  "# of Students (denominator)"                        -> frl_denominator
    col 10 "# of Free or Reduced-Price Lunch ... (numerator)"   -> (implicit)
    col 11 "Rate with Multiplier If Applicable" (0.0 - 1.0)     -> frl_rate
  The published rate already applies the USDA CEP multiplier where a school runs
  the Community Eligibility Provision, so we take it as given rather than dividing
  the raw counts ourselves.

JOIN: MSID = "{Dist #}-{Schl # zero-padded to 4}", the same Master School ID the
tool keys everything on. FRL is reported per school under the operating district
code (charters included), so the join is direct - no charter-LEA remapping like
Title I needed.

HONESTY: a suppressed rate (cell "*", small-count privacy) or a school absent
from the report becomes null (frl_rate = None), never 0 and never carried over.
Null renders as "Not reported" everywhere downstream. This matches how enrollment
and FISH handle missing data.

OUTPUT: public/data/schools.sample.geojson - frl_rate, frl_denominator, frl_year
patched in place.

Run: python3 scripts/parse-frl-lunch.py
Requires: openpyxl
"""

import json
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX_PATH = ROOT / "scripts" / "sources" / "lunch-status" / "2526-fs2-lunch-status-school.xlsx"
SCHOOLS_PATH = ROOT / "public" / "data" / "schools.sample.geojson"
YEAR = "2025-2026"

COL_DIST = 0
COL_SCHOOL = 2
COL_DENOMINATOR = 4
COL_RATE = 11


def to_float(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None  # "*" suppressed, blank, or any non-numeric


def to_int(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return None


def read_lunch_status():
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb["Lunch Status"]
    rows = list(ws.iter_rows(values_only=True))
    by_msid = {}
    for r in rows[3:]:  # rows 0-2 are title / notes / header
        dist = r[COL_DIST]
        if dist is None or not str(dist).strip():
            continue
        school = str(r[COL_SCHOOL]).strip().zfill(4)
        msid = f"{str(dist).strip()}-{school}"
        by_msid[msid] = {
            "rate": to_float(r[COL_RATE]),
            "denominator": to_int(r[COL_DENOMINATOR]),
        }
    return by_msid


def main():
    lunch = read_lunch_status()
    geo = json.loads(SCHOOLS_PATH.read_text())

    counts = Counter()
    for feat in geo["features"]:
        p = feat["properties"]
        rec = lunch.get(p["msid"])
        rate = rec["rate"] if rec else None
        p["frl_rate"] = rate
        p["frl_denominator"] = rec["denominator"] if rec else None
        p["frl_year"] = YEAR if rate is not None else None
        if rate is not None:
            counts["value"] += 1
        elif rec is not None:
            counts["suppressed"] += 1  # in the report but rate withheld
        else:
            counts["absent"] += 1  # not in the report at all

    payload = json.dumps(geo)
    SCHOOLS_PATH.write_text(payload)
    # Keep the built copy in sync so `vite preview` and the deploy (which serve
    # dist/, not public/) show the refreshed data without a full rebuild.
    dist_copy = ROOT / "dist" / "data" / "schools.sample.geojson"
    if dist_copy.exists():
        dist_copy.write_text(payload)
        print(f"Also synced {dist_copy.relative_to(ROOT)}")

    total = sum(counts.values())
    print(f"FL DOE FS2 lunch-status rows: {len(lunch)}")
    print(f"Schools written: {total}")
    print(f"  frl_rate -> value {counts['value']}, "
          f"suppressed(null) {counts['suppressed']}, absent(null) {counts['absent']}")


if __name__ == "__main__":
    main()
