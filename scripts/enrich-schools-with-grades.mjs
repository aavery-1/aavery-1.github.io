// Backfill the current_grade / current_grade_year fields on the real
// schools directory (from NCES CCD) using the most recent graded year in the
// FL DOE grades history file. Idempotent: rerun any time either input file
// changes to keep them in sync.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");

const schools = JSON.parse(readFileSync(resolve(DATA, "schools.sample.geojson"), "utf8"));
const grades = JSON.parse(readFileSync(resolve(DATA, "grades.sample.json"), "utf8"));

const GRADED = new Set(["A", "B", "C", "D", "F"]);

let matched = 0;
let stillNR = 0;
for (const f of schools.features) {
  const history = grades.schools[f.properties.msid];
  if (!history || !history.length) {
    stillNR++;
    continue;
  }
  // history entries are chronological, oldest first. Take the most recent
  // GRADED year for current_grade (skip I/NR/NG).
  let latestGraded = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (GRADED.has(history[i].grade)) {
      latestGraded = history[i];
      break;
    }
  }
  const latest = latestGraded ?? history[history.length - 1];
  f.properties.current_grade = latest.grade;
  f.properties.current_grade_year = latest.year;
  matched++;
}

console.log(`Enriched ${matched} of ${schools.features.length} schools with real current grade`);
console.log(`${stillNR} schools have no grade record and remain NR (typically virtual, adult, or brand-new)`);

const outPath = resolve(DATA, "schools.sample.geojson");
writeFileSync(outPath, JSON.stringify(schools, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
