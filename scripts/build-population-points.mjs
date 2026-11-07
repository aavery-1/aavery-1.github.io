// Builds public/data/population_points.json: the 2020 Census populated blocks
// (internal point + POP100) for the 8 loaded counties, plus the ACS 2019-2023
// block-group values they carry. The browser uses it to compute neighborhood
// demographics for ANY polygon (drive-time isochrones) with exactly the same
// dasymetric method as scripts/build-school-demographics.mjs uses for the fixed
// 1/2/5/8-mile rings, so a drive-time figure and a ring figure are comparable:
//   - a block is in the area when its internal point is inside the polygon;
//   - it carries its block group's ACS values in proportion to its share of the
//     block group's 2020 population;
//   - MOEs combine as root-sum-of-squares of the apportioned parts; median income
//     is a household-weighted mean of block-group medians (approximate).
//
// Compact layout (loaded lazily, only when a drive time is requested):
//   bg_fields: names of the per-block-group columns
//   bg:        array of rows, one per block group, in bg_fields order
//   blocks:    flat int array [lon*1e5, lat*1e5, pop, bgIndex, ...]
//
// Requires CENSUS_API_KEY in .env. Run: npm run data:poppoints
// Fetches are cached in the same temp dir as build-school-demographics.mjs.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEY = process.env.CENSUS_API_KEY || "";
const ACS_YEAR = "2023";
const OUT_FILE = "public/data/population_points.json";
const COUNTIES = {
  "086": "Miami-Dade", "011": "Broward", "099": "Palm Beach", "095": "Orange",
  "117": "Seminole", "097": "Osceola", "069": "Lake", "105": "Polk",
};

const CACHE = join(tmpdir(), "soh-demographics-cache");
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
const readCache = (k) => (existsSync(join(CACHE, k)) ? JSON.parse(readFileSync(join(CACHE, k), "utf8")) : null);
const writeCache = (k, v) => writeFileSync(join(CACHE, k), JSON.stringify(v));

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

const clean = (v) => { const n = Number(v); return Number.isFinite(n) && n > -1e8 ? n : null; };

const ACS_VARS = [
  "B01003_001E", "B01003_001M",
  "B01001_004E", "B01001_005E", "B01001_028E", "B01001_029E",
  "B01001_004M", "B01001_005M", "B01001_028M", "B01001_029M",
  "B02001_001E", "B02001_003E", "B02001_003M",
  "B03003_001E", "B03003_003E", "B03003_003M",
  "B19013_001E", "B19013_001M",
  "B11001_001E",
];

// Same cache key and record shape as build-school-demographics.mjs.
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
      byBg[bg] = {
        pop: est("B01003_001E"), popMoe: moe("B01003_001M"),
        k8: est("B01001_004E") + est("B01001_005E") + est("B01001_028E") + est("B01001_029E"),
        k8Moe: Math.sqrt(moe("B01001_004M") ** 2 + moe("B01001_005M") ** 2 + moe("B01001_028M") ** 2 + moe("B01001_029M") ** 2),
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

const BLOCK_LAYER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/10/query";
async function fetchBlocks() {
  const cached = readCache("blocks.json");
  if (cached) return cached;
  const all = [];
  for (const cfips of Object.keys(COUNTIES)) {
    const where = encodeURIComponent(`STATE='12' AND COUNTY='${cfips}' AND POP100>0`);
    for (let offset = 0; ; offset += 2000) {
      const url = `${BLOCK_LAYER}?where=${where}&outFields=GEOID,POP100,INTPTLAT,INTPTLON` +
        `&returnGeometry=false&f=json&orderByFields=GEOID&resultOffset=${offset}&resultRecordCount=2000`;
      const feats = (await getJson(url)).features || [];
      for (const f of feats) {
        const a = f.attributes;
        all.push({ bg: String(a.GEOID).slice(0, 12), pop: a.POP100, lat: Number(a.INTPTLAT), lon: Number(a.INTPTLON) });
      }
      if (feats.length < 2000) break;
    }
    console.error(`blocks ${COUNTIES[cfips]}: ${all.length} cumulative (pop>0)`);
  }
  writeCache("blocks.json", all);
  return all;
}

async function main() {
  const [acs, blocks] = await Promise.all([fetchAcsBlockGroups(), fetchBlocks()]);
  const BG_FIELDS = ["pop", "popMoe", "k8", "k8Moe", "raceUniverse", "black", "blackMoe",
    "hispUniverse", "hisp", "hispMoe", "medInc", "medIncMoe", "households", "totalBlockPop"];
  const bgTotalPop = {};
  for (const b of blocks) bgTotalPop[b.bg] = (bgTotalPop[b.bg] || 0) + b.pop;

  const bgIndex = new Map();
  const bgRows = [];
  const flat = [];
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  for (const b of blocks) {
    const d = acs[b.bg];
    if (!d || !bgTotalPop[b.bg]) continue;
    let i = bgIndex.get(b.bg);
    if (i == null) {
      i = bgRows.length;
      bgIndex.set(b.bg, i);
      bgRows.push(BG_FIELDS.map((f) => (f === "totalBlockPop" ? bgTotalPop[b.bg] : r1(d[f]))));
    }
    flat.push(Math.round(b.lon * 1e5), Math.round(b.lat * 1e5), b.pop, i);
  }
  const out = {
    vintage: `2020 Census blocks (POP100) + ACS ${Number(ACS_YEAR) - 4}-${ACS_YEAR} 5-year block groups`,
    source: "U.S. Census Bureau: TIGERweb Census 2020 blocks; ACS 5-year API",
    method: "Dasymetric: a block counts when its internal point is inside the area; it carries its block group's ACS values by its share of the block group's 2020 population.",
    counties: Object.values(COUNTIES),
    bg_fields: BG_FIELDS,
    bg: bgRows,
    blocks: flat,
  };
  writeFileSync(OUT_FILE, JSON.stringify(out));
  console.error(`Wrote ${OUT_FILE}: ${bgRows.length} block groups, ${flat.length / 4} blocks, ${(JSON.stringify(out).length / 1e6).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
