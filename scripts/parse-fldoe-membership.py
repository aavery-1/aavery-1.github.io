#!/usr/bin/env python3
"""Replace the tool's enrollment with FL DOE Survey 2 membership (REAL DATA).

The prior enrollment came from NCES CCD (via the Urban Institute portal). This
script swaps it for the authoritative source used for FEFP funding: the Florida
Department of Education "Membership by School by Grade" report, Final Survey 2
(October count). Source files live in scripts/sources/fldoe-membership/ and are
the statewide workbooks published on the FL DOE PK-12 data page:
https://www.fldoe.org/accountability/data-sys/edu-info-accountability-services/pk-12-public-school-data-pubs-reports/students.stml

Two outputs:
  1. public/data/schools.sample.geojson - each school's headline `enrollment`
     is set to its MOST RECENT Final Survey 2 total, `enrollment_year` stamped
     per school. Schools with no FL DOE PK-12 membership record (adult/technical
     colleges, detention centers, planned/placeholder entries, and the synthetic
     KIPP campus keys) get enrollment = null (N/A). We never carry a value
     forward or fabricate one.
  2. public/data/enrollment_history.json - the inspector's enrollment trend,
     rebuilt from all five FL DOE years, keyed by MSID (the same key the
     inspector resolves through report_msid).

Multi-campus charters that Florida reports under a SINGLE shared MSID (KIPP
Miami, reported under 13-2332) are handled honestly: that MSID's total is the
whole network, so it is NOT attributed to any one campus headline. It still
populates the shared trend, which every campus reads via report_msid.

Suppressed totals ('*', groups < 10) are treated as "no reliable value": they
are skipped for both the headline (fall back to an earlier real year) and the
trend (that year is omitted).

Run: python3 scripts/parse-fldoe-membership.py
"""

import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scripts" / "sources" / "fldoe-membership"
SCHOOLS_PATH = ROOT / "public" / "data" / "schools.sample.geojson"
HISTORY_PATH = ROOT / "public" / "data" / "enrollment_history.json"

# file tag -> (school-year label, is_final). Ordered oldest -> newest.
# 2021-22 was published as a preliminary Survey 2 snapshot ("as of December 23,
# 2021"); the rest are Final Survey 2. We include the preliminary year in the
# trend for continuity but never let it decide a headline number.
SURVEYS = [
    ("2021", "2020-2021", True),
    ("2122", "2021-2022", False),
    ("2223", "2022-2023", True),
    ("2324", "2023-2024", True),
    ("2425", "2024-2025", True),
]

TOTAL_SHEET = "Schl Total Enrollment"
DATA_START_ROW = 4  # rows 1-3 are title / privacy note / header


def msid_of(district, school):
    """FL DOE district # + school # -> the tool's DD-NNNN MSID."""
    try:
        d = int(str(district).strip())
        s = int(str(school).strip())
    except (TypeError, ValueError):
        return None
    return f"{d:02d}-{s:04d}"


def load_totals(tag):
    """Return {msid: int|None} for one survey file. None means suppressed ('*')."""
    wb = openpyxl.load_workbook(SRC_DIR / f"{tag}MembBySchoolByGrade.xlsx",
                               read_only=True, data_only=True)
    ws = wb[TOTAL_SHEET]
    out = {}
    for row in ws.iter_rows(min_row=DATA_START_ROW, values_only=True):
        district, _dname, school, _sname, count = row[0], row[1], row[2], row[3], row[4]
        msid = msid_of(district, school)
        if msid is None:
            continue
        if count == "*":
            out[msid] = None  # exists but suppressed
        elif isinstance(count, (int, float)):
            out[msid] = int(count)
        # blank/other -> omit
    wb.close()
    return out


def main():
    # totals[year_label] = {msid: int|None}
    totals = {}
    for tag, year, _final in SURVEYS:
        totals[year] = load_totals(tag)
        print(f"  loaded {year}: {len(totals[year])} schools")

    final_years_newest_first = [year for _t, year, final in reversed(SURVEYS) if final]
    all_years_oldest_first = [year for _t, year, _f in SURVEYS]

    # --- 1. enrollment_history.json (all five years, keyed by MSID) ---
    history_msids = set()
    for year in all_years_oldest_first:
        history_msids.update(totals[year].keys())
    history = {}
    for msid in history_msids:
        series = []
        for year in all_years_oldest_first:
            v = totals[year].get(msid)
            if isinstance(v, int):
                series.append({"year": year, "enrollment": v})
        if series:
            history[msid] = series
    history_out = {
        "vintage": "FL DOE Survey 2 (October membership), 2020-21 through 2024-25",
        "source": "Florida Department of Education, Membership by School by Grade (Survey 2)",
        "source_url": "https://www.fldoe.org/accountability/data-sys/edu-info-accountability-services/pk-12-public-school-data-pubs-reports/students.stml",
        "unit": "students (PK-12 membership headcount, all grades)",
        "notes": ("Final Survey 2 for all years except 2021-22, which FL DOE "
                  "published as a preliminary Survey 2 snapshot (as of Dec 23, "
                  "2021). Years with a privacy-suppressed total are omitted for "
                  "that school. Keyed by MSID; multi-campus charters reported "
                  "under one MSID (e.g. KIPP Miami, 13-2332) carry the network "
                  "trend, which each campus resolves through report_msid."),
        "schools": {k: history[k] for k in sorted(history)},
    }
    HISTORY_PATH.write_text(json.dumps(history_out, indent=2) + "\n")
    print(f"\nWrote {HISTORY_PATH.relative_to(ROOT)}: {len(history)} schools, "
          f"{len(all_years_oldest_first)} survey years.")

    # --- 2. overlay headline enrollment onto schools.sample.geojson ---
    geo = json.loads(SCHOOLS_PATH.read_text())
    feats = geo["features"]

    # A shared reporting anchor is an MSID that other campuses point to via
    # report_msid: its FL DOE total is a network total, not one campus's headcount.
    shared_anchor = set()
    for f in feats:
        p = f["properties"]
        rm = p.get("report_msid")
        if rm and rm != p["msid"]:
            shared_anchor.add(rm)

    n_set = n_na = n_suppressed_only = n_shared = 0
    by_year = {}
    na_examples = []
    for f in feats:
        p = f["properties"]
        msid = p["msid"]
        chosen_val = None
        chosen_year = None

        if msid in shared_anchor:
            # network total under a shared MSID - do not attribute to one campus
            n_shared += 1
        else:
            for year in final_years_newest_first:
                v = totals[year].get(msid)
                if isinstance(v, int):
                    chosen_val, chosen_year = v, year
                    break
            if chosen_val is None:
                # distinguish "exists but always suppressed" from "no record"
                if any(msid in totals[y] for y in all_years_oldest_first):
                    n_suppressed_only += 1

        p["enrollment"] = chosen_val
        p["enrollment_year"] = chosen_year
        if chosen_val is None:
            n_na += 1
            if len(na_examples) < 12:
                na_examples.append((msid, p["name"]))
        else:
            n_set += 1
            by_year[chosen_year] = by_year.get(chosen_year, 0) + 1

    geo["notes"] = (
        "Directory fields (location, name, level, type, address) from NCES CCD "
        "2023-2024. Enrollment REPLACED with FL DOE Survey 2 membership "
        "(Membership by School by Grade); enrollment is each school's most "
        "recent Final Survey 2 total, per-school enrollment_year. Schools with "
        "no FL DOE PK-12 membership record show enrollment null (N/A). Grades "
        "from FL DOE (grades.sample.json); Title I and flood carried by MSID; "
        "capacity/COFTE from FISH LOS (parse-fish-los.py)."
    )
    SCHOOLS_PATH.write_text(json.dumps(geo, indent=2) + "\n")

    print(f"\nWrote {SCHOOLS_PATH.relative_to(ROOT)}: {len(feats)} schools")
    print(f"  enrollment set: {n_set}  |  N/A: {n_na}  "
          f"(shared-MSID anchors: {n_shared}, suppressed-only: {n_suppressed_only})")
    print(f"  headline year distribution: "
          f"{ {y: by_year[y] for y in sorted(by_year)} }")
    print("  N/A examples:")
    for msid, name in na_examples:
        print(f"    {msid}  {name}")


if __name__ == "__main__":
    main()
