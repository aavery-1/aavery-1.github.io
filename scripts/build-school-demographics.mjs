// Builds public/data/school_demographics.json: for every school (by MSID) and
// every radius ring (1, 2, 5, 8 miles), the neighborhood's total population,
// K-8 age population (ages 5-14), median household income, % Black, and %
// Hispanic, as a defensible dasymetric estimate.
//
// METHOD (why this is the accurate, professional-standard estimate, not a guess)
// -----------------------------------------------------------------------------
//   1. People are placed where they actually live using 2020 Census BLOCKS
//      (P.L. 94-171 POP100, a 100% count, not a survey sample). Block populations
//      and internal points come from Census TIGERweb (Census 2020 vintage).
//   2. Demographics come from the American Community Survey 2019-2023 5-year
//      estimates at BLOCK-GROUP level (the finest geography ACS publishes for
//      these tables). Each block inherits its block group's values, weighted by
//      the block's real share of the block group's population.
//   3. A block counts toward a ring when its internal point is within the ring's
//      radius of the school, measured with the SAME WGS84 ellipsoidal geodesic
//      (Vincenty) the app draws its rings with. No census polygon is ever guessed
//      as "half in": a block is in or out, and its people are where they live.
//
// This does not overcount empty land (water, parks, industrial) the way pure
// area-weighting does, because empty blocks carry zero population.
//
// HONESTY / LIMITS (surfaced in the UI, not hidden)
//   - ACS is a sample: every demographic value has a margin of error (MOE). We
//     carry and combine MOEs so the tool can show them. Combined MOEs are
//     approximate (standard root-sum-of-squares of apportioned parts).
//   - Median household income CANNOT be summed. We report a household-weighted
//     mean of the block-group medians in the ring, labeled as an approximation.
//   - "Ages 5-14" is the closest ACS age-bracket proxy for K-8 (brackets are
//     5-9 and 10-14).
//   - Coverage: rings that reach a populated Florida county we did not load are
//     flagged with a coverage percentage so a partial number is never shown as if
//     it were complete.
//
// Requires a Census API key in .env (CENSUS_API_KEY). Run:
//   node --env-file=.env scripts/build-school-demographics.mjs
//
// Network fetches (blocks, ACS, county polygons) are cached under a temp dir so
// reruns are cheap and resumable. Delete the cache dir to force a fresh pull.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { booleanPointInPolygon } from "@turf/turf";

const KEY = process.env.CENSUS_API_KEY || "";
const ACS_YEAR = "2023";                 // ACS 2019-2023 5-year
const RADII = [1, 2, 5, 8];              // miles
const SCHOOLS_FILE = "public/data/schools.sample.geojson";
const OUT_FILE = "public/data/school_demographics.json";

// Counties loaded (FIPS -> name). Core pilot counties plus their populated
// neighbors, so an 8-mile ring near a county edge is not silently undercounted.
// Wetland/water-only reaches (deep Everglades, the Atlantic/Gulf, the Keys) hold
// effectively no population and are handled by the coverage check, not by loading
// every distant county.
const COUNTIES = {
  "086": "Miami-Dade",
  "011": "Broward",
  "099": "Palm Beach",
  "095": "Orange",
  "117": "Seminole",
  "097": "Osceola",
  "069": "Lake",
  "105": "Polk",
};
const COVERED = new Set(Object.keys(COUNTIES).map((c) => "12" + c));

const CACHE = join(tmpdir(), "soh-demographics-cache");
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
const cachePath = (k) => join(CACHE, k);
const readCache = (k) => (existsSync(cachePath(k)) ? JSON.parse(readFileSync(cachePath(k), "utf8")) : null);
const writeCache = (k, v) => writeFileSync(cachePath(k), JSON.stringify(v));

async function getJson(url, tries = 5) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 204) return [];
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt === tries) throw e;
      await new Promise((res) => setTimeout(res, 800 * attempt));
    }
  }
}

// --- WGS84 ellipsoidal geodesic (Vincenty inverse), identical model to the app's
// src/geo/geodesic.ts, so a block's in-ring test matches the drawn ring exactly.
const A = 6378137.0, F = 1 / 298.257223563, B = (1 - F) * A;
const METERS_PER_MILE = 1609.344;
const toRad = (d) => (d * Math.PI) / 180;
function ellipsoidalMeters(lon1, lat1, lon2, lat2) {
  const L = toRad(lon2 - lon1);
  const U1 = Math.atan((1 - F) * Math.tan(toRad(lat1)));
  const U2 = Math.atan((1 - F) * Math.tan(toRad(lat2)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L, prev = 0, iter = 0;
  let cosSqAlpha = 0, sinSigma = 0, cosSigma = 0, sigma = 0, cos2SigmaM = 0;
  do {
    const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
    prev = lambda;
    lambda = L + (1 - C) * F * sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - prev) > 1e-12 && ++iter < 200);
  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const Acoef = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bcoef = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = Bcoef * sinSigma * (cos2SigmaM + (Bcoef / 4) *
    (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
      (Bcoef / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return B * Acoef * (sigma - deltaSigma);
}
const milesBetween = (lon1, lat1, lon2, lat2) => ellipsoidalMeters(lon1, lat1, lon2, lat2) / METERS_PER_MILE;

const clean = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > -1e8 ? n : null;
};

// --- ACS block-group demographics ------------------------------------------
// E = estimate, M = 90% margin of error. Ages 5-14 = male+female 5-9 and 10-14.
const ACS_VARS = [
  "B01003_001E", "B01003_001M",                 // total population
  "B01001_004E", "B01001_005E", "B01001_028E", "B01001_029E", // ages 5-14 (M/F 5-9,10-14) estimate
  "B01001_004M", "B01001_005M", "B01001_028M", "B01001_029M", // ages 5-14 MOEs
  "B02001_001E", "B02001_003E", "B02001_003M",  // race universe, Black alone (+MOE)
  "B03003_001E", "B03003_003E", "B03003_003M",  // hispanic universe, Hispanic (+MOE)
  "B19013_001E", "B19013_001M",                 // median household income (+MOE)
  "B11001_001E",                                // households (income weight)
];

async function fetchAcsBlockGroups() {
  const cached = readCache(`acs_${ACS_YEAR}.json`);
  if (cached) return cached;
  const byBg = {};
  for (const cfips of Object.keys(COUNTIES)) {
    const url = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5?get=${ACS_VARS.join(",")}` +
      `&for=block%20group:*&in=state:12+county:${cfips}&in=tract:*` + (KEY ? `&key=${KEY}` : "");
    const rows = await getJson(url);
    const h = Object.fromEntries(rows[0].map((c, i) => [c, i]));
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const bg = r[h.state] + r[h.county] + r[h.tract] + r[h["block group"]];
      const moe = (v) => clean(r[h[v]]) ?? 0;
      const est = (v) => clean(r[h[v]]) ?? 0;
      const k8 = est("B01001_004E") + est("B01001_005E") + est("B01001_028E") + est("B01001_029E");
      // Combined MOE of a sum = root-sum-of-squares of the parts' MOEs.
      const k8Moe = Math.sqrt(moe("B01001_004M") ** 2 + moe("B01001_005M") ** 2 +
        moe("B01001_028M") ** 2 + moe("B01001_029M") ** 2);
      byBg[bg] = {
        pop: est("B01003_001E"), popMoe: moe("B01003_001M"),
        k8, k8Moe,
        raceUniverse: est("B02001_001E"), black: est("B02001_003E"), blackMoe: moe("B02001_003M"),
        hispUniverse: est("B03003_001E"), hisp: est("B03003_003E"), hispMoe: moe("B03003_003M"),
        medInc: clean(r[h.B19013_001E]), medIncMoe: clean(r[h.B19013_001M]),
        households: est("B11001_001E"),
      };
    }
    console.error(`ACS block groups ${COUNTIES[cfips]}: ${Object.keys(byBg).length} cumulative`);
  }
  writeCache(`acs_${ACS_YEAR}.json`, byBg);
  return byBg;
}

// --- 2020 Census blocks (population + internal point) from TIGERweb ----------
const BLOCK_LAYER =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/10/query";

async function fetchBlocks() {
  const cached = readCache("blocks.json");
  if (cached) return cached;
  const all = [];
  for (const cfips of Object.keys(COUNTIES)) {
    const where = encodeURIComponent(`STATE='12' AND COUNTY='${cfips}' AND POP100>0`);
    let offset = 0;
    for (;;) {
      const url = `${BLOCK_LAYER}?where=${where}&outFields=GEOID,POP100,INTPTLAT,INTPTLON` +
        `&returnGeometry=false&f=json&orderByFields=GEOID&resultOffset=${offset}&resultRecordCount=2000`;
      const d = await getJson(url);
      const feats = d.features || [];
      for (const f of feats) {
        const a = f.attributes;
        all.push({
          bg: String(a.GEOID).slice(0, 12),
          pop: a.POP100,
          lat: Number(a.INTPTLAT),
          lon: Number(a.INTPTLON),
        });
      }
      if (feats.length < 2000) break;
      offset += 2000;
    }
    console.error(`blocks ${COUNTIES[cfips]}: ${all.length} cumulative (pop>0)`);
  }
  writeCache("blocks.json", all);
  return all;
}

// --- Florida county polygons, to flag partial coverage ----------------------
// A ring point is "covered" if inside a loaded county, "gap" if inside another
// FL county we did not load (a real, populated hole), or ignored if in no county
// (ocean/gulf: no population, so not a data gap).
async function fetchFlCounties() {
  const cached = readCache("fl_counties.json");
  if (cached) return cached;
  const url = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/82/query" +
    `?where=${encodeURIComponent("STATE='12'")}&outFields=GEOID&returnGeometry=true` +
    `&maxAllowableOffset=0.002&geometryPrecision=5&outSR=4326&f=geojson`;
  const d = await getJson(url);
  writeCache("fl_counties.json", d);
  return d;
}

// Fraction of a ring that lies over populated (county) land we have loaded.
// Sample points across the disk (sunflower distribution) and classify each.
function coverageFraction(lon, lat, miles, flCounties) {
  const N = 96;
  let covered = 0, gap = 0;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(toRad(lat));
  for (let i = 0; i < N; i++) {
    const rad = Math.sqrt((i + 0.5) / N) * miles * METERS_PER_MILE; // meters from center
    const theta = i * golden;
    const dLat = (rad * Math.cos(theta)) / mPerDegLat;
    const dLon = (rad * Math.sin(theta)) / mPerDegLon;
    const pt = [lon + dLon, lat + dLat];
    let inSome = false, inCovered = false;
    for (const f of flCounties.features) {
      if (booleanPointInPolygon(pt, f)) {
        inSome = true;
        if (COVERED.has(f.properties.GEOID)) inCovered = true;
        break;
      }
    }
    if (inCovered) covered++;
    else if (inSome) gap++;
    // in no county -> water, ignored (no population to miss)
  }
  const denom = covered + gap;
  return denom === 0 ? 1 : covered / denom;
}

// Census proportion MOE: MOE(p) where p = num/den, given MOEs of num and den.
// Uses the standard derived-proportion formula; falls back to the ratio formula
// when the radicand is negative (Census guidance).
function proportionMoe(num, den, numMoe, denMoe) {
  if (!den) return null;
  const p = num / den;
  const rad = numMoe * numMoe - p * p * denMoe * denMoe;
  const inner = rad < 0 ? numMoe * numMoe + p * p * denMoe * denMoe : rad;
  return Math.sqrt(inner) / den;
}

function main() {
  return (async () => {
    const [acs, blocks, flCounties, schoolsRaw] = await Promise.all([
      fetchAcsBlockGroups(), fetchBlocks(), fetchFlCounties(),
      Promise.resolve(JSON.parse(readFileSync(SCHOOLS_FILE, "utf8"))),
    ]);
    console.error(`Loaded: ${Object.keys(acs).length} block groups, ${blocks.length} populated blocks`);

    // Total 2020 block population per block group (denominator for the block's
    // share of its block group's ACS values). Sum over the populated blocks we
    // loaded; empty blocks contribute 0, so this equals the true block-group total.
    const bgTotalPop = {};
    for (const b of blocks) bgTotalPop[b.bg] = (bgTotalPop[b.bg] || 0) + b.pop;

    // Coarse grid index (0.1 deg cells) so each school only tests nearby blocks.
    const CELL = 0.1; // ~6.9 miles lat; an 8-mile ring spans at most a few cells
    const grid = new Map();
    const key = (gx, gy) => `${gx}:${gy}`;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const gx = Math.floor(b.lon / CELL), gy = Math.floor(b.lat / CELL);
      const k = key(gx, gy);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(i);
    }

    const maxR = Math.max(...RADII);
    const schools = {};
    let done = 0;
    for (const feat of schoolsRaw.features) {
      const msid = feat.properties.msid;
      const c = feat.geometry?.coordinates;
      if (!msid || !Array.isArray(c) || c.length < 2 || c[0] == null) continue;
      const [lon, lat] = c;

      // Candidate blocks: grid cells whose span covers maxR (pad by one cell).
      // 1 deg lat ~ 69 mi; 1 deg lon ~ 69*cos(lat) mi. Take the larger cell reach.
      const cellSpanLat = Math.ceil(maxR / 69 / CELL) + 1;
      const cellSpanLon = Math.ceil(maxR / (69 * Math.cos(toRad(lat))) / CELL) + 1;
      const reach = Math.max(cellSpanLat, cellSpanLon);
      const gx0 = Math.floor(lon / CELL), gy0 = Math.floor(lat / CELL);
      const candidates = [];
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          const arr = grid.get(key(gx0 + dx, gy0 + dy));
          if (arr) for (const idx of arr) candidates.push(idx);
        }
      }

      // Distance from school to each candidate block, once.
      const rings = RADII.map((r) => ({
        r, pop: 0, popMoe2: 0, k8: 0, k8Moe2: 0,
        black: 0, blackMoe2: 0, raceUniv: 0,
        hisp: 0, hispMoe2: 0, hispUniv: 0,
        incWeight: 0, incWeighted: 0, incMoe2: 0,
        blocks: 0,
      }));
      // Track, per ring, each block group's accumulated in-ring block population,
      // so income weighting and MOE aggregation use per-BG shares (not per-block).
      const bgAccum = RADII.map(() => new Map()); // ring -> Map(bg -> inRingBlockPop)

      for (const idx of candidates) {
        const b = blocks[idx];
        const denom = bgTotalPop[b.bg];
        if (!denom) continue;
        const dist = milesBetween(lon, lat, b.lon, b.lat);
        for (let ri = 0; ri < RADII.length; ri++) {
          if (dist > RADII[ri]) continue;
          const share = b.pop / denom;            // block's share of its BG
          const d = acs[b.bg];
          const ring = rings[ri];
          ring.blocks++;
          bgAccum[ri].set(b.bg, (bgAccum[ri].get(b.bg) || 0) + b.pop);
          if (d) {
            ring.pop += d.pop * share;
            ring.k8 += d.k8 * share;
            ring.black += d.black * share;
            ring.raceUniv += d.raceUniverse * share;
            ring.hisp += d.hisp * share;
            ring.hispUniv += d.hispUniverse * share;
          }
        }
      }

      // Per-BG shares -> MOE aggregation (root-sum-of-squares of apportioned parts)
      // and household-weighted median income.
      const out = rings.map((ring, ri) => {
        let popMoe2 = 0, k8Moe2 = 0, blackMoe2 = 0, hispMoe2 = 0;
        let incW = 0, incWV = 0, incMoe2 = 0;
        for (const [bg, inPop] of bgAccum[ri]) {
          const d = acs[bg];
          const denom = bgTotalPop[bg];
          if (!d || !denom) continue;
          const w = inPop / denom; // fraction of this BG inside the ring
          popMoe2 += (d.popMoe * w) ** 2;
          k8Moe2 += (d.k8Moe * w) ** 2;
          blackMoe2 += (d.blackMoe * w) ** 2;
          hispMoe2 += (d.hispMoe * w) ** 2;
          if (d.medInc != null) {
            const hh = d.households * w;          // households of this BG inside ring
            if (hh > 0) {
              incW += hh;
              incWV += d.medInc * hh;
              if (d.medIncMoe != null) incMoe2 += (d.medIncMoe * hh) ** 2;
            }
          }
        }
        const pop = ring.pop;
        const pctBlack = ring.raceUniv > 0 ? ring.black / ring.raceUniv : null;
        const pctHisp = ring.hispUniv > 0 ? ring.hisp / ring.hispUniv : null;
        const pctBlackMoe = proportionMoe(ring.black, ring.raceUniv, Math.sqrt(blackMoe2), Math.sqrt(popMoe2));
        const pctHispMoe = proportionMoe(ring.hisp, ring.hispUniv, Math.sqrt(hispMoe2), Math.sqrt(popMoe2));
        const round = (x) => Math.round(x);
        return {
          r: ring.r,
          blocks: ring.blocks,
          total_pop: round(pop),
          total_pop_moe: round(Math.sqrt(popMoe2)),
          k8_pop: round(ring.k8),
          k8_pop_moe: round(Math.sqrt(k8Moe2)),
          pct_black: pctBlack == null ? null : +(pctBlack * 100).toFixed(1),
          pct_black_moe: pctBlackMoe == null ? null : +(pctBlackMoe * 100).toFixed(1),
          pct_hispanic: pctHisp == null ? null : +(pctHisp * 100).toFixed(1),
          pct_hispanic_moe: pctHispMoe == null ? null : +(pctHispMoe * 100).toFixed(1),
          median_income: incW > 0 ? round(incWV / incW) : null,
          median_income_moe: incW > 0 ? round(Math.sqrt(incMoe2) / incW) : null,
          coverage_pct: +coverageFraction(lon, lat, ring.r, flCounties).toFixed(3),
        };
      });

      schools[msid] = { lon: +lon.toFixed(6), lat: +lat.toFixed(6), rings: out };
      if (++done % 100 === 0) console.error(`schools processed: ${done}`);
    }

    const output = {
      source: "U.S. Census Bureau ACS 2019-2023 5-year (B01003, B01001, B02001, B03003, B19013, B11001) + TIGERweb Census 2020 blocks (POP100)",
      vintage: "ACS 2019-2023 5-year; 2020 Census blocks",
      method: "Dasymetric: ACS block-group values distributed to 2020 Census blocks by block population, summed within each geodesic ring (block internal point within radius, WGS84 ellipsoidal). Median household income is household-weighted across block groups (approximate). MOEs are 90% ACS margins combined by root-sum-of-squares (approximate).",
      generated: new Date().toISOString().slice(0, 10),
      counties_covered: Object.values(COUNTIES),
      radii_miles: RADII,
      k8_definition: "ACS ages 5-14 (male+female 5-9 and 10-14), the closest bracket-aligned proxy for K-8.",
      schools,
    };
    writeFileSync(OUT_FILE, JSON.stringify(output));
    console.error(`\nWrote ${Object.keys(schools).length} schools to ${OUT_FILE}`);
  })();
}

main().catch((e) => { console.error("BUILD FAILED:", e); process.exit(1); });
