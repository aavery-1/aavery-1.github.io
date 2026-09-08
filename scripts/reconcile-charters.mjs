// Reconcile the tool's charter classification against the authoritative Florida
// DOE charter directory (SchoolList.xls in the project root), so the "Charter"
// filter is trustworthy.
//
// Run:  node scripts/reconcile-charters.mjs      (from the project root)
//       npm run data:charters
//
// AUTHORITATIVE SOURCE: SchoolList.xls lists every Florida charter school with a
// District (name) and School Code. The tool's school MSIDs are
// `{2-digit district number}-{4-digit school code}`, so we build the authoritative
// MSID set for the three pilot counties by mapping the district NAME to its number
// (Miami-Dade = 13 "DADE", Broward = 06 "BROWARD", Orange = 48 "ORANGE") and
// zero-padding the school code to four digits.
//
// RECONCILIATION (conservative, evidence-based):
//   - PROMOTE: any school whose MSID matches an authoritative charter but is not
//     yet typed Charter is corrected to Charter (e.g. a district school that
//     converted to a charter). These are real, provable corrections.
//   - KEEP + LOG: schools the tool already types Charter that are not in the three
//     counties' authoritative list are NOT demoted. They are charters filed under
//     Florida's statewide charter-management districts (KIPP SOUTH, MDC CHARTERS,
//     IDEA, TSC, ...) whose MSIDs use a different district code, so an MSID match
//     is impossible even though the school is a genuine charter. Demoting them
//     would introduce errors, so they are logged for review instead.
//   - LOG ONLY: authoritative charters with no matching school point in the tool's
//     data are a location-data gap (the school is missing from the point set), not
//     a classification error, and are logged.
//
// OUTPUTS:
//   public/data/schools.sample.geojson   (patched: promotions applied in place)
//   scripts/out/charter-reconciliation.log.txt   (every mismatch, for review)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCHOOL_LIST = resolve(ROOT, "SchoolList.xls");
const SCHOOLS_GEOJSON = resolve(ROOT, "public/data/schools.sample.geojson");
const OUT_DIR = resolve(__dirname, "out");
const LOG_FILE = resolve(OUT_DIR, "charter-reconciliation.log.txt");

// District name (as spelled in SchoolList.xls) -> FL DOE district number, padded
// to the 2-digit prefix the tool's MSIDs use.
const DISTRICT_NUMBER = { DADE: "13", BROWARD: "06", ORANGE: "48" };

function buildAuthoritative() {
  const wb = XLSX.readFile(SCHOOL_LIST);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const auth = new Map(); // msid -> authoritative name
  for (const r of rows) {
    const dn = DISTRICT_NUMBER[String(r.District).trim().toUpperCase()];
    if (!dn) continue;
    const code = String(r["School Code"]).trim().padStart(4, "0");
    auth.set(`${dn}-${code}`, String(r["School Name"]).trim());
  }
  return auth;
}

function main() {
  const auth = buildAuthoritative();
  const geo = JSON.parse(readFileSync(SCHOOLS_GEOJSON, "utf8"));
  const byMsid = new Map();
  for (const f of geo.features) byMsid.set(f.properties.msid, f);

  const promoted = [];
  const appCharterNoAuth = [];
  let alreadyCharter = 0;

  // PROMOTE matched non-charters; count already-correct matches.
  for (const [msid, authName] of auth) {
    const f = byMsid.get(msid);
    if (!f) continue;
    if (f.properties.type === "Charter") {
      alreadyCharter++;
    } else {
      promoted.push({ msid, from: f.properties.type, name: f.properties.name, authName });
      f.properties.type = "Charter";
    }
  }

  // App charters with no authoritative match in the three counties (kept, logged).
  for (const f of geo.features) {
    const p = f.properties;
    if (p.type === "Charter" && !auth.has(p.msid)) {
      appCharterNoAuth.push({ msid: p.msid, name: p.name, county: p.county });
    }
  }

  // Authoritative charters with no school point in the tool's data (logged).
  const authNoApp = [];
  for (const [msid, authName] of auth) {
    if (!byMsid.get(msid)) authNoApp.push({ msid, authName });
  }

  writeFileSync(SCHOOLS_GEOJSON, JSON.stringify(geo));

  const charterCount = geo.features.filter((f) => f.properties.type === "Charter").length;
  const lines = [];
  lines.push("Charter reconciliation against SchoolList.xls (FL DOE charter directory)");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Authoritative charters (Miami-Dade + Broward + Orange): ${auth.size}`);
  lines.push(`Authoritative charters matched to a school point: ${auth.size - authNoApp.length}`);
  lines.push(`  already typed Charter: ${alreadyCharter}`);
  lines.push(`  promoted to Charter this run: ${promoted.length}`);
  lines.push(`Charter schools in the tool after reconciliation: ${charterCount}`);
  lines.push("");
  lines.push(`PROMOTED (matched authoritative charter, was not typed Charter): ${promoted.length}`);
  for (const p of promoted) lines.push(`  ${p.msid}  ${p.name}  [was ${p.from}]  ->  ${p.authName}`);
  lines.push("");
  lines.push(`KEPT app Charters with no match in the three-county authoritative list: ${appCharterNoAuth.length}`);
  lines.push("  (real charters filed under statewide charter-management districts; not demoted)");
  for (const a of appCharterNoAuth) lines.push(`  ${a.msid}  ${a.name}  (${a.county})`);
  lines.push("");
  lines.push(`Authoritative charters with no school point in the tool data: ${authNoApp.length}`);
  for (const a of authNoApp) lines.push(`  ${a.msid}  ${a.authName}`);
  lines.push("");

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(LOG_FILE, lines.join("\n"));

  console.log(`Authoritative charters: ${auth.size}`);
  console.log(`Promoted to Charter: ${promoted.length}`);
  console.log(`Charter total after reconciliation: ${charterCount}`);
  console.log(`Kept (no authoritative match): ${appCharterNoAuth.length}`);
  console.log(`Authoritative not in tool data: ${authNoApp.length}`);
  console.log(`Log: ${LOG_FILE}`);
}

main();
