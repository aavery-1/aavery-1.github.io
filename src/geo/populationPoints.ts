// Neighborhood demographics for any area (a drive-time area, a radius ring, a drawn shape). All of the math is the
// shared engine's (src/shared-geo/sharedGeo.ts, a byte-identical copy of Grove's; GEO_RULESET.md), on the same blocks
// and tract figures Grove uses (public/data/population_points.json, built from Grove's census file), so the same area
// gives the same numbers in both tools:
//   - a tract's figures are spread over its 2020 Census blocks by population, and a block is in the area when its
//     internal point is inside;
//   - K-8 age = ages 5-13; % Black and % Hispanic are of children ages 5-14;
//   - median household income is interpolated from the area's summed income brackets;
//   - margins of error combine as root-sum-of-squares of the apportioned parts.
//
// The point file is a few MB, so it is fetched only the first time an area is counted, then held in memory.

import type { Polygon, MultiPolygon } from "geojson";
import {
  aggregate, blocksIn, pointInGeom, weightsFromBlocks,
  type AreaDemographics, type AreaWeights, type BlockSet, type Geom, type TractFigures,
} from "../shared-geo/sharedGeo";

export type { AreaDemographics, AreaWeights };

export interface PointsFile {
  vintage: string;
  tract_ids: string[];
  figures: Record<string, TractFigures>;
  blocks: number[];
}

export interface Decoded {
  blocks: BlockSet;
  figures: Record<string, TractFigures>;
}

const URL = "/data/population_points.json";
let loading: Promise<Decoded> | null = null;

export function loadPopulationPoints(): Promise<Decoded> {
  if (!loading) {
    loading = fetch(URL)
      .then((r) => {
        if (!r.ok) throw new Error(`population points HTTP ${r.status}`);
        return r.json() as Promise<PointsFile>;
      })
      .then(decodePoints)
      .catch((e) => {
        loading = null; // allow a retry
        throw e;
      });
  }
  return loading;
}

export function decodePoints(f: PointsFile): Decoded {
  const n = f.blocks.length / 4;
  const lon = new Float64Array(n), lat = new Float64Array(n), pop = new Int32Array(n), tract = new Int32Array(n);
  const tractPop = f.tract_ids.map(() => 0);
  for (let i = 0; i < n; i++) {
    lon[i] = f.blocks[i * 4] / 1e5;
    lat[i] = f.blocks[i * 4 + 1] / 1e5;
    pop[i] = f.blocks[i * 4 + 2];
    tract[i] = f.blocks[i * 4 + 3];
    if (tract[i] >= 0) tractPop[tract[i]] += pop[i];
  }
  return { blocks: { lon, lat, pop, tract, tractIds: f.tract_ids, tractPop }, figures: f.figures };
}

/** Shared figures for tract shares (from a saved drive-time measurement, or from blocks in an area). */
export function demographicsFor(d: Decoded, area: AreaWeights): AreaDemographics {
  return aggregate((g) => d.figures[g], area);
}

export function aggregateDecoded(d: Decoded, geom: Polygon | MultiPolygon): AreaDemographics {
  return demographicsFor(d, weightsFromBlocks(d.blocks, blocksIn(d.blocks, geom as Geom)));
}

export async function aggregateWithin(geom: Polygon | MultiPolygon): Promise<AreaDemographics> {
  return aggregateDecoded(await loadPopulationPoints(), geom);
}

/** Even-odd point-in-polygon with holes and parts (the shared engine's), kept under its old name for callers. */
export function pointInPolygon(x: number, y: number, geom: Polygon | MultiPolygon): boolean {
  return pointInGeom(x, y, geom as Geom);
}
