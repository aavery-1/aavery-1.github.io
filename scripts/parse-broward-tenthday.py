#!/usr/bin/env python3
"""
Overlay SY2026-27 enrollment onto Broward County schools from the district's
Tenth Day Enrollment Count.

CONTEXT: The tool's headline `enrollment` is normally each school's most recent
FL DOE Final Survey 2 (October membership) total, built by
scripts/parse-fldoe-membership.py (2024-25 for nearly all schools). Broward
County publishes an official "Tenth Day Enrollment Count" (a PK-12 headcount
taken on the tenth day of school) for the CURRENT year sooner than Survey 2 is
released statewide, so for Broward we can carry a fresher SY2026-27 figure.

This is a DIFFERENT survey than Survey 2 (August day-10 headcount vs the October
FEFP count), but both are PK-12 headcounts and the two differ only marginally.
Every enrollment field is year-stamped per school (`enrollment_year`), so a
Broward school reading "SY2026-2027" is self-evidently the Tenth Day figure and
a Miami-Dade/Orange school reading "SY2024-2025" is Survey 2 -- the vintage is
transparent at the point of display. Only Broward (district 06) is touched here.

JOIN: the report lists each school by its Broward school number, which IS the
FL DOE school number in the tool's MSID (district 06). MSID = f"06-{number:04d}".

INTEGRITY: the memo states an official District + charter total. This script sums
the per-school totals it parsed and HARD-FAILS unless they reconcile to that
stated total exactly, so a misparse (e.g. a section subtotal read as a school)
cannot silently corrupt the data.

CLOSURES: schools that closed or converted for SY2026-27 report a Tenth Day total
of 0 (e.g. Plantation Middle folding into Plantation 6-12; several elementaries
and charters that did not reopen). Per the owner's decision these are written
faithfully as enrollment 0 (SY2026-27) -- a real "effectively empty now" signal --
rather than carried forward or nulled.

INPUT:  scripts/sources/broward-tenthday/tenth-day-enrollment-2627.pdf
OUTPUT: public/data/schools.sample.geojson  (enrollment/enrollment_year, Broward only)
        public/data/enrollment_history.json (a 2026-2027 point for each Broward school)
        (both dist/data twins kept in sync)
"""
import json
import re
import sys
from collections import OrderedDict, Counter
from pathlib import Path

import fitz  # PyMuPDF (same dependency as parse-fish-los.py)

ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = ROOT / "scripts" / "sources" / "broward-tenthday" / "tenth-day-enrollment-2627.pdf"
SCHOOLS_PATH = ROOT / "public" / "data" / "schools.sample.geojson"
HISTORY_PATH = ROOT / "public" / "data" / "enrollment_history.json"

DISTRICT = "06"          # Broward
YEAR_LABEL = "2026-2027"

# Section headers, footnotes, and running titles that are NOT school rows.
_NOT_A_NAME_PREFIX = (
    "TOTAL", "BROWARD COUNTY", "PK", "Tenth Day", "over /", "(under)",
    "Elementary Schools", "Middle Schools", "High Schools", "Combination Schools",
    "ESE Contract Agency Schools", "Contract Credit Recovery High Schools",
    "Charter Schools", "Centers", "District Total", "Includes",
)
_NUM = re.compile(r"\(?-?[\d,]+\)?")


def _is_num(tok):
    tok = tok.strip()
    return bool(_NUM.fullmatch(tok)) and any(c.isdigit() for c in tok)


def _to_int(tok):
    tok = tok.strip().replace(",", "")
    neg = tok.startswith("(")
    return (-1 if neg else 1) * int(tok.strip("()"))


def _is_school_name(line):
    if not re.search(r"[A-Za-z]", line):
        return False
    if line[0].isdigit() or line.startswith("*"):
        return False
    if any(line.startswith(p) for p in _NOT_A_NAME_PREFIX):
        return False
    return True


def parse_report(pdf_path):
    """Return (schools_by_number, official_total, count_date).

    schools_by_number: OrderedDict {"NNNN": {"name", "total"}}, duplicate school
    numbers (a campus reported on two lines during a reorg) summed together.
    """
    doc = fitz.open(pdf_path)

    memo = doc[0].get_text()
    m = re.search(r"District\s+and\s+charter\s+schools,\s+is\s+([\d,]+)", memo)
    if not m:
        sys.exit("Could not find the official District + charter total in the memo (page 1).")
    official_total = _to_int(m.group(1))
    dm = re.search(r"conducted on\s+([A-Za-z]+,\s+[A-Za-z]+\s+\d+,\s+\d{4})", memo)
    count_date = dm.group(1) if dm else None

    rows = []
    for page in doc[2:]:  # pages 1-2 are the memo; school tables start on page 3
        lines = [l.strip() for l in page.get_text().splitlines() if l.strip()]
        i = 0
        while i < len(lines) - 1:
            name = lines[i]
            if _is_school_name(name) and re.fullmatch(r"\d{3,4}", lines[i + 1].strip()):
                num = lines[i + 1].strip().zfill(4)
                nums = []
                k = i + 2
                while k < len(lines) and len(nums) < 17 and _is_num(lines[k]):
                    nums.append(lines[k])
                    k += 1
                # 14 grade columns + 2026-27 total + prior total (+ delta).
                if len(nums) >= 15:
                    rows.append({"num": num, "name": name, "total": _to_int(nums[14])})
                    i = k
                    continue
            i += 1

    agg = OrderedDict()
    for r in rows:
        if r["num"] in agg:
            agg[r["num"]]["total"] += r["total"]
            agg[r["num"]]["name"] += " / " + r["name"]
        else:
            agg[r["num"]] = {"name": r["name"], "total": r["total"]}

    dupes = [n for n, c in Counter(r["num"] for r in rows).items() if c > 1]
    return agg, official_total, count_date, dupes


def write_synced(path, payload):
    """Write a public/data file and keep the built dist/data copy in sync, so
    `vite preview` and the deploy (which serve dist/, not public/) show the
    refreshed data without a full rebuild."""
    path.write_text(payload)
    dist_copy = ROOT / "dist" / "data" / path.name
    if dist_copy.exists():
        dist_copy.write_text(payload)


def main():
    schools, official_total, count_date, dupes = parse_report(PDF_PATH)

    parsed_total = sum(s["total"] for s in schools.values())
    if parsed_total != official_total:
        sys.exit(
            f"RECONCILIATION FAILED: parsed per-school total {parsed_total:,} does not "
            f"equal the memo's official District + charter total {official_total:,}. "
            f"Refusing to write (a section subtotal was likely read as a school, or a "
            f"row was missed). Parsed {len(schools)} unique school numbers."
        )

    # --- 1. overlay headline enrollment onto Broward schools ------------------
    geo = json.loads(SCHOOLS_PATH.read_text())
    feats = geo["features"]

    matched = set()
    zero = []
    for f in feats:
        p = f["properties"]
        msid = p["msid"]
        if not msid.startswith(DISTRICT + "-"):
            continue
        num = msid.split("-")[1]
        rec = schools.get(num)
        if rec is None:
            continue  # tool has a Broward school the report does not list; leave as-is
        p["enrollment"] = rec["total"]
        p["enrollment_year"] = YEAR_LABEL
        matched.add(msid)  # keyed on the full MSID, never the bare school number
        if rec["total"] == 0:
            zero.append((msid, p.get("name")))

    geo["notes"] = (
        "Directory fields (location, name, level, type, address) from NCES CCD "
        "2023-2024. Enrollment REPLACED with FL DOE Survey 2 membership "
        "(Membership by School by Grade); enrollment is each school's most "
        "recent Final Survey 2 total, per-school enrollment_year. Broward County "
        "(district 06) enrollment is instead the district's SY2026-27 Tenth Day "
        "Enrollment Count (a PK-12 headcount taken on the tenth day of school), a "
        "fresher figure than statewide Survey 2; year-stamped 2026-2027 per "
        "school. Schools with no membership record show enrollment null (N/A). "
        "Grades from FL DOE (grades.sample.json); Title I and flood carried by "
        "MSID; capacity/COFTE from FISH LOS (parse-fish-los.py)."
    )
    write_synced(SCHOOLS_PATH, json.dumps(geo, indent=2) + "\n")

    # --- 2. add a 2026-2027 point to each matched school's history trend -------
    hist = json.loads(HISTORY_PATH.read_text())
    hist_schools = hist["schools"]
    added = 0
    for msid in sorted(matched):
        num = msid.split("-")[1]
        series = [pt for pt in hist_schools.get(msid, []) if pt.get("year") != YEAR_LABEL]
        series.append({"year": YEAR_LABEL, "enrollment": schools[num]["total"]})
        series.sort(key=lambda pt: pt["year"])
        hist_schools[msid] = series
        added += 1

    hist["vintage"] = (
        "FL DOE Survey 2 (October membership), 2020-21 through 2024-25; "
        "Broward (district 06) also carries a SY2026-27 Tenth Day count"
    )
    base_note = hist.get("notes", "")
    tenth_note = (
        " Broward County schools additionally carry a SY2026-2027 point from the "
        "district's Tenth Day Enrollment Count (a PK-12 headcount on the tenth day "
        "of school, not Survey 2); it is the newest point in those schools' trend."
    )
    if "Tenth Day" not in base_note:
        hist["notes"] = base_note + tenth_note
    write_synced(HISTORY_PATH, json.dumps(hist, indent=2) + "\n")

    # --- report ---------------------------------------------------------------
    report_nums = set(schools)
    tool_broward = {
        f["properties"]["msid"].split("-")[1]
        for f in feats if f["properties"]["msid"].startswith(DISTRICT + "-")
    }
    unmatched_report = sorted(report_nums - tool_broward)
    tool_without_row = sorted(tool_broward - report_nums)

    print(f"Broward Tenth Day SY2026-27 (count date: {count_date})")
    print(f"  reconciled: parsed per-school total {parsed_total:,} == memo total {official_total:,}")
    print(f"  report school numbers: {len(report_nums)} (aggregated duplicates: {dupes or 'none'})")
    print(f"  overlaid enrollment on {len(matched)} Broward schools; history points added: {added}")
    print(f"  of those, {len(zero)} report 0 (closed/converted for SY2026-27):")
    for msid, name in sorted(zero):
        print(f"      {msid}  {name}")
    print(f"  report rows with no matching tool school ({len(unmatched_report)}): "
          f"{', '.join('06-' + n for n in unmatched_report) or 'none'}")
    print(f"  tool Broward schools with no report row ({len(tool_without_row)}, left unchanged): "
          f"{', '.join('06-' + n for n in tool_without_row) or 'none'}")


if __name__ == "__main__":
    main()
