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
//   Orange      OCPS publishes board-member districts only as a PDF map, with no
//               open GeoJSON/FeatureServer, so Orange boundaries are not included.
//               This is recorded as a known gap rather than approximated.
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

  const fc = {
    type: "FeatureCollection",
    vintage: "Miami-Dade + Broward, current board members (Orange boundaries unavailable as open GIS)",
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
