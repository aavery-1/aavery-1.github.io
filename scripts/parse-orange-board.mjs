// Assign Orange County schools to their school-board district (1-7).
//
// Orange County GIS does not publish board-district polygons the way Miami-Dade
// and Broward do (see scripts/fetch-board-districts.mjs), so the board layer and
// the board filter had no Orange coverage. Instead we use OCPS's own per-district
// pages, which list every district-run school in each board member's district.
// This maps each listed school to a tool MSID (by normalized name + level) so
// Orange schools resolve in the district filter.
//
// Run:  node scripts/parse-orange-board.mjs   (npm run data:orangeboard)
//
// INPUTS  (saved OCPS pages, one per district):
//   scripts/sources/orange-board/Orange County Public Schools - District N - *.html
//   public/data/schools.sample.geojson   (for name -> MSID matching)
// OUTPUT:
//   public/data/orange_board_districts.json   { "<msid>": <district 1-7> }
//   scripts/out/orange-board-report.txt       (matched / unmatched audit)
//
// Member names are intentionally NOT recorded: the names in the source filenames
// are unreliable, and the tool keys board districts by number.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

// The OCPS pages embed CSS that jsdom's stylesheet parser chokes on; we only need
// the DOM structure, so swallow those non-fatal parser errors.
const quietConsole = new VirtualConsole();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC_DIR = resolve(ROOT, "scripts/sources/orange-board");
const SCHOOLS = resolve(ROOT, "public/data/schools.sample.geojson");
const OUT_JSON = resolve(ROOT, "public/data/orange_board_districts.json");
const OUT_REPORT = resolve(ROOT, "scripts/out/orange-board-report.txt");

// --- Extract the district's school list from one OCPS page. The district's own
// schools live in the content accordion panels (a[href] to a *.ocps.net school
// site); the site-wide nav mega-menu and announcement panels are skipped. Level
// comes from the school-site subdomain suffix (es / k8 / ms / hs). ---
function levelFromHost(host) {
  if (host.endsWith("k8.ocps.net")) return "K-8";
  const sub = host.split(".ocps.net")[0].split(".").pop();
  if (/es$/.test(sub)) return "Elementary";
  if (/ms$/.test(sub)) return "Middle";
  if (/hs$/.test(sub)) return "High";
  return "Other";
}

function extractDistrict(html) {
  const doc = new JSDOM(html, { virtualConsole: quietConsole }).window.document;
  const seen = new Set();
  const schools = [];
  for (const panel of doc.querySelectorAll(".ss-accordion-panel")) {
    for (const a of panel.querySelectorAll("a[href]")) {
      const m = /^https?:\/\/([a-z0-9-]+\.ocps\.net)\/?$/i.exec((a.getAttribute("href") || "").trim());
      const name = a.textContent.trim();
      if (!m || !name) continue;
      const host = m[1].toLowerCase();
      if (host === "www.ocps.net" || host === "ocps.net" || seen.has(host)) continue;
      seen.add(host);
      schools.push({ name, host, level: levelFromHost(host) });
    }
  }
  return schools;
}

// --- Name matching -----------------------------------------------------------
const STOP = new Set(["elementary", "middle", "high", "school", "k-8", "k8", "k-12", "k12", "jr", "sr", "the", "of"]);
function normTokens(s) {
  const cleaned = s.toLowerCase().replace(/'/g, "").replace(/\./g, " ").replace(/-/g, " ").replace(/[^a-z0-9 ]/g, " ");
  return new Set(cleaned.split(/\s+/).filter((t) => t && !STOP.has(t)));
}
function levelOk(extLevel, toolLevel) {
  if (extLevel === "Elementary" || extLevel === "Middle" || extLevel === "High") return toolLevel === extLevel;
  if (extLevel === "K-8") return toolLevel === "Combination" || toolLevel === "Elementary" || toolLevel === "Middle";
  return true; // "Other" (special/virtual schools): any level, but exact core required below
}
const isTech = (name) => name.toLowerCase().includes("technical college");
const subset = (a, b) => [...a].every((x) => b.has(x));
const symDiff = (a, b) => [...a].filter((x) => !b.has(x)).length + [...b].filter((x) => !a.has(x)).length;

function bestMatch(ext, toolNorm) {
  const et = normTokens(ext.name);
  if (et.size === 0) return null;
  const cands = [];
  for (const t of toolNorm) {
    if (!levelOk(ext.level, t.level)) continue;
    const exact = et.size === t.tokens.size && subset(et, t.tokens);
    if (ext.level === "Other" && !exact) continue; // avoid loose matches for special schools
    if (!(subset(et, t.tokens) || subset(t.tokens, et))) continue;
    cands.push({ exact: exact ? 0 : 1, tech: isTech(t.name) ? 1 : 0, dist: symDiff(et, t.tokens), ...t });
  }
  cands.sort((a, b) => a.exact - b.exact || a.tech - b.tech || a.dist - b.dist);
  if (cands.length === 0) return null;
  const top = cands[0];
  const tied = cands.filter((c) => c.exact === top.exact && c.tech === top.tech && c.dist === top.dist);
  return tied.length > 1 ? { ambiguous: tied } : top;
}

// --- Run ---------------------------------------------------------------------
const files = readdirSync(SRC_DIR).filter((f) => /District \d+/.test(f) && f.endsWith(".html"));
const orangeTool = JSON.parse(readFileSync(SCHOOLS, "utf-8")).features
  .filter((f) => f.properties.county === "Orange")
  .map((f) => ({ msid: f.properties.msid, name: f.properties.name, level: f.properties.level, tokens: normTokens(f.properties.name) }));

const assign = {}; // msid -> district
const assignedName = {};
const unmatched = [];
const ambiguous = [];
let extractedCount = 0;

for (const file of files.sort()) {
  const district = Number(/District (\d+)/.exec(file)[1]);
  const schools = extractDistrict(readFileSync(resolve(SRC_DIR, file), "utf-8"));
  for (const s of schools) {
    extractedCount++;
    const m = bestMatch(s, orangeTool);
    if (!m) { unmatched.push({ district, ...s }); continue; }
    if (m.ambiguous) { ambiguous.push({ district, name: s.name, level: s.level, options: m.ambiguous.map((o) => `${o.msid} ${o.name}`) }); continue; }
    if (assign[m.msid] != null && assign[m.msid] !== district) {
      ambiguous.push({ district, name: s.name, level: s.level, options: [`CONFLICT: ${m.msid} ${m.name} already district ${assign[m.msid]}`] });
      continue;
    }
    assign[m.msid] = district;
    assignedName[m.msid] = m.name;
  }
}

writeFileSync(OUT_JSON, JSON.stringify(assign) + "\n");
mkdirSync(dirname(OUT_REPORT), { recursive: true });

const perDistrict = {};
for (const d of Object.values(assign)) perDistrict[d] = (perDistrict[d] || 0) + 1;
const lines = [];
lines.push(`Orange County board-district assignment`);
lines.push(`Sources: ${files.length} OCPS district pages in scripts/sources/orange-board/`);
lines.push(`Extracted school listings: ${extractedCount}`);
lines.push(`Assigned tool MSIDs: ${Object.keys(assign).length}`);
lines.push(`Per district: ${JSON.stringify(Object.fromEntries(Object.entries(perDistrict).sort()))}`);
lines.push(`Ambiguous / conflicts: ${ambiguous.length}`);
lines.push(`Unmatched listings (not in tool dataset): ${unmatched.length}`);
lines.push("");
lines.push("UNMATCHED (listed by OCPS but absent from schools.sample.geojson - typically newer schools):");
for (const u of unmatched) lines.push(`  D${u.district}  ${u.level.padEnd(10)}  ${u.name}  (${u.host})`);
if (ambiguous.length) {
  lines.push("");
  lines.push("AMBIGUOUS / CONFLICTS (needs manual review):");
  for (const a of ambiguous) lines.push(`  D${a.district}  ${a.name} [${a.level}] -> ${a.options.join(" | ")}`);
}
const report = lines.join("\n") + "\n";
writeFileSync(OUT_REPORT, report);
process.stdout.write(report);
