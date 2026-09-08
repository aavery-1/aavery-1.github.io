// Parse the Florida Inventory of School Houses (FISH) facility report into
// per-school capacity, and patch it onto the school points so the tool's
// building-utilization logic (FUR, co-location) runs on real capacity.
//
// Run:  node scripts/parse-fish-capacity.mjs        (from the project root)
//       npm run data:fish
//
// INPUT (already downloaded to the project root): the FISH "summary" workbook
// from FL DOE Office of Educational Facilities. Its `FacilityData` sheet is the
// only school-level source of student stations; it is one row per facility with
// `Total Satisfactory Stations` and `Capacity` (the utilization-adjusted
// permanent capacity the Facility Utilization Rate uses). FL DOE serves these
// files behind Akamai bot detection, so they are downloaded by hand, not fetched.
//
// JOIN: FISH facility numbers are NOT the same identifier as the NCES-derived
// MSID school numbers in schools.sample.geojson (FISH renumbered facilities
// sequentially; NCES kept older spaced school numbers), so a shared number is a
// FALSE match - e.g. FISH 06-0011 is South Broward Senior High while the NCES
// 06-0011 is Deerfield Beach Elementary. We therefore match ONLY on normalized
// school name within the same district, and skip any name that is ambiguous
// (maps to more than one facility) rather than guess. Charters and virtual
// schools are not in the district FISH inventory and are left capacity = null
// (correct: they have no district facility capacity).
//
// OUTPUTS:
//   public/data/fish_capacity.json         (keyed by school MSID; feeds backend)
//   public/data/schools.sample.geojson     (patched: capacity populated in place)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FISH_FILE = resolve(ROOT, "0074722-summary.xls");
const SCHOOLS_FILE = resolve(ROOT, "public", "data", "schools.sample.geojson");
const OUT_FILE = resolve(ROOT, "public", "data", "fish_capacity.json");

// FL DOE district numbers for the three pilot counties.
const DISTRICTS = { 6: "Broward", 13: "Miami-Dade", 48: "Orange" };

// FISH UseDesc values that are actual schools (exclude admin, warehouse, etc.).
const SCHOOL_USES = new Set([
  "ELEMENTARY", "MIDDLE", "SENIOR HIGH", "JUNIOR HIGH", "COMBINATION",
  "EXCEPTIONAL STUDENT", "ALTERNATIVE EDUCATION", "KINDERGARTEN", "PRE-K E S E",
]);

// Normalize a school name for cross-source matching: uppercase, drop punctuation
// and the generic tokens that differ between the two catalogs.
function norm(s) {
  return String(s)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(SCHOOL|SENIOR|CENTER|CENTRE|ELEMENTARY|ELEM|MIDDLE|HIGH|K 8|K8|ACADEMY|EDUCATIONAL|EDUCATION|COMMUNITY|THE|OF|AT)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadFish() {
  const wb = XLSX.readFile(FISH_FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["FacilityData"], { header: 1, blankrows: false });
  const h = rows.findIndex((r) => Array.isArray(r) && r.includes("Total Satisfactory Stations"));
  if (h < 0) throw new Error("FacilityData header row not found (expected 'Total Satisfactory Stations')");
  const H = rows[h];
  const ci = (n) => H.indexOf(n);
  const c = {
    dist: ci("Dist #"), fac: ci("Fac #"), name: ci("Facility"), use: ci("UseDesc"),
    cap: ci("Capacity"), sta: ci("Total Satisfactory Stations"),
  };

  const byMsid = {};                 // "13-0041" -> record
  const nameIndex = {};              // dist -> Map(normName -> record | "AMBIGUOUS")
  for (const d of Object.keys(DISTRICTS)) nameIndex[d] = new Map();

  for (const r of rows.slice(h + 1)) {
    const dist = Number(r[c.dist]);
    if (!DISTRICTS[dist]) continue;
    const use = String(r[c.use]).trim();
    const cap = Number(r[c.cap]);
    if (!SCHOOL_USES.has(use) || !(cap > 0)) continue;
    const msid = `${String(dist).padStart(2, "0")}-${String(r[c.fac]).padStart(4, "0")}`;
    const rec = {
      fish_msid: msid,
      fish_name: String(r[c.name]).trim(),
      capacity: cap,
      satisfactory_stations: Number(r[c.sta]) || null,
      use_desc: use,
      county: DISTRICTS[dist],
    };
    byMsid[msid] = rec;
    const key = norm(rec.fish_name);
    const idx = nameIndex[dist];
    // Keep every FISH record under its normalized name; disambiguation (by the
    // school level vs the facility UseDesc) happens at match time.
    if (idx.has(key)) idx.get(key).push(rec);
    else idx.set(key, [rec]);
  }
  return { byMsid, nameIndex };
}

// Map a school level to the FISH UseDesc values that are consistent with it, so a
// name shared by (say) an elementary and a middle facility resolves to the right
// one instead of being dropped as ambiguous.
const LEVEL_USES = {
  Elementary: new Set(["ELEMENTARY", "KINDERGARTEN", "PRE-K E S E"]),
  Middle: new Set(["MIDDLE", "JUNIOR HIGH"]),
  High: new Set(["SENIOR HIGH"]),
  Combination: new Set(["COMBINATION"]),
  Adult: new Set(["ALTERNATIVE EDUCATION"]),
  Other: new Set(["EXCEPTIONAL STUDENT", "ALTERNATIVE EDUCATION", "COMBINATION"]),
};

function levelCompatible(level, useDesc) {
  const uses = LEVEL_USES[level];
  return uses ? uses.has(useDesc) : true;
}

// Token-set for conservative fuzzy matching (Jaccard over normalized tokens).
function tokens(normName) {
  return new Set(normName.split(" ").filter(Boolean));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function main() {
  const { byMsid, nameIndex } = loadFish();
  console.log(`FISH school facilities (cap>0) in 3 counties: ${Object.keys(byMsid).length}`);

  const schools = JSON.parse(readFileSync(SCHOOLS_FILE, "utf8"));
  const capacityByMsid = {};
  const stats = { exact: 0, disambiguated: 0, fuzzy: 0, ambiguous: 0, unmatched: 0 };
  const FUZZY_MIN = 0.8;

  for (const f of schools.features) {
    const p = f.properties;
    // Reset first: capacity is FISH-derived only, and clears any prior/bad value.
    p.capacity = null;
    delete p.capacity_source;
    // Charters and virtual schools are not in the district FISH inventory; leave
    // them null rather than risk a spurious name collision with a district school.
    if (p.type === "Charter" || p.type === "Virtual") {
      stats.unmatched++;
      continue;
    }

    const dist = Number(String(p.msid).split("-")[0]);
    const idx = nameIndex[dist];
    if (!idx) { stats.unmatched++; continue; }
    const key = norm(p.name);

    let hit = null;
    let matchKind = null;
    const exact = idx.get(key);
    if (exact) {
      if (exact.length === 1) {
        hit = exact[0];
        matchKind = "exact";
      } else {
        // Multiple facilities share this name: pick the one whose UseDesc matches
        // the school level. Only accept when exactly one is level-compatible.
        const compat = exact.filter((r) => levelCompatible(p.level, r.use_desc));
        if (compat.length === 1) { hit = compat[0]; matchKind = "disambiguated"; }
        else { stats.ambiguous++; continue; }
      }
    } else {
      // No exact normalized-name match: conservative token match within district,
      // restricted to level-compatible facilities, accepted only if the single
      // best score clears the threshold and beats the runner-up.
      const st = tokens(key);
      let best = null, bestScore = 0, secondScore = 0;
      for (const recs of idx.values()) {
        for (const r of recs) {
          if (!levelCompatible(p.level, r.use_desc)) continue;
          const score = jaccard(st, tokens(norm(r.fish_name)));
          if (score > bestScore) { secondScore = bestScore; bestScore = score; best = r; }
          else if (score > secondScore) { secondScore = score; }
        }
      }
      if (best && bestScore >= FUZZY_MIN && bestScore > secondScore) {
        hit = best;
        matchKind = "fuzzy";
      } else {
        stats.unmatched++;
        continue;
      }
    }

    p.capacity = hit.capacity;
    p.capacity_source = `FISH May 2026 (${matchKind} name match within district)`;
    stats[matchKind]++;
    capacityByMsid[p.msid] = {
      capacity: hit.capacity,
      satisfactory_stations: hit.satisfactory_stations,
      use_desc: hit.use_desc,
      fish_name: hit.fish_name,
      fish_msid: hit.fish_msid,
      match: matchKind,
    };
  }

  schools.vintage_capacity = "FISH satisfactory student stations, FL DOE, May 2026";
  writeFileSync(SCHOOLS_FILE, JSON.stringify(schools, null, 2) + "\n");

  writeFileSync(OUT_FILE, JSON.stringify({
    vintage: "FISH data reported as satisfactory, May 2026",
    source: "Florida Inventory of School Houses (FISH), FL DOE Office of Educational Facilities",
    source_note: "FacilityData sheet; 'Capacity' is the utilization-adjusted permanent capacity used for the Facility Utilization Rate.",
    join_note: "Keyed by school MSID. Matched to school points by unique normalized name within district (FISH facility numbers are not the NCES MSID); ambiguous names skipped.",
    unit: "students (permanent capacity)",
    schools: capacityByMsid,
  }, null, 2) + "\n");

  const matched = stats.exact + stats.disambiguated + stats.fuzzy;
  console.log(`patched capacity onto ${matched} schools (exact ${stats.exact}, level-disambiguated ${stats.disambiguated}, fuzzy ${stats.fuzzy})`);
  console.log(`skipped still-ambiguous: ${stats.ambiguous}; left null (charters/virtual/renamed): ${stats.unmatched}`);
  console.log(`wrote ${OUT_FILE}`);
  console.log(`patched ${SCHOOLS_FILE}`);
}

main();
