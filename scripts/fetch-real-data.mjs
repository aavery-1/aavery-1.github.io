// Fetch real school directory data from authoritative sources and write it to
// public/data/. Idempotent: rerun any time to refresh from source.
//
// Sources:
//   - National Center for Education Statistics (NCES) Common Core of Data
//     (CCD) via the Urban Institute Education Data Portal API. Public, no key
//     required, mirrors the authoritative federal directory. See:
//     https://educationdata.urban.org/documentation/schools.html#ccd_directory
//
// What this pulls (and does not pull):
//   - Pulls: school name, NCES ID, state ID (matches FL DOE MSID format),
//     rooftop lat/lng, level, type (traditional / charter / magnet), address,
//     enrollment, Title I status, county FIPS.
//   - Does NOT pull: current FL DOE letter grade or historic grades. Those
//     ship as .xlsx behind Akamai bot detection at fldoe.org and require a
//     manual export or a headed-browser fetch. Schools appear with grade "NR"
//     (Not Rated) until FL DOE grade data is wired in separately.
//   - Does NOT pull: building capacity. Only FL DOE reports capacity; same
//     data-source constraint as grades.
//
// Target counties: Miami-Dade (12086), Broward (12011), Orange (12095).

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "data");

const YEAR = 2022; // most recent year covered by Urban's mirror at time of fetch
const COUNTY_FIPS = new Set(["12086", "12011", "12095"]); // Miami-Dade, Broward, Orange
const COUNTY_NAME = {
  "12086": "Miami-Dade",
  "12011": "Broward",
  "12095": "Orange",
};

const LEVEL_MAP = {
  1: "Elementary",
  2: "Middle",
  3: "High",
  4: "Combination",
  5: "Other", // ungraded
  6: "Adult",
};

// CCD school_type: 1 Regular, 2 Special Ed, 3 Vocational, 4 Alternative,
// with charter/magnet as separate boolean flags.
function inferType(row) {
  if (row.charter === 1) return "Charter";
  if (row.magnet === 1) return "Magnet";
  if (row.virtual === 1) return "Virtual";
  if (row.school_type === 4) return "Alternative";
  if (row.school_type === 1) return "Traditional";
  return "Other";
}

async function fetchAllFloridaSchools() {
  const url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/${YEAR}/?fips=12&limit=2000`;
  const rows = [];
  let next = url;
  let page = 0;
  while (next) {
    page++;
    process.stdout.write(`  page ${page}... `);
    const res = await fetch(next, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Hope Siting Tool fetch script; contact avery.aden1@gmail.com)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) throw new Error(`Urban Institute API returned ${res.status} for ${next}`);
    const json = await res.json();
    rows.push(...json.results);
    process.stdout.write(`${json.results.length} rows (total ${rows.length}/${json.count})\n`);
    next = json.next;
  }
  return rows;
}

function toSchoolFeature(row) {
  const county = COUNTY_NAME[row.county_code];
  const level = LEVEL_MAP[row.school_level] ?? "Other";
  const type = inferType(row);
  const address = [row.street_location, row.city_location, row.state_location, row.zip_location]
    .filter(Boolean)
    .join(", ");
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
    properties: {
      // Use state-assigned school id (matches FL DOE MSID format like "13-3001").
      // Falls back to the 12-digit NCES id if the state id is missing.
      msid: row.seasch || row.ncessch,
      name: titleCase(row.school_name),
      level,
      type,
      operator: row.lea_name ? titleCase(row.lea_name) : null,
      county,
      county_fips: row.county_code,
      board_district: null, // needs county-level SOE data
      // Grade data pending FL DOE integration; render as NR (Not Rated).
      current_grade: "NR",
      current_grade_year: `${YEAR}-${YEAR + 1}`,
      enrollment: typeof row.enrollment === "number" && row.enrollment > 0 ? row.enrollment : null,
      enrollment_year: `${YEAR}-${YEAR + 1}`,
      // Capacity data pending FL DOE integration.
      capacity: null,
      // Title I eligibility is a factor in SoH siting: hope schools must be
      // Title I eligible per F.S. 1002.333. Store it so the tool can filter
      // and the inspector can surface it.
      title_i_eligible: row.title_i_eligible === 1 || row.title_i_status != null,
      title_i_schoolwide: row.title_i_schoolwide === 1,
      address,
      geocode_source: `NCES CCD ${YEAR}-${YEAR + 1}`,
    },
  };
}

function titleCase(s) {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/(^|\s)k-(\d+)/gi, (m) => m.toUpperCase());
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("Fetching Florida schools from NCES CCD via Urban Institute API...");
  const all = await fetchAllFloridaSchools();
  console.log(`  fetched ${all.length} total Florida schools\n`);

  const inScope = all.filter(
    (r) =>
      COUNTY_FIPS.has(r.county_code) &&
      typeof r.latitude === "number" &&
      typeof r.longitude === "number" &&
      r.school_status === 1, // open
  );
  console.log(`Filtered to 3 target counties + open + geocoded: ${inScope.length} schools`);
  const byCounty = {};
  for (const r of inScope) byCounty[r.county_code] = (byCounty[r.county_code] || 0) + 1;
  for (const fips of Object.keys(byCounty)) {
    console.log(`  ${COUNTY_NAME[fips]} (${fips}): ${byCounty[fips]}`);
  }

  const features = inScope.map(toSchoolFeature);

  const out = {
    type: "FeatureCollection",
    features,
    // Non-standard members below (permitted by GeoJSON) carry provenance.
    vintage: `NCES CCD ${YEAR}-${YEAR + 1}, retrieved ${new Date().toISOString().slice(0, 10)}`,
    source: "NCES Common Core of Data via Urban Institute Education Data Portal",
    source_url: "https://educationdata.urban.org/documentation/schools.html#ccd_directory",
    notes:
      "School locations, names, enrollment, and Title I status are real. FL DOE letter grade and building capacity data are not yet wired in; those fields render as NR / null.",
  };

  const outPath = resolve(OUT_DIR, "schools.sample.geojson");
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${outPath}`);
  console.log(`  ${features.length} features, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);

  // Overwrite the grades sample too: keep the vintage and formula-change
  // years, but empty the schools map. When FL DOE data lands, this file gets
  // populated with real historic grades keyed by seasch.
  const gradesPath = resolve(OUT_DIR, "grades.sample.json");
  const emptyGrades = {
    vintage: "Pending FL DOE integration",
    source: "Florida Department of Education, School Grades files",
    source_url: "https://www.fldoe.org/accountability/accountability-reporting/school-grades/",
    notes:
      "The FL DOE School Grades files ship as .xlsx behind Akamai bot detection at fldoe.org. Wiring them in requires a manual export or a headed-browser fetch. Until then, every school renders with current_grade = NR and an empty history.",
    formula_change_years: ["2009-2010", "2011-2012", "2014-2015", "2021-2022"],
    schools: {},
  };
  writeFileSync(gradesPath, JSON.stringify(emptyGrades, null, 2) + "\n");
  console.log(`Wrote ${gradesPath} (empty; FL DOE integration pending)`);
}

main().catch((err) => {
  console.error("\nFetch failed:", err);
  process.exit(1);
});
