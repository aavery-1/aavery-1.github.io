// Parse the official Florida DOE Persistently Low-Performing (PLP) list
// (F.S. 1002.333(1)(c)) and write public/data/plp.sample.json keyed by MSID.
//
// Usage:
//   node scripts/parse-plp.mjs [path/to/PLPxx.xlsx]
//
// With no argument it looks for the newest PLPnn.xlsx in the repo root and in
// ~/Downloads. The parser is HEADER-DRIVEN: each year FL DOE adds a new
// "Grade YYYY" column at the front of the grade block, which shifts every
// column after it, so we locate columns by their header text, never by index.
//
// The designation year comes from the sheet title ("2025-26 Persistently
// Low-Performing Schools"), so the tool's "as of" labels follow the file.

import xlsx from "xlsx";
import { writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "public", "data", "plp.sample.json");
const TARGET_DISTRICT_CODES = new Set(["13", "06", "48"]); // Miami-Dade, Broward, Orange

function newestPlpFile() {
  const found = [];
  for (const dir of [ROOT, resolve(homedir(), "Downloads")]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = /^PLP(\d{2})( \(\d+\))?\.xlsx$/i.exec(f);
      if (m) found.push({ path: join(dir, f), yy: Number(m[1]) });
    }
  }
  found.sort((a, b) => b.yy - a.yy);
  return found[0]?.path ?? null;
}

const pad = (v, n) => String(v ?? "").trim().padStart(n, "0");
const yn = (v) => {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "YES" || s === "Y" ? true : s === "NO" || s === "N" ? false : null;
};

function main() {
  const path = process.argv[2] ?? newestPlpFile();
  if (!path || !existsSync(path)) {
    console.error("No PLP .xlsx found. Pass a path: node scripts/parse-plp.mjs ~/Downloads/PLP26.xlsx");
    process.exit(1);
  }
  console.log(`Reading ${path}`);
  const wb = xlsx.readFile(path);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" });

  // Title row: "2025-26 Persistently Low-Performing Schools".
  const title = rows.flat().map(String).find((c) => /Persistently Low-Performing Schools/i.test(c)) ?? "";
  const ym = /(\d{4})-(\d{2})/.exec(title);
  if (!ym) throw new Error(`Could not read the designation year from the sheet title: "${title}"`);
  const designatedShort = `${ym[1]}-${ym[2]}`;                       // "2025-26"
  const designatedYear = `${ym[1]}-${Number(ym[1]) + 1}`;            // "2025-2026"

  const hIdx = rows.findIndex((r) => r.some((c) => String(c).trim() === "District Number"));
  if (hIdx < 0) throw new Error("Header row (District Number) not found");
  const header = rows[hIdx].map((c) => String(c).trim());
  const col = (re) => header.findIndex((h) => re.test(h));
  const C = {
    dist: col(/^District Number$/i),
    distName: col(/^District Name$/i),
    school: col(/^School Number$/i),
    name: col(/^School Name$/i),
    ela: col(/Grade 3 ELA/i),
    math: col(/Grade 4 Math/i),
    charter: col(/^Charter School$/i),
    type: col(/^School Type$/i),
  };
  for (const [k, v] of Object.entries(C)) if (v < 0) throw new Error(`Column not found: ${k}`);
  const gradeCols = header
    .map((h, i) => ({ i, m: /^Grade (\d{4})$/.exec(h) }))
    .filter((x) => x.m)
    .map((x) => ({ i: x.i, year: x.m[1] }));

  const schools = {};
  for (const r of rows.slice(hIdx + 1)) {
    const d = pad(r[C.dist], 2);
    if (!TARGET_DISTRICT_CODES.has(d)) continue;
    const msid = `${d}-${pad(r[C.school], 4)}`;
    const rec = {
      district_name: String(r[C.distName]).trim(),
      school_name: String(r[C.name]).trim(),
    };
    for (const g of gradeCols) rec[`grade_${g.year}`] = String(r[g.i] ?? "").trim() || null;
    rec.ela3_bottom10 = yn(r[C.ela]);
    rec.math4_bottom10 = yn(r[C.math]);
    rec.charter = yn(r[C.charter]);
    rec.school_type = pad(r[C.type], 2) || null;
    schools[msid] = rec;
  }

  const out = {
    vintage: `FL DOE ${designatedShort} Persistently Low-Performing Schools list`,
    source: "Florida Department of Education, PLP designations per F.S. 1002.333",
    designated_year: designatedYear,
    designated_short: designatedShort,
    schools,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  const byDist = {};
  for (const k of Object.keys(schools)) byDist[k.slice(0, 2)] = (byDist[k.slice(0, 2)] ?? 0) + 1;
  console.log(`Wrote ${OUT}: ${Object.keys(schools).length} schools (${designatedShort})`, byDist);
}

main();
