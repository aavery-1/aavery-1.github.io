// Builds public/data/population_points.json: every populated 2020 Census block (internal point + POP100) and the
// census tract figures they carry, for the browser (src/geo/populationPoints.ts) and the ring build
// (scripts/build-school-demographics.mjs).
//
// Exactly Grove's inputs, through exactly Grove's code (GEO_RULESET.md):
//   - blocks and tract figures come from Grove's census file (platform/data/census_sites.json: every 2020 block per
//     tract, ACS 2020-2024 tracts, children scaled to July 2025), Florida tracts, in Grove's order. That includes Lake
//     and Polk, which west Orange County drive times reach;
//   - each tract's figures are computed by the shared engine (src/shared-geo/sharedGeo.ts tractFigures), unrounded.
//
// Usage: node scripts/build-population-points.mjs [path/to/census_sites.json]   (Node 22.18+ runs the .ts directly)
import { writeFileSync, readFileSync } from "node:fs";
import { blockSetFromTracts, tractFigures } from "../src/shared-geo/sharedGeo.ts";

const GROVE = process.argv[2] || process.env.GROVE_CENSUS ||
  "../Predictive modeling:projections enrollment dashboard/platform/data/census_sites.json";
const OUT_FILE = "public/data/population_points.json";

const census = JSON.parse(readFileSync(GROVE, "utf8"));
const fl = census.tracts.filter((t) => t.geoid.startsWith("12") && t.popPts?.length);
const bs = blockSetFromTracts(fl);
const figures = Object.fromEntries(fl.map((t) => [t.geoid, tractFigures(t.metrics, t.incomeBins)]));
const flat = [];
for (let i = 0; i < bs.lon.length; i++) flat.push(Math.round(bs.lon[i] * 1e5), Math.round(bs.lat[i] * 1e5), bs.pop[i], bs.tract[i]);
const v = census.meta.vintage;
writeFileSync(OUT_FILE, JSON.stringify({
  vintage: `ACS ${v - 4}-${v} 5-year tracts, children scaled to July 2025 county estimates; 2020 Census blocks`,
  source: `Grove census file (${census.meta.source}); U.S. Census Bureau 2020 blocks`,
  method: "Shared engine (src/shared-geo/sharedGeo.ts): a tract's figures spread over its 2020 blocks by population; a block counts when its internal point is inside the area. GEO_RULESET.md.",
  counties: [...new Set(fl.map((t) => t.county ?? t.geoid.slice(0, 5)))],
  tract_ids: bs.tractIds,
  figures,
  blocks: flat, // [lon*1e5, lat*1e5, pop, tract index]
}));
console.error(`Wrote ${OUT_FILE}: ${bs.tractIds.length} tracts, ${bs.lon.length} blocks`);
