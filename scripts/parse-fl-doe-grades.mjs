// Parse Florida DOE School Grades .xlsx files (manually downloaded from
// fldoe.org; source ships behind Akamai bot detection so a browser download
// is required) and produce public/data/grades.sample.json in the shape the
// tool expects.
//
// Input files (in ~/Downloads by default):
//   - SchoolGrades26 (2).xlsx  authoritative grade history 1999-2026
//   - PLP25.xlsx                official FL DOE PLP designations for 2024-25
//
// Output:
//   - public/data/grades.sample.json  grade history keyed by MSID (seasch)
//   - public/data/plp.sample.json     PLP designations, keyed by MSID
//
// The MSID key is the seasch-format id ("13-0026" = district 13 school 0026),
// which matches the msid field in schools.sample.geojson produced by
// fetch-real-data.mjs.

import xlsx from "xlsx";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "data");

const DOWNLOADS = resolve(homedir(), "Downloads");
const GRADES_XLSX_CANDIDATES = [
  "SchoolGrades26 (2).xlsx",
  "SchoolGrades26 (1).xlsx",
  "SchoolGrades26.xlsx",
];
const PLP_XLSX_CANDIDATES = ["PLP25.xlsx", "PLP25 (1).xlsx"];

const TARGET_DISTRICT_CODES = new Set(["13", "06", "48"]); // Miami-Dade, Broward, Orange

// Column indexes in SchoolGrades26 (row 2 is the header).
// Historic-grade columns start at 21 (Grade 2026). We map each column to a
// school-year string in the "YYYY-YYYY" format the tool already uses.
const GRADE_YEAR_COLS = {
  21: "2025-2026",
  22: "2024-2025",
  23: "2023-2024",
  24: "2022-2023", // "Informational Baseline Grade 2023"
  25: "2021-2022",
  26: "2020-2021",
  27: "2018-2019",
  28: "2017-2018",
  29: "2016-2017",
  30: "2015-2016",
  31: "2014-2015", // "Informational Baseline Grade 2015"
  32: "2013-2014",
  33: "2012-2013",
  34: "2011-2012",
  35: "2010-2011",
  36: "2009-2010",
  37: "2008-2009",
  38: "2007-2008",
  39: "2006-2007",
  40: "2005-2006",
  41: "2004-2005",
  42: "2003-2004",
  43: "2002-2003",
  44: "2001-2002",
  45: "2000-2001",
  46: "1999-2000",
  47: "1998-1999",
};

const ALLOWED_GRADES = new Set(["A", "B", "C", "D", "F", "I", "NR", "NG"]);

function firstExisting(files, dir) {
  for (const f of files) {
    const p = resolve(dir, f);
    if (existsSync(p)) return p;
  }
  return null;
}

function normGrade(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s || s === "-" || s === "N/A") return null;
  if (ALLOWED_GRADES.has(s)) return s;
  // Non-standard values become NR so the domain check still passes.
  return "NR";
}

function toMsid(districtCode, schoolNumber) {
  const d = String(districtCode).trim();
  const s = String(schoolNumber).trim();
  return `${d}-${s}`;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const gradesPath = firstExisting(GRADES_XLSX_CANDIDATES, DOWNLOADS);
  if (!gradesPath) {
    console.error(
      `No SchoolGrades .xlsx found in ${DOWNLOADS}. Expected one of: ${GRADES_XLSX_CANDIDATES.join(", ")}`,
    );
    process.exit(1);
  }
  console.log(`Reading grades from ${gradesPath}`);

  const wb = xlsx.readFile(gradesPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  // Header row is index 2 (rows 0-1 are titles/notes). Data starts at index 3.
  const dataRows = rows
    .slice(3)
    .filter((r) => r[0] && TARGET_DISTRICT_CODES.has(String(r[0]).trim()));
  console.log(`Kept ${dataRows.length} rows across the 3 target counties`);

  const schools = {};
  for (const r of dataRows) {
    const msid = toMsid(r[0], r[2]);
    const history = [];
    // Iterate in chronological order (oldest first) so the timeline reads left
    // to right.
    const cols = Object.keys(GRADE_YEAR_COLS)
      .map(Number)
      .sort((a, b) => b - a); // higher col index = older year
    for (const col of cols) {
      const g = normGrade(r[col]);
      if (g) history.push({ year: GRADE_YEAR_COLS[col], grade: g });
    }
    if (history.length) schools[msid] = history;
  }
  console.log(`Wrote grade histories for ${Object.keys(schools).length} schools`);

  const gradesOut = {
    vintage: `FL DOE School Grades files, 1999-2026, retrieved ${new Date().toISOString().slice(0, 10)}`,
    source: "Florida Department of Education, School Grades",
    source_url:
      "https://www.fldoe.org/accountability/accountability-reporting/school-grades/",
    formula_change_years: ["2009-2010", "2011-2012", "2014-2015", "2021-2022"],
    schools,
  };
  const gradesOutPath = resolve(OUT_DIR, "grades.sample.json");
  writeFileSync(gradesOutPath, JSON.stringify(gradesOut, null, 2) + "\n");
  console.log(`Wrote ${gradesOutPath} (${(JSON.stringify(gradesOut).length / 1024).toFixed(0)} KB)`);

  // Optional: parse the official PLP designations too.
  const plpPath = firstExisting(PLP_XLSX_CANDIDATES, DOWNLOADS);
  if (plpPath) {
    console.log(`\nReading official PLP list from ${plpPath}`);
    const plpWb = xlsx.readFile(plpPath);
    const plpSheet = plpWb.Sheets[plpWb.SheetNames[0]];
    const plpRows = xlsx.utils.sheet_to_json(plpSheet, { header: 1, blankrows: false });
    // Header at row 3, data from row 4.
    const plpData = plpRows
      .slice(4)
      .filter((r) => r[0] && TARGET_DISTRICT_CODES.has(String(r[0]).trim()));
    const plp = {};
    for (const r of plpData) {
      const msid = toMsid(r[0], r[2]);
      plp[msid] = {
        district_name: r[1],
        school_name: r[4],
        grade_2025: r[5] || null,
        grade_2024: r[6] || null,
        grade_2023: r[7] || null,
        grade_2022: r[8] || null,
        grade_2021: r[9] || null,
      };
    }
    console.log(`Kept ${Object.keys(plp).length} PLP designations in the 3 target counties`);
    const plpOut = {
      vintage: "FL DOE 2024-25 Persistently Low-Performing Schools list",
      source: "Florida Department of Education, PLP designations per F.S. 1002.333",
      designated_year: "2024-2025",
      schools: plp,
    };
    const plpOutPath = resolve(OUT_DIR, "plp.sample.json");
    writeFileSync(plpOutPath, JSON.stringify(plpOut, null, 2) + "\n");
    console.log(`Wrote ${plpOutPath}`);
  } else {
    console.log(`\nNo PLP .xlsx found in ${DOWNLOADS}; skipping (grades-based PLP inference will still work)`);
  }
}

main();
