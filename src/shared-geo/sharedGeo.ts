// Shared geo engine for Grove and the SOH siting tool (docs/methods/geo-ruleset.md).
//
// MASTER COPY: Grove platform/lib/shared-geo/sharedGeo.ts. The SOH tool carries a byte-identical copy at
// src/shared-geo/sharedGeo.ts, written by Grove's scripts/sync-shared-geo.mjs. Never edit the copy. Tests in both
// repositories fail when the two differ, so a figure computed here is computed the same way in both tools.
//
// Rules for this file, so every runtime can load it unchanged (Next.js, Vite, tsx, and Node 22+ type stripping):
// no imports, no enums, no parameter properties, no namespaces; ASCII only.
//
// What is here:
//   1. Geodesy: WGS84 ellipsoidal distance (Vincenty), true radius circles, turf.area's area formula.
//   2. Polygons: point-in-polygon with holes and multiple parts.
//   3. Census areas: tract figures spread over 2020 blocks by population; one aggregation for both tools.
//   4. Drive times: timed homes under per-site or regional cut-offs, 80% ranges, saved per-site results, live estimate.

export const SHARED_GEO_VERSION = '2026-11-11.1';

// ---------------------------------------------------------------------------------------------------------------
// 1. Geodesy
// ---------------------------------------------------------------------------------------------------------------
export type LngLat = [number, number];
const WGS_A = 6378137.0, WGS_F = 1 / 298.257223563, WGS_B = (1 - WGS_F) * WGS_A;
export const METERS_PER_MILE = 1609.344;
export const SQ_M_PER_SQ_MI = 2589988.110336;
const MEAN_EARTH_RADIUS_M = 6371008.8; // turf's earthRadius
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * MEAN_EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Ground distance in metres on the WGS84 ellipsoid (Vincenty inverse). */
export function distanceMeters(p1: LngLat, p2: LngLat): number {
  const [lon1, lat1] = p1, [lon2, lat2] = p2;
  const L = toRad(lon2 - lon1);
  const U1 = Math.atan((1 - WGS_F) * Math.tan(toRad(lat1))), U2 = Math.atan((1 - WGS_F) * Math.tan(toRad(lat2)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1), sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L, prev = 0, iter = 0, cosSqAlpha = 0, sinSigma = 0, cosSigma = 0, sigma = 0, cos2SigmaM = 0;
  do {
    const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (WGS_F / 16) * cosSqAlpha * (4 + WGS_F * (4 - 3 * cosSqAlpha));
    prev = lambda;
    lambda = L + (1 - C) * WGS_F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - prev) > 1e-12 && ++iter < 200);
  if (iter >= 200) return haversineMeters(p1, p2); // near-antipodal only
  const uSq = (cosSqAlpha * (WGS_A * WGS_A - WGS_B * WGS_B)) / (WGS_B * WGS_B);
  const Ac = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bc = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const dS = Bc * sinSigma * (cos2SigmaM + (Bc / 4) * (cosSigma * (-1 + 2 * cos2SigmaM ** 2) - (Bc / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
  return WGS_B * Ac * (sigma - dS);
}

/** Straight-line miles on the WGS84 ellipsoid. */
export const distanceMi = (a: LngLat, b: LngLat) => distanceMeters(a, b) / METERS_PER_MILE;

/** The point `meters` from `start` along initial bearing `bearingDeg` (Vincenty direct). */
export function destination(start: LngLat, meters: number, bearingDeg: number): LngLat {
  const [lon, lat] = start;
  const a1 = toRad(bearingDeg), sinA1 = Math.sin(a1), cosA1 = Math.cos(a1);
  const tanU1 = (1 - WGS_F) * Math.tan(toRad(lat)), cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1), sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosA1), sinAlpha = cosU1 * sinA1, cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cosSqAlpha * (WGS_A * WGS_A - WGS_B * WGS_B)) / (WGS_B * WGS_B);
  const Ac = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bc = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  let sigma = meters / (WGS_B * Ac), prev = 0, iter = 0, sinSigma = 0, cosSigma = 0, cos2SigmaM = 0;
  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma); sinSigma = Math.sin(sigma); cosSigma = Math.cos(sigma);
    const dS = Bc * sinSigma * (cos2SigmaM + (Bc / 4) * (cosSigma * (-1 + 2 * cos2SigmaM ** 2) - (Bc / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
    prev = sigma;
    sigma = meters / (WGS_B * Ac) + dS;
  } while (Math.abs(sigma - prev) > 1e-12 && ++iter < 200);
  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosA1;
  const lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosA1, (1 - WGS_F) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp));
  const lambda = Math.atan2(sinSigma * sinA1, cosU1 * cosSigma - sinU1 * sinSigma * cosA1);
  const C = (WGS_F / 16) * cosSqAlpha * (4 + WGS_F * (4 - 3 * cosSqAlpha));
  const L = lambda - (1 - C) * WGS_F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  return [toDeg(toRad(lon) + L), toDeg(lat2)];
}

/** A closed ring of `steps` points, each exactly `miles` from `center`. */
export function geodesicCircle(center: LngLat, miles: number, steps = 128): LngLat[] {
  const ring: LngLat[] = [];
  for (let i = 0; i < steps; i++) ring.push(destination(center, miles * METERS_PER_MILE, (i / steps) * 360));
  ring.push(ring[0]);
  return ring;
}

/** Area of one ring in square miles (turf.area's formula; open or closed rings). */
export function ringAreaSqMi(ring: ReadonlyArray<ReadonlyArray<number>>): number {
  const closed = ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]);
  const c = closed ? [...ring, ring[0]] : ring;
  const n = c.length - 1;
  if (n <= 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const lower = c[i], middle = c[i + 1 === n ? 0 : i + 1], upper = c[i + 2 >= n ? (i + 2) % n : i + 2];
    total += (toRad(upper[0]) - toRad(lower[0])) * Math.sin(toRad(middle[1]));
  }
  return Math.abs((total * MEAN_EARTH_RADIUS_M * MEAN_EARTH_RADIUS_M) / 2) / SQ_M_PER_SQ_MI;
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Polygons
// ---------------------------------------------------------------------------------------------------------------
export type Pos = number[];
export type Geom = { type: 'Polygon'; coordinates: Pos[][] } | { type: 'MultiPolygon'; coordinates: Pos[][][] };

const partsOf = (g: Geom): Pos[][][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

function inRing(x: number, y: number, ring: Pos[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside any part, outside its holes (even-odd over each part's rings). */
export function pointInGeom(x: number, y: number, g: Geom): boolean {
  for (const rings of partsOf(g)) {
    let inside = false;
    for (const ring of rings) if (inRing(x, y, ring)) inside = !inside;
    if (inside) return true;
  }
  return false;
}

export function geomBox(g: Geom): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const rings of partsOf(g)) for (const p of rings[0]) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

/** The largest part's outer ring (for tools that draw one outline). */
export function outerRing(g: Geom): Pos[] {
  return partsOf(g).reduce((a, p) => (p[0].length > a.length ? p[0] : a), [] as Pos[]);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Census areas
// ---------------------------------------------------------------------------------------------------------------
export type Metric = { value: number; moe: number };
export type MetricMap = Record<string, Metric | undefined>;

/** ACS B09001 groups of children by age; a band takes each group's children spread evenly over its single years. */
export const AGE_GROUPS: [string, number, number][] = [
  ['age_0_2', 0, 2], ['age_3_4', 3, 4], ['age_5', 5, 5], ['age_6_8', 6, 8], ['age_9_11', 9, 11], ['age_12_14', 12, 14], ['age_15_17', 15, 17],
];

/** Children of ages lo..hi inclusive. MOE: each group's in proportion to the share used, root-sum-of-squares. */
export function agePop(m: MetricMap, lo: number, hi: number): Metric | null {
  let value = 0, moeSq = 0;
  for (const [k, a, b] of AGE_GROUPS) {
    const used = Math.max(0, Math.min(hi, b) - Math.max(lo, a) + 1);
    if (!used) continue;
    const g = m[k];
    if (!g) return null;
    const share = used / (b - a + 1);
    value += g.value * share;
    moeSq += (g.moe * share) ** 2;
  }
  return { value, moe: Math.sqrt(moeSq) };
}

/** Lower edges of the ACS B19001 household income brackets: < $10k, $10-15k, ... $150-200k, $200k+. */
export const INCOME_EDGES = [0, 10e3, 15e3, 20e3, 25e3, 30e3, 35e3, 40e3, 45e3, 50e3, 60e3, 75e3, 100e3, 125e3, 150e3, 200e3];

/** Median from households per bracket, interpolating within the bracket holding the middle household (Census method).
 * A median in the open top bracket is its lower edge ($200,000). NaN when there are no households. */
export function medianFromBins(bins: number[], edges: number[] = INCOME_EDGES): number {
  const half = bins.reduce((a, b) => a + b, 0) / 2;
  if (!(half > 0)) return NaN;
  let below = 0;
  for (let i = 0; i < bins.length; i++) {
    if (below + bins[i] >= half) return i + 1 < edges.length ? edges[i] + ((half - below) / bins[i]) * (edges[i + 1] - edges[i]) : edges[i];
    below += bins[i];
  }
  return NaN;
}

/** Census derived-proportion MOE (the ratio form when the radicand is negative). */
export function proportionMoe(num: number, den: number, numMoe: number, denMoe: number): number | null {
  if (!den) return null;
  const p = num / den;
  const rad = numMoe * numMoe - p * p * denMoe * denMoe;
  return Math.sqrt(rad < 0 ? numMoe * numMoe + p * p * denMoe * denMoe : rad) / den;
}

/** The figures both tools report for an area, per tract. */
export interface TractFigures {
  pop: number | null; popMoe: number | null; // total people (July 2025 where scaled)
  k8: number | null; k8Moe: number | null; // ages 5-13
  c517: number | null; c517Moe: number | null; // ages 5-17
  pop514: number | null; pop514Moe: number | null; // race-by-age universe
  black514: number | null; black514Moe: number | null; // Black alone, any ethnicity, 5-14
  hisp514: number | null; hisp514Moe: number | null; // Hispanic, any race, 5-14
  inc: number[] | null; // B19001 households by bracket
}

/** A tract's figures from Grove's census file metrics (data/census_sites.json). */
export function tractFigures(m: MetricMap, incomeBins?: number[] | null): TractFigures {
  const pop = m.pop_total_base ?? m.pop_total;
  const k8 = agePop(m, 5, 13), c517 = agePop(m, 5, 17);
  const v = (k: string) => m[k]?.value ?? null, e = (k: string) => m[k]?.moe ?? null;
  return {
    pop: pop?.value ?? null, popMoe: pop?.moe ?? null, k8: k8?.value ?? null, k8Moe: k8?.moe ?? null,
    c517: c517?.value ?? null, c517Moe: c517?.moe ?? null,
    pop514: v('pop_5_14'), pop514Moe: e('pop_5_14'), black514: v('black_5_14'), black514Moe: e('black_5_14'),
    hisp514: v('hisp_5_14'), hisp514Moe: e('hisp_5_14'), inc: incomeBins && incomeBins.length === 16 ? incomeBins : null,
  };
}

/** Every populated 2020 block, by tract. `tract[i]` indexes `tractIds`; -1 = a block in a county without figures. */
export interface BlockSet {
  lon: ArrayLike<number>; lat: ArrayLike<number>; pop: ArrayLike<number>; tract: ArrayLike<number>;
  tractIds: string[];
  /** Total 2020 block population of each tract (the denominator of a block's share) */
  tractPop: number[];
}

/** A BlockSet from tracts carrying popPts ([lng, lat, people] per block), in the order given. */
export function blockSetFromTracts(tracts: ReadonlyArray<{ geoid: string; popPts?: number[][] }>): BlockSet {
  const lon: number[] = [], lat: number[] = [], pop: number[] = [], tract: number[] = [], tractIds: string[] = [], tractPop: number[] = [];
  for (const t of tracts) {
    if (!t.popPts || !t.popPts.length) continue;
    const i = tractIds.length;
    tractIds.push(t.geoid);
    let total = 0;
    for (const p of t.popPts) { lon.push(p[0]); lat.push(p[1]); pop.push(p[2]); tract.push(i); total += p[2]; }
    tractPop.push(total);
  }
  return { lon, lat, pop, tract, tractIds, tractPop };
}

/** Indices of the blocks whose internal point is inside `g`. */
export function blocksIn(b: BlockSet, g: Geom): number[] {
  const [x0, y0, x1, y1] = geomBox(g);
  const out: number[] = [];
  for (let i = 0; i < b.lon.length; i++) {
    const x = b.lon[i], y = b.lat[i];
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (pointInGeom(x, y, g)) out.push(i);
  }
  return out;
}

export interface AreaWeights {
  /** Share of each tract's 2020 people inside the area, keyed by tract GEOID, sorted by GEOID */
  weights: Record<string, number>;
  /** Share of the area's 2020 people that live in tracts with figures (0..1) */
  coverage: number;
  blocks: number;
}

/** Tract shares from a set of blocks. Shares are rounded to 1e-9 so saved and recomputed areas agree exactly. */
export function weightsFromBlocks(b: BlockSet, idx: Iterable<number>): AreaWeights {
  const inPop = new Map<number, number>();
  let all = 0, covered = 0, n = 0;
  for (const i of idx) {
    n++;
    all += b.pop[i];
    const t = b.tract[i];
    if (t < 0 || !b.tractPop[t]) continue;
    covered += b.pop[i];
    inPop.set(t, (inPop.get(t) ?? 0) + b.pop[i]);
  }
  const weights: Record<string, number> = {};
  for (const t of [...inPop.keys()].sort((x, y) => (b.tractIds[x] < b.tractIds[y] ? -1 : 1))) {
    weights[b.tractIds[t]] = Math.round((inPop.get(t)! / b.tractPop[t]) * 1e9) / 1e9;
  }
  return { weights, coverage: all > 0 ? Math.round((covered / all) * 1e6) / 1e6 : 1, blocks: n };
}

export interface AreaDemographics {
  blocks: number;
  total_pop: number; total_pop_moe: number;
  k8_pop: number; k8_pop_moe: number; // ages 5-13
  children_5_17: number; children_5_17_moe: number;
  pct_black: number | null; pct_black_moe: number | null; // of children 5-14
  pct_hispanic: number | null; pct_hispanic_moe: number | null; // of children 5-14
  median_income: number | null; median_income_moe: number | null; // interpolated: no published MOE, always null
  coverage_pct: number; // 0..1
}

/** The shared figures for an area: tract figures times shares, summed in GEOID order; MOEs root-sum-of-squares. */
export function aggregate(figures: (geoid: string) => TractFigures | null | undefined, area: AreaWeights): AreaDemographics {
  const sum: Record<string, number> = {}, moe2: Record<string, number> = {};
  const bins = new Array(16).fill(0);
  let haveBins = false;
  const add = (k: string, v: number | null, m: number | null, w: number) => {
    if (v == null) return;
    sum[k] = (sum[k] ?? 0) + v * w;
    moe2[k] = (moe2[k] ?? 0) + ((m ?? 0) * w) ** 2;
  };
  for (const g of Object.keys(area.weights).sort()) {
    const f = figures(g), w = area.weights[g];
    if (!f) continue;
    add('pop', f.pop, f.popMoe, w);
    add('k8', f.k8, f.k8Moe, w);
    add('c517', f.c517, f.c517Moe, w);
    add('pop514', f.pop514, f.pop514Moe, w);
    add('black514', f.black514, f.black514Moe, w);
    add('hisp514', f.hisp514, f.hisp514Moe, w);
    if (f.inc) { haveBins = true; for (let i = 0; i < 16; i++) bins[i] += f.inc[i] * w; }
  }
  const s = (k: string) => sum[k] ?? 0, m = (k: string) => Math.sqrt(moe2[k] ?? 0);
  const share = (k: string) => (s('pop514') > 0 ? s(k) / s('pop514') : null);
  const shareMoe = (k: string) => proportionMoe(s(k), s('pop514'), m(k), m('pop514'));
  const pct = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 10);
  const med = haveBins ? medianFromBins(bins) : NaN;
  return {
    blocks: area.blocks,
    total_pop: Math.round(s('pop')), total_pop_moe: Math.round(m('pop')),
    k8_pop: Math.round(s('k8')), k8_pop_moe: Math.round(m('k8')),
    children_5_17: Math.round(s('c517')), children_5_17_moe: Math.round(m('c517')),
    pct_black: pct(share('black514')), pct_black_moe: pct(shareMoe('black514')),
    pct_hispanic: pct(share('hisp514')), pct_hispanic_moe: pct(shareMoe('hisp514')),
    median_income: Number.isFinite(med) ? Math.round(med) : null, median_income_moe: null,
    coverage_pct: area.coverage,
  };
}


// ---------------------------------------------------------------------------------------------------------------
// 4. Drive times
// ---------------------------------------------------------------------------------------------------------------
// How a site's areas are made (docs/methods/geo-ruleset.md rule 8):
//   - Every home is timed on OpenStreetMap roads (Valhalla). A home is within N minutes when its Valhalla time is at or
//     under that ring's cut-off: the Valhalla minutes that equal N minutes in Google Maps' school-day time.
//   - Measured site: the cut-off comes from this site's own fit to 30 homes timed by Google (google = a + b x valhalla).
//     The range is the 10th-90th percentile of the cut-off over resamples of those 30 homes (an 80% range).
//   - Unmeasured site: the cut-off is the median of the measured sites' cut-offs in the region, and the range spans
//     all of them (it held the true count at about 3 in 4 sites when tested).
//   - Saved results are worked out ahead of time on our own routing server (pinned road data) and stored per site, so
//     both tools read the same file. A pin with no saved result gets a live estimate on the public server: the regional
//     cut-offs drawn as outlines, labeled as such.
export const DRIVE_MINUTES = [5, 10, 15];
export type DriveWindow = 'dropoff' | 'pickup';
/** Drop-off: home to campus, leaving 8:00am on a Tuesday. Pickup: campus to home, leaving 4:00pm. */
export const WINDOWS: Record<DriveWindow, { toCampus: boolean; minutes: number; label: string }> = {
  dropoff: { toCampus: true, minutes: 8 * 60, label: 'Drop-off, 8am' },
  pickup: { toCampus: false, minutes: 16 * 60, label: 'Pickup, 4pm' },
};

/** The free public server (FOSSGIS), used only for live estimates at pins with no saved result. */
export const VALHALLA_URL = 'https://valhalla1.openstreetmap.de';
/** Outline simplification in metres for areas that decide membership. */
export const GENERALIZE_M = 10;
/** Simplification for saved display outlines, which are also stored to 4 decimals (about 11 m). Counts never use them. */
export const OUTLINE_GENERALIZE_M = 60;
/** A saved result applies to any pin within this many metres of where it was worked out (one campus, two pins). */
export const SAVED_RADIUS_M = 150;
/** Homes timed by Google per site and time of day. */
export const SAMPLE_HOMES = 30;
/** A measured site's range: the 10th to 90th percentile of its cut-off over resamples of its homes (an 80% range). */
export const RANGE_QUANTILES: [number, number] = [0.1, 0.9];
/** An estimate's range: the full spread of the region's measured sites. In the leave-one-site-out check
 * (scripts/qa_drive_accuracy.ts, 2026-11-11) it held the site's measured count at 30-32 of 42 sites (about 3 in 4);
 * the 10th-90th percentile held it at only 24-25, so it isn't called an 80% range. */
export const ESTIMATE_QUANTILES: [number, number] = [0, 1];
const BOOTSTRAP_DRAWS = 400;

/** One home timed by both Valhalla and Google. `ring`: set for homes chosen near that ring's line by the edge check
 * (scripts/qa_drive_edges.ts), which are part of the fit too. */
export interface FitSample { lng: number; lat: number; valhalla: number | null; google: number | null; ring?: number }
export interface Fit { a: number; b: number; n: number; rmse: number }
/** Valhalla-minute cut-offs for one ring: a home is inside when its Valhalla time <= the cut-off. */
export interface Cutoff { minutes: number; mid: number; low: number; high: number }

export interface DriveRing {
  minutes: number;
  /** The central cut-off in Valhalla minutes (also the outline's contour) */
  contour: number;
  /** Outline for display: Valhalla's area at `contour`. Saved counts use the timed homes, not this outline. */
  geometry: Geom;
  area: AreaWeights;
  /** The 80% range: the areas under the low and high cut-offs */
  low: AreaWeights | null;
  high: AreaWeights | null;
  contourLow: number | null;
  contourHigh: number | null;
}
export interface DriveResult {
  key: string; lng: number; lat: number; window: DriveWindow;
  /** 'measured': this site's own Google fit; 'estimate': the regional cut-offs (site not timed by Google) */
  status: 'measured' | 'estimate';
  /** 'saved': worked out ahead of time on our routing server; 'live': drawn now on the public server */
  source: 'saved' | 'live';
  measuredOn: string | null;
  fit: Fit | null;
  samples: FitSample[];
  rings: DriveRing[];
  /** What an estimate's cut-offs rest on, e.g. "7 measured Florida sites" */
  basis: string | null;
  /** Road data and engine, e.g. "Valhalla 3.9.1, OpenStreetMap via Geofabrik 2026-11-10" */
  routing: string;
  version: string;
}

/** One Google measurement: the raw input every measured result is rebuilt from (data/drive_measurements.json). */
/** `edgeCheckedOn`: when homes near each line were added by the edge check */
export interface Measurement { key: string; lng: number; lat: number; window: DriveWindow; measuredOn: string; edgeCheckedOn?: string; samples: FitSample[] }
export interface MeasurementsFile { version: string; note: string; measurements: Measurement[] }

export const siteKey = (lng: number, lat: number) => `${lng.toFixed(4)},${lat.toFixed(4)}`;
/** File name for a site's saved results, e.g. "-80.2349_25.8366.json". */
export const siteFile = (key: string) => `${key.replace(',', '_')}.json`;

/** Ordinary least squares, google = a + b x valhalla, over pairs with both times. Null with under 20 pairs or b <= 0.2. */
export function fitLine(samples: FitSample[]): Fit | null {
  const p = samples.filter((s) => s.valhalla != null && s.google != null) as { valhalla: number; google: number }[];
  if (p.length < 20) return null;
  const mx = p.reduce((a, s) => a + s.valhalla, 0) / p.length, my = p.reduce((a, s) => a + s.google, 0) / p.length;
  const sxx = p.reduce((a, s) => a + (s.valhalla - mx) ** 2, 0);
  if (!(sxx > 0)) return null;
  const b = p.reduce((a, s) => a + (s.valhalla - mx) * (s.google - my), 0) / sxx, a = my - b * mx;
  if (!(b > 0.2)) return null;
  const rmse = Math.sqrt(p.reduce((acc, s) => acc + (s.google - (a + b * s.valhalla)) ** 2, 0) / p.length);
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  return { a: r(a), b: r(b), n: p.length, rmse: r(rmse) };
}

/** Quantile by linear interpolation between order statistics (R type 7) of a sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
const cut = (x: number) => Math.min(40, Math.max(0.5, Math.round(x * 1000) / 1000));
const cutoffAt = (minutes: number, f: { a: number; b: number }) => (minutes - f.a) / f.b;

// Deterministic randomness: the same site and time of day always draw the same homes and resamples, in either tool.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A measured site's cut-offs: its own fit, with the range from 400 seeded resamples of its timed homes. */
export function siteCutoffs(samples: FitSample[], seed: string, minutes: number[] = DRIVE_MINUTES): { fit: Fit; cutoffs: Cutoff[] } | null {
  const fit = fitLine(samples);
  if (!fit) return null;
  const pairs = samples.filter((s) => s.valhalla != null && s.google != null);
  const rnd = mulberry32(hashString(`bootstrap|${seed}`));
  const draws: number[][] = minutes.map(() => []);
  for (let k = 0; k < BOOTSTRAP_DRAWS; k++) {
    const pick: FitSample[] = [];
    for (let j = 0; j < pairs.length; j++) pick.push(pairs[Math.floor(rnd() * pairs.length)]);
    const f = fitLine(pick);
    if (f) minutes.forEach((m, i) => draws[i].push(cutoffAt(m, f)));
  }
  const cutoffs = minutes.map((m, i) => {
    const d = draws[i].sort((x, y) => x - y), mid = cutoffAt(m, fit);
    return { minutes: m, mid: cut(mid), low: cut(Math.min(mid, quantile(d, RANGE_QUANTILES[0]))), high: cut(Math.max(mid, quantile(d, RANGE_QUANTILES[1]))) };
  });
  return { fit, cutoffs };
}

/** An unmeasured site's cut-offs: the median and the given quantiles of the measured sites' cut-offs. */
export function regionalCutoffs(fits: { a: number; b: number }[], minutes: number[] = DRIVE_MINUTES, q: [number, number] = ESTIMATE_QUANTILES): Cutoff[] {
  return minutes.map((m) => {
    const t = fits.map((f) => cutoffAt(m, f)).sort((x, y) => x - y);
    return { minutes: m, mid: cut(quantile(t, 0.5)), low: cut(quantile(t, q[0])), high: cut(quantile(t, q[1])) };
  });
}

/** SAMPLE_HOMES blocks among `candidates`, chosen where children live: five distance bands holding equal numbers of
 * children, six homes each, each drawn with probability proportional to its children. Seeded by site and time. */
export function sampleHomes(b: BlockSet, candidates: number[], children: (i: number) => number, site: LngLat, seed: string): number[] {
  const rows = candidates.map((i) => ({ i, d: distanceMeters(site, [b.lon[i], b.lat[i]]), k: children(i) })).filter((r) => r.k > 0)
    .sort((x, y) => x.d - y.d || x.i - y.i);
  const total = rows.reduce((a, r) => a + r.k, 0);
  if (!rows.length || !(total > 0)) return [];
  const rnd = mulberry32(hashString(seed));
  const bands = 5, per = SAMPLE_HOMES / bands, out: number[] = [];
  let start = 0, acc = 0;
  for (let band = 1; band <= bands; band++) {
    let end = start;
    while (end < rows.length && (acc < (total * band) / bands || end === start)) { acc += rows[end].k; end++; }
    const slice = rows.slice(start, end), bandTotal = slice.reduce((a, r) => a + r.k, 0);
    for (let j = 0; j < per && slice.length; j++) {
      let r = rnd() * bandTotal, pick = slice[slice.length - 1];
      for (const row of slice) { r -= row.k; if (r <= 0) { pick = row; break; } }
      out.push(pick.i);
    }
    start = end;
  }
  return out;
}

/** The Valhalla isochrone request (identical in both tools). Reverse = everywhere that can reach the site in time. */
export function isochroneRequest(lng: number, lat: number, contours: number[], reverse: boolean, generalize = GENERALIZE_M) {
  return {
    locations: [{ lat, lon: lng }], costing: 'auto', contours: contours.map((time) => ({ time })), polygons: true, generalize,
    ...(reverse ? { reverse: true } : {}),
  };
}

/** Network access, supplied by each tool (browser fetch, server fetch, or a test double). */
export interface DriveIO {
  /** Valhalla isochrones: one geometry per requested contour (at most 4), matched to the request order */
  isochrones(lng: number, lat: number, contours: number[], reverse: boolean, generalize?: number): Promise<Geom[]>;
  /** Valhalla minutes between each home and the site (home -> site when toCampus), null when unroutable */
  matrix(homes: LngLat[], site: LngLat, toCampus: boolean): Promise<(number | null)[]>;
  /** Google's predicted minutes for the same trips, leaving at the window's time on the next Tuesday */
  google(homes: LngLat[], site: LngLat, toCampus: boolean, window: DriveWindow): Promise<(number | null)[]>;
  /** Homes per matrix call: 99 on the public server, thousands on our own */
  matrixChunk?: number;
  progress?(step: string): void;
}
type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetch-based Valhalla access. Defaults suit the public server (~1 request a second, 99 homes per matrix call); pass
 * our own server's address with pauseMs 0 and a large chunk for precomputing. */
export function valhallaIO(fetchImpl: FetchLike, base = VALHALLA_URL, pauseMs = 1100, matrixChunk = 99) {
  let last = 0;
  const pace = async () => {
    const wait = last + pauseMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  };
  return {
    matrixChunk,
    async isochrones(lng: number, lat: number, contours: number[], reverse: boolean, generalize = GENERALIZE_M): Promise<Geom[]> {
      await pace();
      const res = await fetchImpl(`${base}/isochrone?json=${encodeURIComponent(JSON.stringify(isochroneRequest(lng, lat, contours, reverse, generalize)))}`);
      if (!res.ok) throw new Error(res.status === 429 ? 'The routing service is busy. Try again in a few seconds.' : `Routing service error (HTTP ${res.status}).`);
      const fc = (await res.json()) as { features?: { properties: { contour: number }; geometry: Geom }[] };
      const feats = (fc.features ?? []).filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
      return contours.map((c) => {
        const f = feats.reduce<(typeof feats)[number] | null>((best, x) => (!best || Math.abs(x.properties.contour - c) < Math.abs(best.properties.contour - c) ? x : best), null);
        if (!f) throw new Error('No drive-time area came back for this location.');
        return f.geometry;
      });
    },
    async matrix(homes: LngLat[], site: LngLat, toCampus: boolean): Promise<(number | null)[]> {
      await pace();
      const pts = homes.map(([x, y]) => ({ lat: y, lon: x })), s = [{ lat: site[1], lon: site[0] }];
      const body = JSON.stringify({ sources: toCampus ? pts : s, targets: toCampus ? s : pts, costing: 'auto' });
      const res = await fetchImpl(`${base}/sources_to_targets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error(`Routing service error (HTTP ${res.status}).`);
      const j = (await res.json()) as { sources_to_targets: { time: number | null }[][] };
      const cells = toCampus ? j.sources_to_targets.map((row) => row[0]) : j.sources_to_targets[0];
      return cells.map((c) => (c && c.time != null ? Math.round((c.time / 60) * 1000) / 1000 : null));
    },
  };
}

async function timeHomes(blocks: BlockSet, idx: number[], site: LngLat, toCampus: boolean, io: Pick<DriveIO, 'matrix' | 'matrixChunk' | 'progress'>) {
  const times = new Map<number, number | null>(), step = io.matrixChunk ?? 99;
  for (let k = 0; k < idx.length; k += step) {
    io.progress?.(`Timing every home (${Math.min(k + step, idx.length)} of ${idx.length})`);
    const chunk = idx.slice(k, k + step);
    const t = await io.matrix(chunk.map((i) => [blocks.lon[i], blocks.lat[i]] as LngLat), site, toCampus);
    chunk.forEach((i, j) => times.set(i, t[j]));
  }
  return times;
}

/** Rings from cut-offs: time every home within Valhalla's area at the largest cut-off plus 2 minutes; a home is in a
 * ring when its time is at or under the cut-off. Outlines (display only) are drawn at the central cut-offs. */
export async function timedRings(lng: number, lat: number, window: DriveWindow, cutoffs: Cutoff[], blocks: BlockSet, io: Pick<DriveIO, 'isochrones' | 'matrix' | 'matrixChunk' | 'progress'>): Promise<DriveRing[]> {
  const toCampus = WINDOWS[window].toCampus, site: LngLat = [lng, lat];
  const reachMin = Math.min(40, Math.max(...cutoffs.map((c) => c.high)) + 2);
  const [reach] = await io.isochrones(lng, lat, [reachMin], toCampus);
  const outlines = await io.isochrones(lng, lat, cutoffs.map((c) => c.mid), toCampus, OUTLINE_GENERALIZE_M);
  const cand = blocksIn(blocks, reach);
  const times = await timeHomes(blocks, cand, site, toCampus, io);
  const within = (limit: number) => weightsFromBlocks(blocks, cand.filter((i) => { const t = times.get(i); return t != null && t <= limit; }));
  return cutoffs.map((c, r) => ({
    minutes: c.minutes, contour: c.mid, geometry: roundGeom(outlines[r], 4), area: within(c.mid),
    low: within(c.low), high: within(c.high), contourLow: c.low, contourHigh: c.high,
  }));
}

/** Step 1 of measuring a site (scripts/drive_measure.ts): choose 30 homes where children live inside Valhalla's
 * 16-minute area and time them with Google and Valhalla. The result is saved as a Measurement; deriveMeasured turns it
 * into areas. Costs SAMPLE_HOMES Google lookups. */
export async function measureSite(lng: number, lat: number, window: DriveWindow, blocks: BlockSet, children: (i: number) => number, io: DriveIO, today: string): Promise<Measurement> {
  const toCampus = WINDOWS[window].toCampus, site: LngLat = [lng, lat], key = siteKey(lng, lat);
  io.progress?.('Choosing homes to time');
  const [wide] = await io.isochrones(lng, lat, [16], toCampus);
  const picks = sampleHomes(blocks, blocksIn(blocks, wide), children, site, `${key}|${window}`);
  const homes = picks.map((i) => [blocks.lon[i], blocks.lat[i]] as LngLat);
  io.progress?.('Timing homes');
  const [v, g] = await Promise.all([io.matrix(homes, site, toCampus), io.google(homes, site, toCampus, window)]);
  const samples: FitSample[] = homes.map((h, i) => ({ lng: h[0], lat: h[1], valhalla: v[i], google: g[i] == null ? null : Math.round(g[i]! * 100) / 100 }));
  if (!fitLine(samples)) throw new Error('Too few homes could be timed to measure this site.');
  return { key, lng, lat, window, measuredOn: today, samples };
}

/** A measured site's saved result: re-time its sample homes on our routing server, fit to the saved Google times,
 * and count every home. No Google lookups. */
export async function deriveMeasured(m: Measurement, blocks: BlockSet, io: Pick<DriveIO, 'isochrones' | 'matrix' | 'matrixChunk' | 'progress'>, routing: string): Promise<DriveResult> {
  const toCampus = WINDOWS[m.window].toCampus;
  const v = await io.matrix(m.samples.map((s) => [s.lng, s.lat] as LngLat), [m.lng, m.lat], toCampus);
  const samples = m.samples.map((s, i) => ({ ...s, valhalla: v[i] }));
  const c = siteCutoffs(samples, `${m.key}|${m.window}`);
  if (!c) throw new Error(`Too few homes could be timed to fit ${m.key} ${m.window}.`);
  const rings = await timedRings(m.lng, m.lat, m.window, c.cutoffs, blocks, io);
  return { key: m.key, lng: m.lng, lat: m.lat, window: m.window, status: 'measured', source: 'saved', measuredOn: m.measuredOn, fit: c.fit, samples, rings, basis: null, routing, version: SHARED_GEO_VERSION };
}

/** An unmeasured site's saved result: every home timed on our routing server, counted under the regional cut-offs. */
export async function deriveEstimate(lng: number, lat: number, window: DriveWindow, cutoffs: Cutoff[], basis: string, blocks: BlockSet, io: Pick<DriveIO, 'isochrones' | 'matrix' | 'matrixChunk' | 'progress'>, routing: string): Promise<DriveResult> {
  const rings = await timedRings(lng, lat, window, cutoffs, blocks, io);
  return { key: siteKey(lng, lat), lng, lat, window, status: 'estimate', source: 'saved', measuredOn: null, fit: null, samples: [], rings, basis, routing, version: SHARED_GEO_VERSION };
}

/** Coordinates to `digits` decimals (5 = about 1 m) for saved outlines. */
export function roundGeom(g: Geom, digits = 5): Geom {
  const k = 10 ** digits;
  const r = (p: Pos) => [Math.round(p[0] * k) / k, Math.round(p[1] * k) / k];
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: g.coordinates.map((ring) => ring.map(r)) }
    : { type: 'MultiPolygon', coordinates: g.coordinates.map((part) => part.map((ring) => ring.map(r))) };
}

// Saved results: an index of sites plus one file per site holding both times of day. Tract shares are packed as one
// tract list per result and share arrays aligned to it (rounded to 1e-6), which keeps a site to tens of kilobytes.
export interface SavedIndexEntry { key: string; lng: number; lat: number; file: string; status: Partial<Record<DriveWindow, 'measured' | 'estimate'>> }
export interface SavedIndex { version: string; built: string; routing: string; census: string; calibration: string; sites: SavedIndexEntry[] }
interface PackedArea { s: number[]; c: number; n: number }
interface PackedRing { minutes: number; contour: number; contourLow: number | null; contourHigh: number | null; geometry: Geom; mid: PackedArea; low: PackedArea | null; high: PackedArea | null }
export interface PackedResult { key: string; lng: number; lat: number; window: DriveWindow; status: 'measured' | 'estimate'; measuredOn: string | null; fit: Fit | null; samples: FitSample[]; basis: string | null; routing: string; version: string; tracts: string[]; rings: PackedRing[] }
export interface SavedSiteFile { key: string; lng: number; lat: number; results: PackedResult[] }

export function packResult(r: DriveResult): PackedResult {
  const ids = new Set<string>();
  for (const ring of r.rings) for (const a of [ring.area, ring.low, ring.high]) if (a) for (const g of Object.keys(a.weights)) ids.add(g);
  const tracts = [...ids].sort();
  const pack = (a: AreaWeights | null): PackedArea | null => (a ? { s: tracts.map((g) => Math.round((a.weights[g] ?? 0) * 1e6) / 1e6), c: a.coverage, n: a.blocks } : null);
  return {
    key: r.key, lng: r.lng, lat: r.lat, window: r.window, status: r.status, measuredOn: r.measuredOn, fit: r.fit, samples: r.samples,
    basis: r.basis, routing: r.routing, version: r.version, tracts,
    rings: r.rings.map((x) => ({ minutes: x.minutes, contour: x.contour, contourLow: x.contourLow, contourHigh: x.contourHigh, geometry: x.geometry, mid: pack(x.area)!, low: pack(x.low), high: pack(x.high) })),
  };
}

export function unpackResult(p: PackedResult): DriveResult {
  const un = (a: PackedArea | null): AreaWeights | null => {
    if (!a) return null;
    const weights: Record<string, number> = {};
    p.tracts.forEach((g, i) => { if (a.s[i] > 0) weights[g] = a.s[i]; });
    return { weights, coverage: a.c, blocks: a.n };
  };
  return {
    key: p.key, lng: p.lng, lat: p.lat, window: p.window, status: p.status, source: 'saved', measuredOn: p.measuredOn, fit: p.fit, samples: p.samples,
    basis: p.basis, routing: p.routing, version: p.version,
    rings: p.rings.map((x) => ({ minutes: x.minutes, contour: x.contour, contourLow: x.contourLow, contourHigh: x.contourHigh, geometry: x.geometry, area: un(x.mid)!, low: un(x.low), high: un(x.high) })),
  };
}

/** Where each tool reads saved results from: the index, and a loader for one site's file. */
export interface SavedSource { index: SavedIndex | null; load(file: string): Promise<SavedSiteFile | null> }

/** The saved site for a pin: the nearest within SAVED_RADIUS_M. */
export function findSavedEntry(index: SavedIndex | null | undefined, lng: number, lat: number): SavedIndexEntry | null {
  let best: SavedIndexEntry | null = null, bd = Infinity;
  for (const s of index?.sites ?? []) {
    if (Math.abs(s.lat - lat) > 0.01 || Math.abs(s.lng - lng) > 0.012) continue;
    const d = distanceMeters([lng, lat], [s.lng, s.lat]);
    if (d <= SAVED_RADIUS_M && d < bd) { bd = d; best = s; }
  }
  return best;
}

export async function findSaved(saved: SavedSource | null | undefined, lng: number, lat: number, window: DriveWindow): Promise<DriveResult | null> {
  const entry = findSavedEntry(saved?.index, lng, lat);
  if (!saved || !entry || !entry.status[window]) return null;
  const file = await saved.load(entry.file);
  const hit = file?.results.find((r) => r.window === window);
  return hit ? unpackResult(hit) : null;
}

export interface RingSetting { contour?: number; contourLow?: number; contourHigh?: number; status?: string; basis?: string }
/** Calibration regions (data/drive_time_calibration.json): Florida sites are south of 31N, Camden near 39.9N, Newark and
 * Paterson near 40.7-40.9N. */
export type CalibrationRegion = 'florida' | 'camden' | 'newark';
export const driveRegion = (lat: number): CalibrationRegion => (lat < 31 ? 'florida' : lat < 40.3 ? 'camden' : 'newark');
export interface CalibrationFile { regions: Record<string, Record<string, Record<string, RingSetting>>> }
/** The regional setting for each ring at a latitude and time of day. */
export function regionalSettings(cal: CalibrationFile, lat: number, window: DriveWindow): Record<number, RingSetting> {
  const set = cal.regions[driveRegion(lat)][window];
  const out: Record<number, RingSetting> = {};
  for (const m of Object.keys(set)) out[Number(m)] = set[m];
  return out;
}

/** A live estimate for a pin with no saved result: Valhalla outlines at the regional cut-offs (central, low, high),
 * counted block by block. Three requests to the public server. */
export async function estimateRings(lng: number, lat: number, window: DriveWindow, settings: Record<number, RingSetting>, blocks: BlockSet, io: Pick<DriveIO, 'isochrones'>, minutes: number[] = DRIVE_MINUTES): Promise<DriveResult> {
  const rings: DriveRing[] = [];
  for (const m of minutes) {
    const s = settings[m] ?? {}, mid = s.contour ?? m, lo = s.contourLow ?? mid, hi = s.contourHigh ?? mid;
    const [g, gl, gh] = await io.isochrones(lng, lat, [mid, lo, hi], WINDOWS[window].toCampus);
    const w = (x: Geom) => weightsFromBlocks(blocks, blocksIn(blocks, x));
    rings.push({ minutes: m, contour: mid, geometry: g, area: w(g), low: w(gl), high: w(gh), contourLow: lo, contourHigh: hi });
  }
  const basis = settings[minutes[0]]?.basis ?? null;
  return { key: siteKey(lng, lat), lng, lat, window, status: 'estimate', source: 'live', measuredOn: null, fit: null, samples: [], rings, basis, routing: 'Valhalla public server (FOSSGIS), current OpenStreetMap', version: SHARED_GEO_VERSION };
}

/** Drive-time areas for a pin: its saved result when there is one, otherwise a live estimate. */
export async function driveAreas(lng: number, lat: number, window: DriveWindow, saved: SavedSource | null | undefined, settings: Record<number, RingSetting>, blocks: BlockSet, io: Pick<DriveIO, 'isochrones'>, minutes: number[] = DRIVE_MINUTES): Promise<DriveResult> {
  const hit = await findSaved(saved, lng, lat, window);
  if (hit) return { ...hit, rings: hit.rings.filter((r) => minutes.includes(r.minutes)) };
  return estimateRings(lng, lat, window, settings, blocks, io, minutes);
}

export interface RingDemographics { mid: AreaDemographics; low: AreaDemographics | null; high: AreaDemographics | null }
/** A ring's figures with its 80% range (the low and high areas aggregated the same way). */
export function ringDemographics(figures: (geoid: string) => TractFigures | null | undefined, ring: Pick<DriveRing, 'area' | 'low' | 'high'>): RingDemographics {
  return { mid: aggregate(figures, ring.area), low: ring.low ? aggregate(figures, ring.low) : null, high: ring.high ? aggregate(figures, ring.high) : null };
}

/** One line on how the areas were made, for reports and exports in both tools. */
export function driveNote(r: Pick<DriveResult, 'status' | 'source' | 'window' | 'fit' | 'measuredOn' | 'basis'>): string {
  const w = WINDOWS[r.window];
  const head = `${w.label} (${w.toCampus ? 'home to campus' : 'campus to home'}, school day).`;
  if (r.status === 'measured' && r.fit) {
    return `${head} Measured for this site on ${r.measuredOn}: ${r.fit.n} homes timed by Google Maps, every nearby home timed on OpenStreetMap roads and adjusted to Google's time (typical miss for one home ${r.fit.rmse.toFixed(1)} min). Ranges are 80% ranges.`;
  }
  const basis = r.basis ? ` (${r.basis})` : '';
  const spread = 'The range spans the measured sites; estimates have been off by about a third at a typical site.';
  if (r.source === 'saved') {
    return `${head} Estimate: this site hasn't been timed by Google, so every home is timed on OpenStreetMap roads and adjusted the way measured sites in the region are${basis}. ${spread} Measure it with scripts/drive_measure.ts.`;
  }
  return `${head} Live estimate: no saved result for this point, so the areas are drawn now from the regional adjustment${basis}. Less exact than a saved result. ${spread}`;
}
