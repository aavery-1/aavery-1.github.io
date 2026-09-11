#!/usr/bin/env python3
"""Refresh each school's Title I eligibility from the FL DOE 2025-26 Title I
Part A (TIPA) eligible-school list (REAL DATA).

The prior values came from the NCES Common Core of Data 2021-22 (via the Urban
Institute portal, scripts/fetch-title-i.mjs). This script replaces them with the
authoritative Florida source: the FL DOE "Title I, Part A School List" published
for the 2025-26 school year. Every row on that list is a Title I eligible school
(Selection Codes A/B/C are funded; E schools are "skipped" but still eligible per
ESEA 1113(b)(1)(D); F/G are other eligible codes). Program Type SW = schoolwide,
TA = targeted assistance, NA = not applicable.

Source file: scripts/sources/title-i/tipa-school-list-2526.pdf

JOIN: the tool's MSID is "{district}-{school}" (e.g. Broward = 06). The TIPA
district number + zero-padded school number reproduce it directly, so a
traditional public school joins on MSID exactly.

TRI-STATE, and why absence means different things:
  - Matched on MSID                       -> "yes" (schoolwide from Program Type)
  - Charter matched across a charter-LEA  -> "yes" (see rescue below)
  - Unmatched TRADITIONAL public school
    in a fully covered county (06/13/48)  -> "no"
  - Everything else (unconfirmed charter,
    or any school outside the covered
    counties)                             -> "unknown"

Why the split: Florida lists most charters under a separate charter-management
LEA code (KIPP = 98Z, Mater = 815, UCP = 48K, IDEA = 80, ...), while the tool
files those same schools under the county code (13/06/48) with the state school
number preserved. So a county-coded charter absent from its county's TIPA rows is
NOT proof it is not Title I; it may be listed under its charter LEA. We therefore
only assert "no" for traditional schools, whose county-coded MSID is reliable.
Unconfirmed charters stay "unknown" - never a fabricated "yes" nor a silent "no".
This matches src/data/derive/filters.ts, where only an explicit "no" disqualifies
a school from School of Hope siting; "unknown" never wrongly disqualifies.

RESCUE for cross-LEA charters: a county-coded charter is matched to a charter-LEA
row when they share the same state school number AND a distinctive (rare) name
token. This captures KIPP Miami (13-2332 -> 98Z-2332), the Mater network
(13-54xx -> 815-54xx), and UCP (48-00xx -> 48K-00xx) without accepting the many
coincidental same-number collisions across unrelated districts.

The covered counties (06 Broward, 13 Miami-Dade, 48 Orange) are the same three
the tool covers everywhere else (FISH, board districts, membership).

OUTPUT: public/data/schools.sample.geojson - title_i, title_i_schoolwide, and the
legacy title_i_eligible boolean patched in place.

Run: python3 scripts/parse-title-i-tipa.py
Requires: pypdf
"""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = ROOT / "scripts" / "sources" / "title-i" / "tipa-school-list-2526.pdf"
SCHOOLS_PATH = ROOT / "public" / "data" / "schools.sample.geojson"

# Counties the tool covers comprehensively; within these, TIPA enumerates every
# Title I school, so absence of a traditional school is meaningful ("no").
COVERED = {"06", "13", "48"}

# District number (2-3 digits, optional trailing letters for charter/special
# LEAs like 48K, 98Z), name, school number (3-4 digits), name, type text,
# total students, CLIF count, CLIF percent, selection code, program type.
ROW_RE = re.compile(
    r"^([0-9]{2,3}[A-Z]{0,2})\s+(.+?)\s+([0-9]{3,4})\s+(.+?)\s+"
    r"(\d+)\s+(\d+)\s+([\d.]+)%\s+([A-Z])\s+(SW|TA|NA)$"
)

# Name tokens too generic to prove two schools are the same record.
STOP = {
    "SCHOOL", "ELEMENTARY", "MIDDLE", "HIGH", "SENIOR", "JUNIOR", "CENTER",
    "THE", "OF", "AT", "AND", "K8", "K12", "CAMPUS", "INC", "A", "FOR", "&",
    "ACADEMY", "CHARTER", "PREPARATORY", "PREP", "COMBINATION", "SECONDARY",
    "SCH",
}


def name_tokens(s):
    s = re.sub(r"\(.*?\)", "", s.upper())
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return [t for t in s.split() if t and t not in STOP and not t.isdigit()]


def is_charter(p):
    return "harter" in (p.get("type") or "") or "harter" in (p.get("operator") or "")


def parse_rows():
    reader = PdfReader(str(PDF_PATH))
    text = "\n".join(page.extract_text() for page in reader.pages)
    rows, dropped = [], []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("*"):
            continue
        if "District" in line and "School Name" in line:  # repeated header
            continue
        m = ROW_RE.match(line)
        if m:
            dist, _dname, school, name, total, clif, pct, sel, prog = m.groups()
            rows.append({
                "dist": dist,
                "school": school.zfill(4),
                "name": name.strip(),
                "total": int(total),
                "clif": int(clif),
                "pct": float(pct),
                "sel": sel,
                "prog": prog,
            })
        elif re.match(r"^[0-9]{2,3}[A-Z]{0,2}\s", line):
            dropped.append(line)  # a data-shaped line the regex missed
    if dropped:
        raise SystemExit(
            "Unparsed data rows (parser needs updating):\n  "
            + "\n  ".join(dropped)
        )
    return rows


def main():
    rows = parse_rows()

    # Exact MSID index. On the rare duplicate MSID (a school split across levels),
    # a schoolwide row wins so the schoolwide flag is not lost.
    by_msid = {}
    for r in rows:
        key = f"{r['dist']}-{r['school']}"
        cur = by_msid.get(key)
        if cur is None or (r["prog"] == "SW" and cur["prog"] != "SW"):
            by_msid[key] = r

    by_schoolnum = defaultdict(list)
    for r in rows:
        by_schoolnum[r["school"]].append(r)

    # Token rarity across the whole list; a shared token is "distinctive" only
    # when it names few schools statewide.
    token_df = Counter()
    for r in rows:
        for t in set(name_tokens(r["name"])):
            token_df[t] += 1

    def rescue(p):
        """Match a county-coded charter to a charter-LEA row by shared school
        number and a rare shared name token. Returns the TIPA row or None."""
        num = p["msid"].split("-")[1]
        toks = set(name_tokens(p["name"]))
        best, best_score = None, None
        for cand in by_schoolnum.get(num, []):
            shared = toks & set(name_tokens(cand["name"]))
            distinctive = [t for t in shared if token_df[t] <= 8]
            if not distinctive:
                continue
            score = (len(shared), -min(token_df[t] for t in distinctive))
            if best_score is None or score > best_score:
                best, best_score = cand, score
        return best

    geo = json.loads(SCHOOLS_PATH.read_text())
    counts = Counter()
    methods = Counter()
    rescues = []

    for feat in geo["features"]:
        p = feat["properties"]
        msid = p["msid"]
        dist = msid.split("-")[0]

        row = by_msid.get(msid)
        if row:
            title_i, schoolwide, how = "yes", row["prog"] == "SW", "msid"
        else:
            r = rescue(p) if is_charter(p) else None
            if r:
                title_i, schoolwide, how = "yes", r["prog"] == "SW", "rescue"
                rescues.append((msid, p["name"], r["dist"], r["school"], r["name"]))
            elif dist in COVERED and not is_charter(p):
                title_i, schoolwide, how = "no", False, "covered-no"
            else:
                title_i, schoolwide, how = "unknown", False, "unknown"

        p["title_i"] = title_i
        p["title_i_schoolwide"] = schoolwide
        p["title_i_eligible"] = title_i == "yes"  # legacy boolean stays consistent
        counts[title_i] += 1
        methods[how] += 1

    SCHOOLS_PATH.write_text(json.dumps(geo))

    print(f"TIPA 2025-26 rows parsed: {len(rows)} ({len(by_msid)} unique MSIDs)")
    print(f"Schools written: {sum(counts.values())}")
    print(f"  title_i -> yes {counts['yes']}, no {counts['no']}, unknown {counts['unknown']}")
    print(f"  method  -> {dict(methods)}")
    print(f"Cross-LEA charter rescues ({len(rescues)}):")
    for msid, name, cd, cs, cn in sorted(rescues):
        print(f"    {msid}  {name}  ->  {cd}-{cs} {cn}")


if __name__ == "__main__":
    main()
