#!/usr/bin/env python3
"""Add each school's student race/ethnicity to schools.sample.geojson (REAL DATA).

Source: FL DOE "Membership by School by Grade by Race/Ethnicity", Survey 2, from
the same PK-12 data page the enrollment (parse-fldoe-membership.py) and FRL
(parse-frl-lunch.py) feeds use:
  https://www.fldoe.org/accountability/data-sys/edu-info-accountability-services/pk-12-public-school-data-pubs-reports/students.stml
Source file: scripts/sources/fldoe-membership/2526MembBySchoolByGradeByRace.xlsx

The workbook's "School" sheet is one row per school PER GRADE with counts for
White, Black, Hispanic, Asian, Pacific, American Indian, Two-or-More. We sum the
grade rows per school to a school total, then compute the three headline shares
the tool shows (Black, Hispanic, White). Cells under 10 students are suppressed
("*") for privacy; we count them as 0 and record how many were suppressed so a
small school's shares are never read as exact.

JOIN: MSID = "{Dist #:02d}-{Schl #:04d}", the same Master School ID the tool keys
on. FL DOE reports charters under their operating district code, so the join is
direct.

KIPP: KIPP Miami reports to FL DOE as ONE school, 13-2332 "KIPP Miami-Liberty
City" (1,332 students), not as its five campuses. The tool models the five
campuses with placeholder MSIDs, so none of them match 13-2332 directly. We
attribute 13-2332's composition to every KIPP campus with race_scope = "network"
(a network figure, never a fabricated per-campus split), matched by the same
isKippSchool name test the map and inspector use.

OUTPUT: public/data/schools.sample.geojson - adds pct_black, pct_hispanic,
pct_white (percentages 0-100), race_total, race_year, race_scope per school.

Run: python3 scripts/parse-fldoe-race.py
No em dashes in this file.
"""

import json
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "sources" / "fldoe-membership" / "2526MembBySchoolByGradeByRace.xlsx"
SCHOOLS_PATH = ROOT / "public" / "data" / "schools.sample.geojson"
RACE_YEAR = "2024-25"
KIPP_NETWORK_MSID = "13-2332"  # FL DOE "KIPP Miami-Liberty City"


def write_synced(path, payload):
    path.write_text(payload)
    dist_copy = ROOT / "dist" / "data" / path.name
    if dist_copy.exists():
        dist_copy.write_text(payload)


def is_kipp(name):
    return (name or "").strip().lower().startswith("kipp")


def num(v):
    """FL DOE cell -> (count, was_suppressed). '*' means a suppressed small count."""
    if isinstance(v, (int, float)):
        return int(v), 0
    if v == "*":
        return 0, 1
    return 0, 0


def load_race():
    """Return {msid: {black,hispanic,white,total,supp}} summed over grade rows."""
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb["School"]
    agg = {}
    for row in ws.iter_rows(min_row=4, values_only=True):
        d, _dn, s, _sn, _gl, W, B, H, A, P, I, M = row[:12]
        if d is None or s is None:
            continue
        try:
            msid = "%02d-%04d" % (int(d), int(s))
        except (TypeError, ValueError):
            continue
        a = agg.setdefault(msid, {"W": 0, "B": 0, "H": 0, "other": 0, "supp": 0})
        for key, val in (("W", W), ("B", B), ("H", H)):
            n, sp = num(val)
            a[key] += n
            a["supp"] += sp
        for val in (A, P, I, M):
            n, sp = num(val)
            a["other"] += n
            a["supp"] += sp
    wb.close()
    out = {}
    for msid, a in agg.items():
        total = a["W"] + a["B"] + a["H"] + a["other"]
        if total <= 0:
            continue
        out[msid] = {
            "pct_black": round(100 * a["B"] / total, 1),
            "pct_hispanic": round(100 * a["H"] / total, 1),
            "pct_white": round(100 * a["W"] / total, 1),
            "race_total": total,
            "suppressed_cells": a["supp"],
        }
    return out


def main():
    race = load_race()
    print(f"  loaded race for {len(race)} schools statewide")
    kipp_net = race.get(KIPP_NETWORK_MSID)
    if not kipp_net:
        raise SystemExit(f"KIPP network school {KIPP_NETWORK_MSID} not found in race file")

    geo = json.loads(SCHOOLS_PATH.read_text())
    feats = geo["features"]
    n_school = n_network = n_na = 0
    for f in feats:
        p = f["properties"]
        if is_kipp(p.get("name", "")):
            r, scope = kipp_net, "network"
        else:
            r, scope = race.get(p["msid"]), "school"
        if r:
            p["pct_black"] = r["pct_black"]
            p["pct_hispanic"] = r["pct_hispanic"]
            p["pct_white"] = r["pct_white"]
            p["race_total"] = r["race_total"]
            p["race_year"] = RACE_YEAR
            p["race_scope"] = scope
            if scope == "network":
                n_network += 1
            else:
                n_school += 1
        else:
            for k in ("pct_black", "pct_hispanic", "pct_white", "race_total", "race_year", "race_scope"):
                p.pop(k, None)
            n_na += 1

    write_synced(SCHOOLS_PATH, json.dumps(geo, indent=2) + "\n")
    print(f"Wrote {SCHOOLS_PATH.relative_to(ROOT)}: {len(feats)} schools")
    print(f"  race set (school): {n_school}  |  KIPP network-attributed: {n_network}  |  N/A: {n_na}")
    print(f"  KIPP Miami network ({KIPP_NETWORK_MSID}): "
          f"{kipp_net['race_total']} students, "
          f"{kipp_net['pct_black']:.0f}% Black / {kipp_net['pct_hispanic']:.0f}% Hispanic / {kipp_net['pct_white']:.0f}% White")


if __name__ == "__main__":
    main()
