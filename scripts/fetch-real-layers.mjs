// Fetch the real, authoritative data for the layers that shipped without a
// committed sample, and write them to public/data/. Idempotent: rerun any time
// to refresh from source.
//
// Run:  node --env-file=.env scripts/fetch-real-layers.mjs
//       (or: npm run data:layers)
//
// CENSUS_API_KEY is read from the environment (see .env / .env.example). It is a
// BUILD-TIME-ONLY secret: it is used here to call the Census API and is never
// written into any output file or shipped to the browser. The outputs are static
// public-domain GeoJSON/JSON consumed by the front-end adapters.
//
// Layers/datasets produced and their sources:
//   population_growth        U.S. Census Bureau Population Estimates Program (PEP)
//                            Vintage 2024 county totals (births, deaths, net
//                            migration, population) + TIGERweb county geometry +
//                            ACS 2019-2023 under-18 population.
//   opportunity_zones        HUD Opportunity Zones feature service (the spatial
//                            representation of the Treasury/IRS designated QOZ
//                            tracts, 2018 designations, in effect through 2028).
//   legislative_districts    Census TIGERweb: 119th Congressional Districts +
//                            2024 State Legislative Districts (Upper/Lower),
//                            clipped to the three pilot counties.
//   school_enrollment_history NCES Common Core of Data via the Urban Institute
//                            Education Data Portal (annual PK-12 membership).
//   representatives          unitedstates/congress-legislators (current U.S.
//                            House + Senate for Florida). State-legislative and
//                            county-board member names are left null with a
//                            documented source, never fabricated.

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { booleanIntersects } from "@turf/turf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "data");
const TODAY = new Date().toISOString().slice(0, 10);

const CENSUS_API_KEY = process.env.CENSUS_API_KEY;

// Miami-Dade, Broward, Orange.
const COUNTIES = [
  { fips: "086", name: "Miami-Dade" },
  { fips: "011", name: "Broward" },
  { fips: "095", name: "Orange" },
];
const STATE_FIPS = "12";
const COUNTY_BY_FIPS = Object.fromEntries(COUNTIES.map((c) => [STATE_FIPS + c.fips, c.name]));

const UA = {
  "User-Agent": "SoH Siting Tool data-prep (contact avery.aden1@gmail.com)",
  Accept: "application/json",
};

async function getJSON(url, opts = {}) {
  const res = await fetch(url, { headers: UA, redirect: "follow", ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

// ArcGIS query helper (POST form-encoded to keep long WHERE/geometry off the URL).
async function arcgisQuery(layerUrl, params) {
  const body = new URLSearchParams({ f: "geojson", outSR: "4326", ...params });
  const res = await fetch(`${layerUrl}/query`, {
    method: "POST",
    headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${layerUrl}/query`);
  const json = await res.json();
  if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
  return json;
}

function write(name, obj) {
  const path = resolve(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(obj) + "\n");
  const kb = (JSON.stringify(obj).length / 1024).toFixed(0);
  console.log(`  wrote ${name} (${kb} KB)`);
  return path;
}

// ─── County polygons (shared by population_growth and legislative clipping) ──
const TIGER_COUNTY = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1";
async function fetchCountyPolygons() {
  const where = COUNTIES.map((c) => `(STATE='${STATE_FIPS}' AND COUNTY='${c.fips}')`).join(" OR ");
  const fc = await arcgisQuery(TIGER_COUNTY, {
    where,
    outFields: "GEOID,NAME",
    maxAllowableOffset: "0.0003", // ~30 m generalization; keeps files small
  });
  const byGeoid = {};
  for (const f of fc.features) byGeoid[f.properties.GEOID] = f;
  return byGeoid; // { "12086": Feature, ... }
}

// ─── population_growth ───────────────────────────────────────────────────────
const PEP_CSV =
  "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv";

function parseCsvLine(line) {
  // PEP county file has no embedded commas in the fields we read; simple split.
  return line.split(",");
}

async function fetchPopulationGrowth(countyPolys) {
  console.log("population_growth: Census PEP vintage 2024 + ACS under-18…");
  const csv = await getText(PEP_CSV);
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const col = (n) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`PEP CSV missing column ${n}`);
    return i;
  };
  const iState = col("STATE"), iCounty = col("COUNTY");
  const iPop23 = col("POPESTIMATE2023"), iPop24 = col("POPESTIMATE2024");
  const iChg = col("NPOPCHG2024"), iBirths = col("BIRTHS2024"), iDeaths = col("DEATHS2024");
  const iIntl = col("INTERNATIONALMIG2024"), iDom = col("DOMESTICMIG2024"), iNet = col("NETMIG2024");

  const pep = {};
  for (const line of lines.slice(1)) {
    const r = parseCsvLine(line);
    if (r[iState] !== STATE_FIPS) continue;
    const fips = STATE_FIPS + r[iCounty];
    if (!COUNTY_BY_FIPS[fips]) continue;
    const pop23 = +r[iPop23], pop24 = +r[iPop24];
    pep[fips] = {
      pop_2023: pop23,
      pop_2024: pop24,
      population_change: +r[iChg],
      growth_rate: +(( pop24 - pop23) / pop23).toFixed(5),
      births: +r[iBirths],
      deaths: +r[iDeaths],
      natural_increase: +r[iBirths] - +r[iDeaths],
      international_migration: +r[iIntl],
      domestic_migration: +r[iDom],
      net_migration: +r[iNet],
    };
  }

  // ACS 2019-2023 population under 18 (B09001_001E) - real use of the key.
  const under18 = {};
  if (CENSUS_API_KEY) {
    const inClause = COUNTIES.map((c) => c.fips).join(",");
    const acsUrl = `https://api.census.gov/data/2023/acs/acs5?get=B09001_001E&for=county:${inClause}&in=state:${STATE_FIPS}&key=${CENSUS_API_KEY}`;
    const rows = await getJSON(acsUrl);
    for (const row of rows.slice(1)) {
      const [val, st, cty] = row;
      under18[st + cty] = +val;
    }
  } else {
    console.warn("  (no CENSUS_API_KEY set - skipping ACS under-18 enrichment)");
  }

  const features = COUNTIES.map((c) => {
    const fips = STATE_FIPS + c.fips;
    const poly = countyPolys[fips];
    if (!poly) throw new Error(`no county polygon for ${fips}`);
    return {
      type: "Feature",
      geometry: poly.geometry,
      properties: {
        county: c.name,
        county_fips: fips,
        ...pep[fips],
        under_18: under18[fips] ?? null,
      },
    };
  });

  write("population_growth.geojson", {
    type: "FeatureCollection",
    features,
    vintage: "Census PEP Vintage 2024 (2023→2024); ACS 2019-2023 under-18",
    source: "U.S. Census Bureau Population Estimates Program (Vintage 2024) and ACS 5-year",
    source_url: PEP_CSV,
    retrieved: TODAY,
    unit: "annual population growth rate",
  });
}

// ─── opportunity_zones ───────────────────────────────────────────────────────
const HUD_OZ =
  "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/13";
async function fetchOpportunityZones() {
  console.log("opportunity_zones: HUD Opportunity Zones service…");
  const where = COUNTIES.map((c) => `GEOID10 LIKE '${STATE_FIPS}${c.fips}%'`).join(" OR ");
  const fc = await arcgisQuery(HUD_OZ, {
    where,
    outFields: "GEOID10,STATE,COUNTY,TRACT,Rural",
    maxAllowableOffset: "0.0002",
  });
  const features = fc.features.map((f) => {
    const p = f.properties;
    const cfips = STATE_FIPS + p.COUNTY;
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        geoid: p.GEOID10,
        state_fips: p.STATE,
        county_fips: cfips,
        county: COUNTY_BY_FIPS[cfips] ?? null,
        tract: p.TRACT,
        rural: p.Rural === "Y",
        designated: true,
      },
    };
  });
  write("opportunity_zones.geojson", {
    type: "FeatureCollection",
    features,
    vintage: "2018 designations (in effect through 12/31/2028)",
    source: "HUD Opportunity Zones (spatial representation of Treasury/IRS designated QOZ tracts)",
    source_url: "https://hudgis-hud.opendata.arcgis.com/datasets/opportunity-zones",
    retrieved: TODAY,
    unit: "designated (boolean)",
  });
}

// ─── legislative_districts ───────────────────────────────────────────────────
const TIGER_LEG = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer";
const LEG_LAYERS = [
  { id: 4, chamber: "CD", field: "CD119", label: "Congressional District", vintage: "119th Congress" },
  { id: 5, chamber: "SLDU", field: "SLDU", label: "State Senate District", vintage: "2024" },
  { id: 6, chamber: "SLDL", field: "SLDL", label: "State House District", vintage: "2024" },
];
async function fetchLegislative(countyPolys) {
  console.log("legislative_districts: TIGERweb CD + SLDU + SLDL, clipped to counties…");
  const countyFeatures = Object.values(countyPolys);
  const out = [];
  for (const layer of LEG_LAYERS) {
    const fc = await arcgisQuery(`${TIGER_LEG}/${layer.id}`, {
      where: `STATE='${STATE_FIPS}'`,
      outFields: `GEOID,NAME,${layer.field}`,
      maxAllowableOffset: "0.0004",
    });
    let kept = 0;
    for (const f of fc.features) {
      // Keep only districts that actually intersect one of the three counties.
      if (!countyFeatures.some((c) => booleanIntersects(f, c))) continue;
      const num = f.properties[layer.field] ?? f.properties.GEOID?.slice(-3);
      out.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          chamber: layer.chamber,
          district_number: String(num).replace(/^0+/, "") || String(num),
          geoid: f.properties.GEOID,
          name: f.properties.NAME,
          label: `${layer.label} ${String(num).replace(/^0+/, "") || num}`,
        },
      });
      kept++;
    }
    console.log(`  ${layer.chamber}: ${kept} districts intersect the pilot counties`);
  }
  write("legislative.geojson", {
    type: "FeatureCollection",
    features: out,
    vintage: "119th Congressional Districts; 2024 State Legislative Districts",
    source: "U.S. Census Bureau TIGERweb (Legislative)",
    source_url: "https://tigerweb.geo.census.gov/arcgisonline/rest/services/TIGERweb/Legislative/MapServer",
    retrieved: TODAY,
  });
  return out;
}

// ─── school_enrollment_history ───────────────────────────────────────────────
const URBAN = "https://educationdata.urban.org/api/v1/schools/ccd";
// Through 2024-2025 (the latest year Urban's CCD enrollment mirror carries).
const ENROLL_YEARS = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
async function fetchEnrollmentHistory() {
  console.log("school_enrollment_history: NCES CCD via Urban Institute…");
  // 1) ncessch -> seasch(msid) map for the 3 counties (from the current directory).
  const ncesToMsid = {};
  for (const c of COUNTIES) {
    let next = `${URBAN}/directory/2022/?fips=12&county_code=${STATE_FIPS}${c.fips}&limit=2000`;
    while (next) {
      const j = await getJSON(next);
      for (const r of j.results) {
        if (r.seasch) ncesToMsid[r.ncessch] = r.seasch;
      }
      next = j.next;
    }
  }
  const ncesSet = new Set(Object.keys(ncesToMsid));
  console.log(`  ${ncesSet.size} schools mapped ncessch→MSID`);

  // 2) grade-99 (all grades) totals per year, filtered to our schools.
  const byMsid = {}; // msid -> [{year, enrollment}]
  for (const year of ENROLL_YEARS) {
    let next = `${URBAN}/enrollment/${year}/grade-99/?fips=12&race=99&sex=99&limit=10000`;
    let n = 0;
    while (next) {
      const j = await getJSON(next);
      for (const r of j.results) {
        if (!ncesSet.has(r.ncessch)) continue;
        if (typeof r.enrollment !== "number" || r.enrollment < 0) continue;
        const msid = ncesToMsid[r.ncessch];
        (byMsid[msid] ??= []).push({ year: `${year}-${year + 1}`, enrollment: r.enrollment });
        n++;
      }
      next = j.next;
    }
    process.stdout.write(`  ${year}: ${n} records\n`);
  }
  for (const msid of Object.keys(byMsid)) byMsid[msid].sort((a, b) => a.year.localeCompare(b.year));

  write("enrollment_history.json", {
    vintage: `NCES CCD ${ENROLL_YEARS[0]}-${ENROLL_YEARS[ENROLL_YEARS.length - 1] + 1}`,
    source: "NCES Common Core of Data via Urban Institute Education Data Portal",
    source_url: "https://educationdata.urban.org/documentation/schools.html#ccd_enrollment",
    retrieved: TODAY,
    unit: "students (PK-12 membership, all grades)",
    schools: byMsid,
  });

  // Refresh each school point's CURRENT enrollment to the latest observed year,
  // so the front-end utilization read (FUR) uses current membership rather than
  // the older directory snapshot. Only fields touched; capacity etc. preserved.
  const schoolsPath = resolve(OUT_DIR, "schools.sample.geojson");
  const schools = JSON.parse(readFileSync(schoolsPath, "utf8"));
  let patched = 0;
  for (const f of schools.features) {
    const hist = byMsid[f.properties.msid];
    if (!hist || !hist.length) continue;
    const latest = hist[hist.length - 1];
    f.properties.enrollment = latest.enrollment;
    f.properties.enrollment_year = latest.year;
    patched++;
  }
  writeFileSync(schoolsPath, JSON.stringify(schools, null, 2) + "\n");
  console.log(`  refreshed current enrollment on ${patched} school points to latest year`);
}

// ─── representatives ─────────────────────────────────────────────────────────
const LEGISLATORS = "https://unitedstates.github.io/congress-legislators/legislators-current.json";
async function fetchRepresentatives(legFeatures) {
  console.log("representatives: current U.S. House + Senate for Florida…");
  const people = await getJSON(LEGISLATORS);
  const fl = people.filter((p) => {
    const t = p.terms[p.terms.length - 1];
    return t.state === "FL";
  });
  const cdNumbers = new Set(
    legFeatures.filter((f) => f.properties.chamber === "CD").map((f) => f.properties.district_number),
  );
  const byDistrict = {}; // "CD-25" -> {name, party, ...}
  const senators = [];
  for (const p of fl) {
    const t = p.terms[p.terms.length - 1];
    const rec = {
      name: p.name.official_full || `${p.name.first} ${p.name.last}`,
      party: t.party ?? null,
      phone: t.phone ?? null,
      url: t.url ?? null,
      source: "unitedstates/congress-legislators",
    };
    if (t.type === "sen") {
      senators.push({ ...rec, class: t.class ?? null });
    } else if (t.type === "rep" && cdNumbers.has(String(t.district))) {
      byDistrict[`CD-${t.district}`] = rec;
    }
  }

  write("representatives.json", {
    vintage: `Current as of retrieval (${TODAY})`,
    source: "unitedstates/congress-legislators (federal); state & county sources documented below",
    source_url: LEGISLATORS,
    retrieved: TODAY,
    // Federal House members whose district overlaps a pilot county, keyed CD-<n>.
    congressional: byDistrict,
    // Both U.S. Senators are statewide (apply to every school in scope).
    senate: senators,
    // State legislative and county-board member NAMES are deliberately left
    // unpopulated rather than guessed: the authoritative feeds require per-source
    // integration (see notes). District BOUNDARIES are already provided by the
    // legislative_districts layer; only the officeholder names are pending here.
    state_legislative: {},
    board: {},
    notes:
      "State Senate/House member names: OpenStates (openstates.org, API key) or the Florida Senate/House member rosters. County school-board member names: each county's Supervisor of Elections / school board roster (Miami-Dade, Broward, Orange). Populate these tables after each election; do not infer names from district numbers.",
  });
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Fetching real layer data → ${OUT_DIR}\n`);

  const countyPolys = await fetchCountyPolygons();
  console.log(`county polygons: ${Object.keys(countyPolys).length}\n`);

  await fetchPopulationGrowth(countyPolys);
  await fetchOpportunityZones();
  const legFeatures = await fetchLegislative(countyPolys);
  await fetchEnrollmentHistory();
  await fetchRepresentatives(legFeatures);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nfetch-real-layers failed:", err);
  process.exit(1);
});
