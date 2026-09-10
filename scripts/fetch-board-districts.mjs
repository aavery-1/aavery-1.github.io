// Fetch real county school-board member districts (boundaries + member names) and
// write them as one GeoJSON the tool joins to a school by point-in-polygon.
//
// Run:  node scripts/fetch-board-districts.mjs      (from the project root)
//       npm run data:board
//
// SOURCES (authoritative county GIS):
//   Miami-Dade  services.arcgis.com/8Pc9XBTAsYuxx9Ny SchoolBoardDistrict_gdb
//               (9 districts; carries the member name in BRDMBR)
//   Broward     bcgishub.broward.org SOE/SchoolBoardMunicpalDistricts2022 layer 17
//               (7 single-member districts; the 2 at-large seats are countywide and
//               have no polygon; member names from the Broward SOE roster)
//   Orange      services8.arcgis.com/KROpZDerJ9MICPIU School_Board_Districts
//               layer 1 (Orange County Supervisor of Elections GIS; 7 single-
//               member districts; member names from the OCPS board roster). The
//               at-large chair is countywide and has no polygon.
//
// OUTPUT: public/data/board_districts.geojson
//
// The FeatureServer validator requires Polygon geometry, so any MultiPolygon is
// exploded into one Polygon feature per part (same properties); point-in-polygon
// still resolves correctly across the parts.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "public/data/board_districts.geojson");

const MD_URL =
  "https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/SchoolBoardDistrict_gdb/FeatureServer/0/query" +
  "?where=1%3D1&outFields=ID,BRDMBR&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0004&f=geojson";
const BW_URL =
  "https://bcgishub.broward.org/hbm/rest/services/SOE/SchoolBoardMunicpalDistricts2022/FeatureServer/17/query" +
  "?where=1%3D1&outFields=DISTRICT&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0004&f=geojson";
const OR_URL =
  "https://services8.arcgis.com/KROpZDerJ9MICPIU/arcgis/rest/services/School_Board_Districts/FeatureServer/1/query" +
  "?where=1%3D1&outFields=DISTRICT&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0004&f=geojson";

// Current members by district. The county GIS boundaries are current, but its
// embedded member attribute is several cycles stale, so names come from the
// Supervisor-of-Elections rosters instead.
//
// Miami-Dade (9 single-member districts).
const MIAMI_DADE_MEMBERS = {
  1: "Steve Gallon III",
  2: "Dr. Dorothy Bendross-Mindingall",
  3: "Joseph S. Geller",
  4: "Roberto J. Alonso",
  5: "Danny Espino",
  6: 'Maria Teresa "Mari Tere" Rojas',
  7: "Mary Blanco",
  8: "Monica Colucci",
  9: "Luisa Santos",
};

// Broward single-member seats (2024-2026 term; Broward SOE / BCPS roster). The two
// at-large seats (8 Allen Zeman, 9 Debra Hixon) are countywide and have no polygon.
const BROWARD_MEMBERS = {
  1: "Maura McCarthy Bulman",
  2: "Rebecca Thompson",
  3: "Sarah Leonardi",
  4: "Lori Alhadeff",
  5: "Jeff Holness",
  6: "Adam Cervera",
  7: "Nora Rupert",
};

// Orange single-member seats (current OCPS board roster / OCPS "School Map by
// Board Member"). The at-large chair is countywide and has no polygon.
const ORANGE_MEMBERS = {
  1: "Angie Gallo",
  2: "Maria Salamanca",
  3: "Alicia Farrant",
  4: "Anne Douglas",
  5: "Vicki-Elaine Felder",
  6: "Stephanie Vanos",
  7: "Melissa Byrd",
};

async function getGeoJSON(url) {
  const r = await fetch(url);
  const t = await r.text();
  const j = JSON.parse(t);
  if (!j.features) throw new Error(`no features from ${url.slice(0, 80)}: ${t.slice(0, 120)}`);
  return j;
}

// Explode a feature into one Polygon feature per part.
function toPolygons(geometry, properties) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [{ type: "Feature", properties, geometry }];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((coords) => ({
      type: "Feature",
      properties,
      geometry: { type: "Polygon", coordinates: coords },
    }));
  }
  return [];
}

async function main() {
  const out = [];

  // Miami-Dade
  const md = await getGeoJSON(MD_URL);
  for (const f of md.features) {
    const p = f.properties || {};
    const d = Number(String(p.ID).trim());
    const props = {
      county: "Miami-Dade",
      county_fips: "12086",
      district_number: String(d),
      member_name: MIAMI_DADE_MEMBERS[d] ?? null,
      source: "Miami-Dade County GIS boundaries; member names from Supervisor of Elections roster",
      source_url: "https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/SchoolBoardDistrict_gdb/FeatureServer/0",
    };
    out.push(...toPolygons(f.geometry, props));
  }

  // Broward
  const bw = await getGeoJSON(BW_URL);
  for (const f of bw.features) {
    const p = f.properties || {};
    const d = Number(p.DISTRICT);
    const props = {
      county: "Broward",
      county_fips: "12011",
      district_number: String(d),
      member_name: BROWARD_MEMBERS[d] ?? null,
      source: "Broward County GIS / Supervisor of Elections (School Board Districts 2022)",
      source_url: "https://bcgishub.broward.org/hbm/rest/services/SOE/SchoolBoardMunicpalDistricts2022/FeatureServer/17",
    };
    out.push(...toPolygons(f.geometry, props));
  }

  // Orange
  const or = await getGeoJSON(OR_URL);
  for (const f of or.features) {
    const p = f.properties || {};
    const d = Number(String(p.DISTRICT).trim());
    const props = {
      county: "Orange",
      county_fips: "12095",
      district_number: String(d),
      member_name: ORANGE_MEMBERS[d] ?? null,
      source: "Orange County Supervisor of Elections GIS (School Board Districts); member names from OCPS board roster",
      source_url: "https://services8.arcgis.com/KROpZDerJ9MICPIU/arcgis/rest/services/School_Board_Districts/FeatureServer/1",
    };
    out.push(...toPolygons(f.geometry, props));
  }

  const fc = {
    type: "FeatureCollection",
    vintage: "Miami-Dade + Broward + Orange, current board members (Orange from OCSOE School Board Districts GIS)",
    features: out,
  };
  writeFileSync(OUT, JSON.stringify(fc));

  const byCounty = {};
  for (const f of out) byCounty[f.properties.county] = (byCounty[f.properties.county] || 0) + 1;
  console.log("Board district polygons written:", out.length, JSON.stringify(byCounty));
  console.log("Output:", OUT);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
