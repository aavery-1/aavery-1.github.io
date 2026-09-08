// Deterministic generator for the committed sample data in public/data/.
// Run with: node scripts/generate-sample-data.mjs
//
// Why a generator and not hand-written JSON: it guarantees cross-file
// consistency. The MSIDs in grades.sample.json are exactly the MSIDs in
// schools.sample.geojson, and each school's denormalized board_district is
// computed from the polygon it actually falls inside, so the spatial join in
// the inspector and the denormalized value can never disagree.
//
// The output files are committed. This script is documented, not part of the
// app runtime. Coordinates are WGS84 (EPSG:4326), longitude first.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "data");
mkdirSync(outDir, { recursive: true });

// Rough county bounding polygons. These are intentionally coarse: they exist to
// exercise point-in-county validation on the sample, not to be authoritative
// county boundaries. The app imports the identical numbers from
// src/geo/countyBounds.ts so validation and generation never drift.
const COUNTY_BBOX = {
  "Miami-Dade": { west: -80.5, east: -80.12, south: 25.5, north: 25.95, fips: "12086" },
  Broward: { west: -80.35, east: -80.1, south: 26.05, north: 26.35, fips: "12011" },
  Orange: { west: -81.55, east: -81.15, south: 28.4, north: 28.7, fips: "12095" },
};

function ring(west, south, east, north) {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

function pointInRect(lon, lat, r) {
  return lon >= r.west && lon <= r.east && lat >= r.south && lat <= r.north;
}

// Miami-Dade board districts: a 4-way quadrant partition of the county bbox.
// The real county has nine board districts; the sample uses a simplified
// partition to exercise the spatial join without hand-authoring nine polygons.
function miamiDadeBoardDistricts() {
  const b = COUNTY_BBOX["Miami-Dade"];
  const lonMid = (b.west + b.east) / 2;
  const latMid = (b.south + b.north) / 2;
  const quads = [
    { district: "1", west: b.west, east: lonMid, south: latMid, north: b.north },
    { district: "2", west: lonMid, east: b.east, south: latMid, north: b.north },
    { district: "3", west: b.west, east: lonMid, south: b.south, north: latMid },
    { district: "4", west: lonMid, east: b.east, south: b.south, north: latMid },
  ];
  return quads.map((q) => ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring(q.west, q.south, q.east, q.north)] },
    properties: {
      county: "Miami-Dade",
      county_fips: b.fips,
      district_number: q.district,
      member_name: null,
      source: "Miami-Dade County GIS (sample, simplified quadrant partition)",
      source_url: null,
    },
  }));
}

const MD_DISTRICTS = miamiDadeBoardDistricts();

function miamiDadeDistrictFor(lon, lat) {
  for (const f of MD_DISTRICTS) {
    const r = f.geometry.coordinates[0];
    const west = r[0][0];
    const south = r[0][1];
    const east = r[2][0];
    const north = r[2][1];
    if (pointInRect(lon, lat, { west, east, south, north })) {
      return f.properties.district_number;
    }
  }
  return "1";
}

// Explicit school list. Coordinates are placed well inside each county bbox so
// the containment check is unambiguous near the Miami-Dade / Broward border.
// Grades span the full domain including I, NR, and NG to prove the encoding.
const schoolsRaw = [
  // Miami-Dade (12086)
  ["13-3001", "Miami Central Senior High School", "High", "Traditional", null, "Miami-Dade", -80.22, 25.85, "B", 2103, 2400, "1781 NW 95th St, Miami, FL 33147"],
  ["13-0161", "Coral Reef Senior High School", "High", "Magnet", null, "Miami-Dade", -80.34, 25.6, "A", 3128, 3200, "10101 SW 152nd St, Miami, FL 33157"],
  ["13-1581", "Miami Beach Senior High School", "High", "Traditional", null, "Miami-Dade", -80.14, 25.79, "B", 2650, 2800, "2231 Prairie Ave, Miami Beach, FL 33139"],
  ["13-2701", "Booker T. Washington Senior High", "High", "Traditional", null, "Miami-Dade", -80.21, 25.79, "C", 1180, 1500, "1200 NW 6th Ave, Miami, FL 33136"],
  ["13-6011", "Doral Academy Charter High School", "High", "Charter", "Academica", "Miami-Dade", -80.35, 25.82, "A", 1420, 1500, "11100 NW 27th St, Doral, FL 33172"],
  ["13-0201", "Homestead Senior High School", "High", "Traditional", null, "Miami-Dade", -80.47, 25.55, "C", 2260, 2500, "2351 SE 12th Ave, Homestead, FL 33035"],
  ["13-3311", "Norland Senior High School", "High", "Traditional", null, "Miami-Dade", -80.21, 25.93, "F", 1560, 1800, "1050 NW 195th St, Miami Gardens, FL 33169"],
  ["13-4501", "iPrep Academy", "Combination", "Magnet", null, "Miami-Dade", -80.19, 25.78, "A", 640, 700, "1500 Biscayne Blvd, Miami, FL 33132"],
  ["13-9001", "Everglades Adult Learning Center", "Adult", "Alternative", null, "Miami-Dade", -80.44, 25.62, "NR", null, null, "Sample adult center, Miami-Dade"],
  ["13-7701", "South Dade Newcomer Center", "Combination", "Alternative", null, "Miami-Dade", -80.4, 25.53, "I", 210, 400, "Sample newcomer center, Homestead"],

  // Broward (12011)
  ["06-0341", "Fort Lauderdale High School", "High", "Traditional", null, "Broward", -80.14, 26.14, "B", 2410, 2600, "1600 NE 4th Ave, Fort Lauderdale, FL 33305"],
  ["06-1721", "Cypress Bay High School", "High", "Traditional", null, "Broward", -80.32, 26.09, "A", 4600, 4600, "18600 Vista Park Blvd, Weston, FL 33332"],
  ["06-0521", "Dillard High School", "High", "Magnet", null, "Broward", -80.17, 26.16, "C", 2000, 2400, "2501 NW 11th St, Fort Lauderdale, FL 33311"],
  ["06-2201", "Pompano Beach High School", "High", "Magnet", null, "Broward", -80.12, 26.24, "A", 1180, 1300, "600 NE 13th Ave, Pompano Beach, FL 33060"],
  ["06-6101", "Somerset Academy Charter High", "High", "Charter", "Academica", "Broward", -80.28, 26.07, "B", 1350, 1450, "20351 Sheridan St, Pembroke Pines, FL 33332"],
  ["06-0891", "Coral Springs High School", "High", "Traditional", null, "Broward", -80.27, 26.27, "C", 2500, 2700, "7201 W Sample Rd, Coral Springs, FL 33065"],
  ["06-1101", "Hollywood Hills High School", "High", "Traditional", null, "Broward", -80.17, 26.06, "D", 1900, 2200, "5400 Stirling Rd, Hollywood, FL 33021"],
  ["06-3301", "Deerfield Beach High School", "High", "Traditional", null, "Broward", -80.13, 26.32, "C", 2600, 2800, "910 SW 15th St, Deerfield Beach, FL 33441"],
  ["06-9101", "Broward Virtual School", "Combination", "Virtual", null, "Broward", -80.25, 26.19, "NR", 890, null, "Sample virtual school, Broward"],
  ["06-7001", "Innovation Prep Charter (new)", "Elementary", "Charter", "Charter Schools USA", "Broward", -80.3, 26.3, "NG", 320, 600, "Sample new charter, Coral Springs"],

  // Orange (12095)
  ["48-0431", "Boone High School", "High", "Traditional", null, "Orange", -81.37, 28.51, "A", 2900, 3000, "1000 E Kaley St, Orlando, FL 32806"],
  ["48-0521", "Edgewater High School", "High", "Magnet", null, "Orange", -81.4, 28.58, "B", 2600, 2700, "3100 Edgewater Dr, Orlando, FL 32804"],
  ["48-0611", "Dr. Phillips High School", "High", "Traditional", null, "Orange", -81.49, 28.45, "A", 3600, 3600, "6500 Turkey Lake Rd, Orlando, FL 32819"],
  ["48-0711", "Jones High School", "High", "Traditional", null, "Orange", -81.4, 28.54, "C", 1400, 1800, "801 S Rio Grande Ave, Orlando, FL 32805"],
  ["48-6001", "Orlando Science Charter High", "High", "Charter", "Orlando Science Schools", "Orange", -81.44, 28.62, "A", 900, 950, "2226 Lake Weston Dr, Orlando, FL 32810"],
  ["48-0821", "Colonial High School", "High", "Traditional", null, "Orange", -81.28, 28.55, "C", 3100, 3300, "6100 Oleander Dr, Orlando, FL 32807"],
  ["48-0911", "Oak Ridge High School", "High", "Traditional", null, "Orange", -81.42, 28.47, "D", 2400, 2600, "700 W Oak Ridge Rd, Orlando, FL 32809"],
  ["48-1001", "Winter Park High School", "High", "Traditional", null, "Orange", -81.35, 28.6, "B", 3300, 3400, "2100 Summerfield Rd, Winter Park, FL 32792"],
  ["48-9101", "Orange Adult Education Center", "Adult", "Alternative", null, "Orange", -81.33, 28.53, "NR", null, null, "Sample adult center, Orange"],
  ["48-7001", "Lake Nona Prep Charter (new)", "Combination", "Charter", "Academica", "Orange", -81.24, 28.42, "NG", 410, 900, "Sample new charter, Lake Nona"],
];

function schoolFeature(row) {
  const [msid, name, level, type, operator, county, lon, lat, grade, enrollment, capacity, address] = row;
  const bbox = COUNTY_BBOX[county];
  const board_district = county === "Miami-Dade" ? miamiDadeDistrictFor(lon, lat) : null;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      msid,
      name,
      level,
      type,
      operator,
      county,
      county_fips: bbox.fips,
      board_district,
      current_grade: grade,
      current_grade_year: "2024-2025",
      enrollment,
      enrollment_year: "2024-2025",
      capacity,
      address,
      geocode_source: "NCES EDGE 2023-2024 (sample)",
    },
  };
}

const schools = {
  type: "FeatureCollection",
  features: schoolsRaw.map(schoolFeature),
};

// Historic grades. Every school gets a plausible multi-year history keyed by
// MSID. formula_change_years drive the inspector timeline dividers. At least one
// school (13-3001) spans a formula-change year with a grade on both sides.
const FORMULA_CHANGE_YEARS = ["2009-2010", "2011-2012", "2014-2015", "2021-2022"];

const YEARS = [
  "2015-2016",
  "2016-2017",
  "2017-2018",
  "2018-2019",
  "2019-2020",
  "2020-2021",
  "2021-2022",
  "2022-2023",
  "2023-2024",
  "2024-2025",
];

// Deterministic pseudo-history: walk grades around the current grade, and honor
// the COVID NG years (2019-2020, 2020-2021) the way FL DOE actually issued them.
const GRADE_LADDER = ["F", "D", "C", "B", "A"];

function historyFor(msid, current) {
  // Non-standard current grades keep their special value across recent years and
  // are not coerced into the A-F ladder.
  const nonStandard = ["I", "NR", "NG"].includes(current);
  const out = [];
  let idx = GRADE_LADDER.indexOf(current);
  if (idx < 0) idx = 2; // center of the ladder for non-standard schools
  // seed a deterministic offset from the MSID so histories vary but are stable
  const seed = msid.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  YEARS.forEach((year, i) => {
    if (year === "2019-2020" || year === "2020-2021") {
      out.push({ year, grade: "NG" }); // COVID years: no grades issued
      return;
    }
    if (nonStandard && i >= YEARS.length - 3) {
      out.push({ year, grade: current });
      return;
    }
    const wobble = ((seed + i) % 3) - 1; // -1, 0, or 1
    let g = GRADE_LADDER[Math.max(0, Math.min(GRADE_LADDER.length - 1, idx + wobble))];
    if (year === "2024-2025" && !nonStandard) g = current; // land on the current grade
    out.push({ year, grade: g });
  });
  return out;
}

const grades = {
  vintage: "2015-2016 through 2024-2025 (sample subset)",
  formula_change_years: FORMULA_CHANGE_YEARS,
  schools: Object.fromEntries(schoolsRaw.map(([msid, , , , , , , , grade]) => [msid, historyFor(msid, grade)])),
};

// Income choropleth: a grid of small square tracts per county with plausible
// GEOIDs and ACS-style values. ~13 tracts per county, ~39 total.
function incomeTractsForCounty(county, cols, rows, incomeBase) {
  const b = COUNTY_BBOX[county];
  const dLon = (b.east - b.west) / cols;
  const dLat = (b.north - b.south) / rows;
  const feats = [];
  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const west = b.west + c * dLon;
      const south = b.south + r * dLat;
      const east = west + dLon;
      const north = south + dLat;
      const tractCode = String(100 + n).padStart(4, "0") + "00"; // e.g. 010100
      const geoid = b.fips + tractCode;
      // deterministic income spread across the grid
      const income = incomeBase + (c * 9000 + r * 6500) - (n % 3) * 4000;
      const population = 3200 + ((n * 37) % 1800);
      const schoolAge = Math.round(population * 0.17);
      feats.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring(west, south, east, north)] },
        properties: {
          geoid,
          state_fips: "12",
          county_fips: b.fips,
          tract: (tractCode.slice(0, 4) + "." + tractCode.slice(4)).replace(/^0+(?=\d)/, ""),
          median_household_income: income,
          moe: 3200 + ((n * 53) % 2600),
          population,
          school_age_population: schoolAge,
        },
      });
      n++;
    }
  }
  return feats;
}

const income = {
  type: "FeatureCollection",
  vintage: "ACS 2019-2023 (5-year)",
  features: [
    ...incomeTractsForCounty("Miami-Dade", 4, 4, 41000),
    ...incomeTractsForCounty("Broward", 4, 4, 52000),
    ...incomeTractsForCounty("Orange", 4, 4, 47000),
  ],
};

const boardDistricts = {
  type: "FeatureCollection",
  vintage: "As of 2022 redistricting (sample, Miami-Dade only, simplified)",
  features: MD_DISTRICTS,
};

// Flood zones: at least one AE, one VE, one X coastal in Miami-Dade/Broward,
// plus one inland X in Orange for contrast.
function floodFeature(zone, subtype, is_sfha, bfe, west, south, east, north, effective) {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring(west, south, east, north)] },
    properties: {
      zone_code: zone,
      subtype,
      is_sfha,
      bfe,
      source: "FEMA NFHL (sample)",
      effective_date: effective,
    },
  };
}

const flood = {
  type: "FeatureCollection",
  vintage: "NFHL as of latest county effective date (sample)",
  features: [
    floodFeature("VE", "Coastal high hazard (wave action)", true, 12, -80.135, 25.76, -80.12, 25.8, "2020-09-11"),
    floodFeature("AE", "1% annual chance flood", true, 8, -80.16, 25.76, -80.135, 25.82, "2020-09-11"),
    floodFeature("X", "0.2% annual chance / minimal hazard", false, null, -80.22, 25.82, -80.18, 25.88, "2020-09-11"),
    floodFeature("AE", "1% annual chance flood", true, 7, -80.13, 26.12, -80.11, 26.18, "2019-08-18"),
    floodFeature("X", "Minimal flood hazard (inland)", false, null, -81.4, 28.5, -81.34, 28.56, "2021-06-30"),
  ],
};

// Isochrones: one 15-minute driving isochrone per county, a rough blob around a
// representative school. In production these come from ORS or Valhalla; here the
// polygon and population_within are precomputed and committed.
function isoBlob(lon, lat, rLon, rLat) {
  // an 8-point rough polygon, deliberately not a perfect circle
  const pts = [
    [lon, lat + rLat],
    [lon + rLon * 0.75, lat + rLat * 0.6],
    [lon + rLon, lat],
    [lon + rLon * 0.7, lat - rLat * 0.7],
    [lon, lat - rLat],
    [lon - rLon * 0.7, lat - rLat * 0.6],
    [lon - rLon, lat],
    [lon - rLon * 0.75, lat + rLat * 0.65],
  ];
  pts.push(pts[0]);
  return [pts];
}

function isoFeature(msid, lon, lat, rLon, rLat, pop) {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: isoBlob(lon, lat, rLon, rLat) },
    properties: {
      origin_msid: msid,
      origin_lon: lon,
      origin_lat: lat,
      mode: "driving",
      minutes: 15,
      computed_at: "2025-11-01T14:00:00Z",
      population_within: pop,
    },
  };
}

const isochrone = {
  type: "FeatureCollection",
  vintage: "OSM snapshot 2025-11-01 via ORS (sample)",
  features: [
    isoFeature("13-3001", -80.22, 25.85, 0.09, 0.075, 142000),
    isoFeature("06-0341", -80.14, 26.14, 0.1, 0.08, 118000),
    isoFeature("48-0431", -81.37, 28.51, 0.11, 0.09, 96000),
  ],
};

function write(name, obj) {
  writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + "\n");
  const count = obj.features ? obj.features.length : Object.keys(obj.schools || {}).length;
  console.log("wrote", name, "(" + count + " records)");
}

write("schools.sample.geojson", schools);
write("grades.sample.json", grades);
write("income.sample.geojson", income);
write("board_districts.sample.geojson", boardDistricts);
write("flood.sample.geojson", flood);
write("isochrone.sample.geojson", isochrone);
console.log("done");
