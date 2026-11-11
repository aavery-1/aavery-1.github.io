// Builds public/data/school_demographics.json: for every school (by MSID) and radius ring (1, 2, 5, 8 miles), the
// neighborhood's people, K-8 age children (ages 5-13), children 5-17, median household income, and % Black and %
// Hispanic of children ages 5-14.
//
// Everything is the shared engine's (src/shared-geo/sharedGeo.ts, byte-identical to Grove's; GEO_RULESET.md):
// a block counts when its internal point is within the radius on the WGS84 ellipsoid (distanceMi), tract shares come
// from those blocks (weightsFromBlocks), and the figures from aggregate(). The browser runs the same functions for
// drive-time areas, so a ring here and the same disk in either tool give identical numbers.
//
// Run after scripts/build-population-points.mjs: npm run data:demographics   (Node 22.18+ runs the .ts directly)
import { writeFileSync, readFileSync } from "node:fs";
import { aggregate, distanceMi, weightsFromBlocks } from "../src/shared-geo/sharedGeo.ts";

const RADII = [1, 2, 5, 8];
const P = JSON.parse(readFileSync("public/data/population_points.json", "utf8"));
const n = P.blocks.length / 4;
const blocks = { lon: [], lat: [], pop: [], tract: [], tractIds: P.tract_ids, tractPop: P.tract_ids.map(() => 0) };
for (let i = 0; i < n; i++) {
  blocks.lon.push(P.blocks[i * 4] / 1e5); blocks.lat.push(P.blocks[i * 4 + 1] / 1e5);
  blocks.pop.push(P.blocks[i * 4 + 2]); blocks.tract.push(P.blocks[i * 4 + 3]);
  if (P.blocks[i * 4 + 3] >= 0) blocks.tractPop[P.blocks[i * 4 + 3]] += P.blocks[i * 4 + 2];
}
const figures = (g) => P.figures[g];
const schoolsRaw = JSON.parse(readFileSync("public/data/schools.sample.geojson", "utf8"));
const maxR = Math.max(...RADII), schools = {};
for (const f of schoolsRaw.features) {
  const msid = f.properties.msid, c = f.geometry?.coordinates;
  if (!msid || !Array.isArray(c) || c[0] == null) continue;
  const [lon, lat] = c;
  const dLat = (maxR + 0.5) / 68.7, dLon = (maxR + 0.5) / (69.2 * Math.cos((lat * Math.PI) / 180));
  const near = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(blocks.lat[i] - lat) > dLat || Math.abs(blocks.lon[i] - lon) > dLon) continue;
    near.push([i, distanceMi([lon, lat], [blocks.lon[i], blocks.lat[i]])]);
  }
  const rings = RADII.map((r) => ({ r, ...aggregate(figures, weightsFromBlocks(blocks, near.filter(([, d]) => d <= r).map(([i]) => i))) }));
  schools[msid] = { lon: +lon.toFixed(6), lat: +lat.toFixed(6), rings };
}
writeFileSync("public/data/school_demographics.json", JSON.stringify({
  source: P.source, vintage: P.vintage,
  method: "Shared engine (src/shared-geo/sharedGeo.ts): tract figures spread over 2020 blocks by population, summed within each ring (block internal point within the radius, WGS84 ellipsoid). Median income interpolated from summed ACS B19001 brackets. MOEs: 90% ACS, root-sum-of-squares. GEO_RULESET.md.",
  generated: new Date().toISOString().slice(0, 10),
  counties_covered: P.counties, radii_miles: RADII,
  k8_definition: "Children ages 5-13 (grade g = age g + 5), ACS B09001 age groups spread evenly over single years; July 2025.",
  race_definition: "% Black (alone, any ethnicity) and % Hispanic (any race) of children ages 5-14, ACS B01001B / B01001I.",
  schools,
}));
console.error(`Wrote ${Object.keys(schools).length} schools to public/data/school_demographics.json`);
