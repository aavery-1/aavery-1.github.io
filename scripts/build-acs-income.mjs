// Builds public/data/income.geojson from REAL American Community Survey data,
// replacing the synthetic 4x4 sample grid. Median household income (B19013) and
// a school-age proxy (B09001, population under 18) come from the Census ACS
// 5-year API; tract polygons come from Census TIGERweb (2020-vintage tracts,
// which match the ACS 2019-2023 5-year GEOIDs). Joined on the 11-digit GEOID.
//
// Requires a Census API key in .env (CENSUS_API_KEY). Run:
//   node --env-file=.env scripts/build-acs-income.mjs
//
// Output matches src/data/types.ts IncomeProps and passes validateIncome
// (geometry is emitted as a single Polygon: for multipart tracts we keep the
// largest part, which carries the populated land area a school would sit in).

import { writeFileSync } from "node:fs";

const COUNTIES = { "086": "Miami-Dade", "011": "Broward", "095": "Orange" };
const KEY = process.env.CENSUS_API_KEY || "";
const ACS_YEAR = "2023"; // ACS 2019-2023 5-year
const TIGER_LAYER = 10;  // TIGERweb Tracts_Blocks: "Census Tracts" (Census 2020 group)

// Census uses large negative sentinels for "no data" / suppressed estimates.
const clean = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > -1e8 ? n : null;
};

async function fetchAcs() {
  const vars = "B19013_001E,B19013_001M,B01003_001E,B09001_001E";
  const url =
    `https://api.census.gov/data/${ACS_YEAR}/acs/acs5?get=${vars}` +
    `&for=tract:*&in=state:12+county:${Object.keys(COUNTIES).join(",")}` +
    (KEY ? `&key=${KEY}` : "");
  const rows = await (await fetch(url)).json();
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const byGeoid = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const geoid = r[idx.state] + r[idx.county] + r[idx.tract];
    byGeoid.set(geoid, {
      median_household_income: clean(r[idx.B19013_001E]),
      moe: clean(r[idx.B19013_001M]),
      population: clean(r[idx.B01003_001E]) ?? 0,
      school_age_population: clean(r[idx.B09001_001E]) ?? 0,
      state_fips: r[idx.state],
      county_fips: r[idx.state] + r[idx.county],
      tract: r[idx.tract],
    });
  }
  return byGeoid;
}

// Ring area (shoelace, planar; only used to pick the largest part).
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

// Reduce any geometry to a single GeoJSON Polygon (largest part, with its holes).
function toPolygon(geom) {
  if (!geom) return null;
  if (geom.type === "Polygon") return geom;
  if (geom.type === "MultiPolygon") {
    let best = null, bestArea = -1;
    for (const poly of geom.coordinates) {
      const area = ringArea(poly[0]);
      if (area > bestArea) { bestArea = area; best = poly; }
    }
    return best ? { type: "Polygon", coordinates: best } : null;
  }
  return null;
}

async function fetchTractGeom(countyFips) {
  const base =
    `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/${TIGER_LAYER}/query`;
  const where = encodeURIComponent(`STATE='12' AND COUNTY='${countyFips}'`);
  const out = [];
  let offset = 0;
  for (;;) {
    const url =
      `${base}?where=${where}&outFields=GEOID&returnGeometry=true` +
      `&maxAllowableOffset=0.0004&geometryPrecision=6&outSR=4326&f=geojson` +
      `&resultOffset=${offset}&resultRecordCount=1000`;
    const d = await (await fetch(url)).json();
    const feats = d.features || [];
    out.push(...feats);
    if (feats.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const acs = await fetchAcs();
console.error(`ACS tracts: ${acs.size}`);

const features = [];
let withGeom = 0, withIncome = 0;
for (const [countyFips, countyName] of Object.entries(COUNTIES)) {
  const geoms = await fetchTractGeom(countyFips);
  console.error(`${countyName}: ${geoms.length} tract polygons`);
  for (const g of geoms) {
    const geoid = g.properties.GEOID;
    const a = acs.get(geoid);
    if (!a) continue;
    const poly = toPolygon(g.geometry);
    if (!poly) continue;
    withGeom++;
    if (a.median_household_income != null) withIncome++;
    features.push({
      type: "Feature",
      geometry: poly,
      properties: {
        geoid,
        state_fips: a.state_fips,
        county_fips: a.county_fips,
        tract: a.tract,
        county: countyName,
        median_household_income: a.median_household_income,
        moe: a.moe,
        population: a.population,
        school_age_population: a.school_age_population,
      },
    });
  }
}

const out = {
  type: "FeatureCollection",
  vintage: "ACS 2019-2023 5-year (B19013, B09001); TIGERweb 2020 tracts",
  source: "U.S. Census Bureau ACS 5-year API + TIGERweb",
  features,
};
writeFileSync("public/data/income.geojson", JSON.stringify(out));
console.error(`\nWrote ${features.length} tracts (${withIncome} with a median-income value) to public/data/income.geojson`);
