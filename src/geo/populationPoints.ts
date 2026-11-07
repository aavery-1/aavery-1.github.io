// Neighborhood demographics for an ARBITRARY polygon (a drive-time isochrone),
// computed in the browser with the same dasymetric method the precomputed
// radius rings use (scripts/build-school-demographics.mjs):
//   - people are placed at 2020 Census block internal points (POP100, a full
//     count), and a block is in the area when its point is inside the polygon;
//   - each block carries its ACS 2019-2023 block group's values in proportion to
//     its share of that block group's 2020 population;
//   - MOEs combine as root-sum-of-squares of the apportioned parts; median income
//     is a household-weighted mean of block-group medians (an approximation).
// So a 15-minute figure and a 2-mile figure are directly comparable.
//
// The point file (public/data/population_points.json, scripts/build-population-
// points.mjs) is a few MB, so it is fetched only the first time a drive time is
// requested, then held in memory.

import type { Polygon, MultiPolygon, Position } from "geojson";

export interface AreaDemographics {
  blocks: number;
  total_pop: number;
  total_pop_moe: number;
  k8_pop: number;
  k8_pop_moe: number;
  pct_black: number | null;
  pct_black_moe: number | null;
  pct_hispanic: number | null;
  pct_hispanic_moe: number | null;
  median_income: number | null;
  median_income_moe: number | null;
}

export interface PointsFile {
  vintage: string;
  bg_fields: string[];
  bg: Array<Array<number | null>>;
  blocks: number[];
}

export interface Decoded {
  lon: Float64Array;
  lat: Float64Array;
  pop: Int32Array;
  bgi: Int32Array;
  bg: Array<Record<string, number | null>>;
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
  const lon = new Float64Array(n), lat = new Float64Array(n);
  const pop = new Int32Array(n), bgi = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    lon[i] = f.blocks[i * 4] / 1e5;
    lat[i] = f.blocks[i * 4 + 1] / 1e5;
    pop[i] = f.blocks[i * 4 + 2];
    bgi[i] = f.blocks[i * 4 + 3];
  }
  const bg = f.bg.map((row) => Object.fromEntries(f.bg_fields.map((k, j) => [k, row[j]])));
  return { lon, lat, pop, bgi, bg };
}

// Even-odd ray cast over every ring, so holes subtract correctly.
function inRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInPolygon(x: number, y: number, geom: Polygon | MultiPolygon): boolean {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const rings of polys) {
    let inside = false;
    for (const ring of rings) if (inRing(x, y, ring)) inside = !inside;
    if (inside) return true;
  }
  return false;
}

function bbox(geom: Polygon | MultiPolygon): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const rings of polys) for (const p of rings[0]) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return [minX, minY, maxX, maxY];
}

// Census derived-proportion MOE (falls back to the ratio form when negative).
function proportionMoe(num: number, den: number, numMoe: number, denMoe: number): number | null {
  if (!den) return null;
  const p = num / den;
  const rad = numMoe * numMoe - p * p * denMoe * denMoe;
  const inner = rad < 0 ? numMoe * numMoe + p * p * denMoe * denMoe : rad;
  return Math.sqrt(inner) / den;
}

export function aggregateDecoded(d: Decoded, geom: Polygon | MultiPolygon): AreaDemographics {
  const [minX, minY, maxX, maxY] = bbox(geom);
  let pop = 0, k8 = 0, black = 0, raceUniv = 0, hisp = 0, hispUniv = 0, blocks = 0;
  const inPopByBg = new Map<number, number>();
  for (let i = 0; i < d.lon.length; i++) {
    const x = d.lon[i], y = d.lat[i];
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (!pointInPolygon(x, y, geom)) continue;
    const g = d.bg[d.bgi[i]];
    const denom = g.totalBlockPop ?? 0;
    if (!denom) continue;
    const share = d.pop[i] / denom;
    blocks++;
    pop += (g.pop ?? 0) * share;
    k8 += (g.k8 ?? 0) * share;
    black += (g.black ?? 0) * share;
    raceUniv += (g.raceUniverse ?? 0) * share;
    hisp += (g.hisp ?? 0) * share;
    hispUniv += (g.hispUniverse ?? 0) * share;
    inPopByBg.set(d.bgi[i], (inPopByBg.get(d.bgi[i]) ?? 0) + d.pop[i]);
  }
  let popMoe2 = 0, k8Moe2 = 0, blackMoe2 = 0, hispMoe2 = 0, incW = 0, incWV = 0, incMoe2 = 0;
  for (const [bi, inPop] of inPopByBg) {
    const g = d.bg[bi];
    const w = inPop / (g.totalBlockPop ?? 1);
    popMoe2 += ((g.popMoe ?? 0) * w) ** 2;
    k8Moe2 += ((g.k8Moe ?? 0) * w) ** 2;
    blackMoe2 += ((g.blackMoe ?? 0) * w) ** 2;
    hispMoe2 += ((g.hispMoe ?? 0) * w) ** 2;
    if (g.medInc != null) {
      const hh = (g.households ?? 0) * w;
      if (hh > 0) {
        incW += hh;
        incWV += g.medInc * hh;
        if (g.medIncMoe != null) incMoe2 += (g.medIncMoe * hh) ** 2;
      }
    }
  }
  const pb = raceUniv > 0 ? black / raceUniv : null;
  const ph = hispUniv > 0 ? hisp / hispUniv : null;
  const pbm = proportionMoe(black, raceUniv, Math.sqrt(blackMoe2), Math.sqrt(popMoe2));
  const phm = proportionMoe(hisp, hispUniv, Math.sqrt(hispMoe2), Math.sqrt(popMoe2));
  return {
    blocks,
    total_pop: Math.round(pop),
    total_pop_moe: Math.round(Math.sqrt(popMoe2)),
    k8_pop: Math.round(k8),
    k8_pop_moe: Math.round(Math.sqrt(k8Moe2)),
    pct_black: pb == null ? null : +(pb * 100).toFixed(1),
    pct_black_moe: pbm == null ? null : +(pbm * 100).toFixed(1),
    pct_hispanic: ph == null ? null : +(ph * 100).toFixed(1),
    pct_hispanic_moe: phm == null ? null : +(phm * 100).toFixed(1),
    median_income: incW > 0 ? Math.round(incWV / incW) : null,
    median_income_moe: incW > 0 ? Math.round(Math.sqrt(incMoe2) / incW) : null,
  };
}

export async function aggregateWithin(geom: Polygon | MultiPolygon): Promise<AreaDemographics> {
  return aggregateDecoded(await loadPopulationPoints(), geom);
}
