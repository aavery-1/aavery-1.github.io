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

Source PDFs (committed under scripts/sources/fish/):
  13 Miami-Dade  FISH LOS, reported 2026-04-10   (current)
  06 Broward     FISH LOS, 2022-23
  48 Orange      FISH LOS, 2023-24

Re-run:  python3 scripts/parse-fish-los.py
Requires: pymupdf (fitz).
"""
import fitz, re, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHOOLS = ROOT / "public" / "data" / "schools.sample.geojson"
SRC = ROOT / "scripts" / "sources" / "fish"
COUNTIES = {
    "13": {"pdf": "fish-los-miami-dade-2026.pdf", "vintage": "FISH Level of Service, Miami-Dade, reported 2026-04-10"},
    "06": {"pdf": "fish-los-broward-2223.pdf", "vintage": "FISH Level of Service, Broward, 2022-23"},
    "48": {"pdf": "fish-los-orange-2324.pdf", "vintage": "FISH Level of Service, Orange, 2023-24"},
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
    i, n, recs = 0, len(toks), []
    while i < n:
        name = []
        while i < n and not is_num(toks[i]):
            name.append(toks[i]); i += 1
        if i + 6 > n:
            break
        if not all(is_num(x) for x in toks[i:i + 6]):
            i += 1; continue
        cap = to_num(toks[i]); i += 6      # cap, permanent, dining, yearround, utilfactor, pct
        while i < n and not is_num(toks[i]):   # primary use (text, may be multi-word)
            i += 1
        if i + 2 > n:
            break
        cofte = to_num(toks[i]); surplus = to_num(toks[i + 1]); i += 2
        if name:
            recs.append({"name": " ".join(name), "capacity": int(round(cap)), "cofte": round(cofte, 1), "surplus": round(surplus, 1)})
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
        c = best_match(p["name"], fish[d], used[d])
        if not c:
            continue
        used[d].add(c["name"])
        matched += 1
        if p.get("capacity") is None:
            filled += 1
        elif p.get("capacity") != c["capacity"]:
            overwritten += 1
        p["capacity"] = c["capacity"]
        p["cofte"] = c["cofte"]
        p["fish_surplus"] = c["surplus"]
        p["fish_vintage"] = COUNTIES[d]["vintage"]
    SCHOOLS.write_text(json.dumps(sg, indent=2) + "\n")
    total_cap = sum(1 for f in sg["features"] if f["properties"].get("capacity") is not None)
    cofte_cnt = sum(1 for f in sg["features"] if f["properties"].get("cofte") is not None)
    print(f"\nmatched {matched} schools to FISH LOS (filled {filled} null capacities, updated {overwritten} to the LOS figure)")
    print(f"schools with capacity now: {total_cap}/{len(sg['features'])}; with statutory COFTE: {cofte_cnt}")
    print(f"wrote {SCHOOLS}")

if __name__ == "__main__":
    sys.exit(main())
