#!/usr/bin/env python3
"""Parse the FL DOE FISH "Level of Service" reports (per county PDF) and patch
per-school facility capacity onto public/data/schools.sample.geojson.

Why this exists: the FISH Level of Service report is the authoritative source the
statute points to for co-location. For each school it gives:
  - SCHOOL CAPACITY   = total satisfactory student stations (the FUR denominator
                        in Rule 6A-1.0998271(1)(n))
  - TOTAL COFTE       = capital-outlay FTE enrollment (the FUR numerator; the
                        statutory enrollment measure, not NCES headcount)
  - AVAILABLE (SURPLUS) = stations - COFTE (the >=400-station co-location test)

We take capacity + cofte + surplus TOGETHER from the same report per school so
they stay internally consistent (surplus == capacity - cofte). Each county's
per-report vintage is stamped on the school.

Source PDFs (committed under scripts/sources/fish/), all SY2025-26:
  13 Miami-Dade  FISH LOS, reported 2026-04-10
  06 Broward     FISH LOS, reported 2026-04-01
  48 Orange      FISH LOS, reported 2026-04-01

Re-run:  python3 scripts/parse-fish-los.py
Requires: pymupdf (fitz).
"""
import fitz, re, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHOOLS = ROOT / "public" / "data" / "schools.sample.geojson"
SRC = ROOT / "scripts" / "sources" / "fish"
COUNTIES = {
    "13": {"pdf": "fish-los-miami-dade-2026.pdf", "vintage": "FISH Level of Service, Miami-Dade, 2025-26 (reported 2026-04-10)"},
    "06": {"pdf": "fish-los-broward-2526.pdf", "vintage": "FISH Level of Service, Broward, 2025-26 (reported 2026-04-01)"},
    "48": {"pdf": "fish-los-orange-2526.pdf", "vintage": "FISH Level of Service, Orange, 2025-26 (reported 2026-04-01)"},
}
# Confirmed campus renames/reconfigurations where the current FISH facility name
# diverged too far from the tool's (older) school name for token matching. Each
# was verified against the FL DOE membership files: the old name is the SOLE
# bearer of its MSID, and maps 1:1 to a single otherwise-unused FISH row in the
# same county (Broward's 2024-25 -> 2025-26 K-8 conversion wave). Keyed by MSID
# -> exact FISH facility name in the current report. Add here (never loosen the
# fuzzy matcher) when a district renames a campus without moving the building.
ALIASES = {
    "06-0121": "HOLLYWOOD CENTRAL PREPARATORY K-8",           # was Hollywood Central Elementary
    "06-0501": "BROWARD ESTATES EARLY LEARNING AND RESOURCE CENTER",  # was Broward Estates Elementary
    "06-1421": "COCONUT CREEK K-8 ACADEMY OF EXCELLENCE",     # was Coconut Creek Elementary
    "06-1881": "PINES COLLEGIATE ACADEMY 6-12",               # was Pines Middle School
    "06-2011": "CORAL COVE ACADEMY OF THE ARTS",              # was Coral Cove Elementary
    "06-2123": "CYPRESS RUN EDUCATION CENTER",                # was Cypress Run Alternative Center
    "06-3581": "SILVER SHORES STEAM ACADEMY K-8",             # was Silver Shores Elementary
}
BLOCK = {"FLORIDA INVENTORY OF SCHOOL HOUSES (FISH)", "LEVEL OF SERVICE REPORT", "ORGANIZATION:",
    "FACILITY :", "FACILITY:", "ALL", "FACILITY USE:", "FACILITY NAME", "SCHOOL", "CAPACITY", "PERMANENT",
    "DINING", "YEAR ROUND", "UTILIZATION", "FACTOR", "PERCENTAGE", "PRIMARY USE", "PRIMARY", "USE", "TOTAL",
    "COFTE", "AVAILABLE", "(SURPLUS)", "SURPLUS", "13-DADE COUNTY SCHOOL DISTRICT",
    "6-BROWARD COUNTY SCHOOL DISTRICT", "48-ORANGE COUNTY SCHOOL DISTRICT"}
STOP = {"SCHOOL", "THE", "OF", "AT", "FOR", "AND", "CENTER", "CTR"}

def is_num(t):
    t = t.replace(",", "").strip()
    try:
        float(t); return t != ""
    except ValueError:
        return False

def to_num(t):
    return float(t.replace(",", "").strip())

def parse(pdf):
    doc = fitz.open(pdf)
    toks = []
    for pg in doc:
        for ln in pg.get_text().split("\n"):
            s = ln.strip()
            if not s or s.upper() in BLOCK:
                continue
            if re.match(r"^\d{1,2}[:/]\d", s) or re.match(r"^(page|report|printed)\b", s, re.I):
                continue
            toks.append(s)
    # Rejoin school names the PDF wrapped mid-name: a soft hyphen (U+00AD) marks
    # the break point. e.g. "HOLLYWOOD CENTRAL PREPARATORY K\xad" + "8" -> the
    # "8" of "K-8" landed on its own line and would otherwise be read as a
    # capacity number, shifting every column. Merge with a real hyphen so the
    # name still tokenizes the same way for matching ("K-8" -> {K, 8}).
    merged, k = [], 0
    while k < len(toks):
        t = toks[k]
        while t.endswith("­") and k + 1 < len(toks):
            t = t[:-1] + "-" + toks[k + 1]
            k += 1
        merged.append(t.replace("­", "-"))
        k += 1
    toks = merged
    i, n, recs = 0, len(toks), []
    while i < n:
        name = []
        while i < n and not is_num(toks[i]):
            name.append(toks[i]); i += 1
        if i + 6 > n:
            break
        if not all(is_num(x) for x in toks[i:i + 6]):
            i += 1; continue
        # The 6 numeric columns after the name are, in order:
        #   SCHOOL CAPACITY, PERMANENT CAPACITY, DINING CAPACITY, YEAR ROUND
        #   CAPACITY, UTILIZATION FACTOR, PERCENTAGE UTILIZATION.
        # SCHOOL CAPACITY = total student stations (permanent + relocatable) and
        # is the statute's "total student stations" (Rule 6A-1.0998271(1)(n),(f));
        # it is the denominator for the FUR, surplus, and co-location tests.
        # PERMANENT CAPACITY = the permanent building's student stations only
        # (excludes portables); surfaced as a disclosed secondary figure, never
        # used in the statutory tests.
        cap = to_num(toks[i]); perm = to_num(toks[i + 1]); i += 6
        while i < n and not is_num(toks[i]):   # primary use (text, may be multi-word)
            i += 1
        if i + 2 > n:
            break
        cofte = to_num(toks[i]); surplus = to_num(toks[i + 1]); i += 2
        if name:
            recs.append({"name": " ".join(name), "capacity": int(round(cap)),
                         "permanent_capacity": int(round(perm)),
                         "cofte": round(cofte, 1), "surplus": round(surplus, 1)})
    return recs

def toks_of(s):
    s = s.upper().replace("&", " AND ")
    return set(t for t in re.sub(r"[^A-Z0-9]+", " ", s).split() if t and t not in STOP)

def normkey(s):
    return " ".join(sorted(re.sub(r"[^A-Z0-9]+", " ", s.upper()).split()))

def build(recs):
    return [{**r, "tk": toks_of(r["name"]), "nk": normkey(r["name"])} for r in recs]

def best_match(name, cands, used):
    nk = normkey(name)
    for c in cands:
        if c["nk"] == nk and c["name"] not in used:
            return c
    st = toks_of(name)
    if not st:
        return None
    scored = sorted(((len(st & c["tk"]) / (len(st | c["tk"]) or 1), c) for c in cands if c["name"] not in used), key=lambda x: -x[0])
    if not scored:
        return None
    best = scored[0][0]
    second = scored[1][0] if len(scored) > 1 else 0
    if best >= 0.6 and (best - second >= 0.12 or best >= 0.8):
        return scored[0][1]
    return None

def main():
    fish = {}
    for d, cfg in COUNTIES.items():
        recs = parse(SRC / cfg["pdf"])
        fish[d] = build(recs)
        print(f"district {d}: parsed {len(recs)} FISH LOS rows")
    sg = json.loads(SCHOOLS.read_text())
    used = {d: set() for d in fish}
    matched = filled = overwritten = 0
    # Match district-operated schools first (co-location only applies to them),
    # sorted so greedy assignment is deterministic.
    feats = sorted(sg["features"], key=lambda f: f["properties"]["name"])
    for f in feats:
        p = f["properties"]
        d = p["msid"].split("-")[0]
        if d not in fish:
            continue
        alias = ALIASES.get(p["msid"])
        if alias:
            c = next((r for r in fish[d] if r["nk"] == normkey(alias) and r["name"] not in used[d]), None)
        else:
            c = best_match(p["name"], fish[d], used[d])
        if not c:
            continue
        used[d].add(c["name"])
        matched += 1
        if p.get("capacity") is None:
            filled += 1
        elif p.get("capacity") != c["capacity"]:
            overwritten += 1
        p["capacity"] = c["capacity"]                      # total student stations (statutory)
        p["permanent_capacity"] = c["permanent_capacity"]  # permanent building only (disclosed)
        p["cofte"] = c["cofte"]
        p["fish_surplus"] = c["surplus"]
        p["fish_vintage"] = COUNTIES[d]["vintage"]
    payload = json.dumps(sg, indent=2) + "\n"
    SCHOOLS.write_text(payload)
    # Keep the built copy in sync so `vite preview` and the deploy (which serve
    # dist/, not public/) show the refreshed data without a full rebuild.
    dist_copy = ROOT / "dist" / "data" / SCHOOLS.name
    if dist_copy.exists():
        dist_copy.write_text(payload)
    total_cap = sum(1 for f in sg["features"] if f["properties"].get("capacity") is not None)
    perm_cnt = sum(1 for f in sg["features"] if f["properties"].get("permanent_capacity") is not None)
    cofte_cnt = sum(1 for f in sg["features"] if f["properties"].get("cofte") is not None)
    print(f"\nmatched {matched} schools to FISH LOS (filled {filled} null capacities, updated {overwritten} to the LOS figure)")
    print(f"schools with capacity now: {total_cap}/{len(sg['features'])}; permanent_capacity: {perm_cnt}; statutory COFTE: {cofte_cnt}")
    print(f"wrote {SCHOOLS}")

if __name__ == "__main__":
    sys.exit(main())
