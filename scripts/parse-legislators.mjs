// Populate Florida House and Senate representative names into representatives.json
// from the official chamber rosters saved in the project root. The inspector looks
// these up by district as state_legislative["SLDL-<n>"] (House) and
// ["SLDU-<n>"] (Senate). Also clears the statewide U.S. Senator list, which the
// tool no longer surfaces (they represent the whole state, not a district).
//
// Run:  node scripts/parse-legislators.mjs      (from the project root)
//       npm run data:legislators
//
// INPUTS (saved web pages in the project root):
//   "Representatives for 2024 - 2026 ( Speaker Perez ) _ Florida House of Representatives.html"
//   "Senators - The Florida Senate.html"
// OUTPUT:
//   public/data/representatives.json   (state_legislative populated in place)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HOUSE_HTML = resolve(ROOT, "Representatives for 2024 - 2026 ( Speaker Perez ) _ Florida House of Representatives.html");
const SENATE_HTML = resolve(ROOT, "Senators - The Florida Senate.html");
const REPS_JSON = resolve(ROOT, "public/data/representatives.json");

function decode(s) {
  return s
    // Numeric entities: decimal (&#225;) and hex (&#xe1;). Rosters store accented
    // names this way (e.g. Fabian, Lopez, Valdes), so decode to real UTF-8.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "-")
    // Ampersand last so a decoded "&amp;#225;" style artifact cannot re-form an entity.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// "Last, First M." -> "First M. Last". Leaves an already first-last name intact.
function firstLast(name) {
  const n = decode(name);
  const c = n.indexOf(",");
  if (c === -1) return n;
  const last = n.slice(0, c).trim();
  const first = n.slice(c + 1).trim();
  return `${first} ${last}`.trim();
}

function normalizeParty(p) {
  const s = decode(p).toLowerCase();
  if (s.startsWith("rep")) return "Republican";
  if (s.startsWith("dem")) return "Democrat";
  if (s.startsWith("ind") || s.startsWith("no party")) return "Independent";
  return decode(p) || null;
}

function parseHouse() {
  const html = readFileSync(HOUSE_HTML, "utf8");
  // Each member card: <h5> Last, First </h5> <p> Party &mdash; ... District: N
  const re = /<h5>\s*([^<]+?)\s*<\/h5>\s*<p>\s*([A-Za-z][A-Za-z ]*?)\s*&mdash;[\s\S]*?District:\s*(\d+)/g;
  const out = {};
  let m;
  while ((m = re.exec(html))) {
    const name = firstLast(m[1]);
    const party = normalizeParty(m[2]);
    const district = m[3];
    out[`SLDL-${district}`] = { name, party, source: "Florida House of Representatives roster (2024-2026)" };
  }
  return out;
}

function parseSenate() {
  const html = readFileSync(SENATE_HTML, "utf8");
  const out = {};
  // Main roster table: one <tr class="..."> per current senator, containing the
  // member link (district in the href, name in the image alt) and a party cell.
  const rowRe = /<tr class="[^"]*">([\s\S]*?)<\/tr>/g;
  let row;
  while ((row = rowRe.exec(html))) {
    const block = row[1];
    const link = block.match(/href="\/Senators\/2024-2026\/S(\d+)"[^>]*>\s*<img[^>]*alt="Senator ([^"]+)"/);
    if (!link) continue;
    const district = link[1];
    const name = decode(link[2]);
    const partyM = block.match(/\b(Republican|Democrat|Independent)\b/);
    const party = partyM ? normalizeParty(partyM[1]) : null;
    out[`SLDU-${district}`] = { name, party, source: "The Florida Senate roster (2024-2026)" };
  }
  return out;
}

function main() {
  const reps = JSON.parse(readFileSync(REPS_JSON, "utf8"));
  const house = parseHouse();
  const senate = parseSenate();
  const houseN = Object.keys(house).length;
  const senateN = Object.keys(senate).length;

  reps.state_legislative = { ...house, ...senate };
  // The tool no longer surfaces statewide U.S. Senators (no district value).
  reps.senate = [];
  reps.source = "unitedstates/congress-legislators (U.S. House); Florida House and Senate chamber rosters (state legislature)";
  reps.notes = [
    "Congressional (U.S. House) members from unitedstates/congress-legislators.",
    "State House/Senate names from the official Florida chamber rosters (2024-2026 term); keyed state_legislative['SLDL-<n>'] / ['SLDU-<n>'].",
    "U.S. Senators are statewide and are not surfaced in the tool.",
    "County school-board members: see board keys where populated.",
  ].join(" ");

  writeFileSync(REPS_JSON, JSON.stringify(reps, null, 2));
  console.log(`Florida House members parsed: ${houseN}`);
  console.log(`Florida Senate members parsed: ${senateN}`);
  console.log(`state_legislative entries written: ${Object.keys(reps.state_legislative).length}`);
}

main();
