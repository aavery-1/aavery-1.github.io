// Historic grades adapter (dataset, not a rendered layer). Feeds the inspector
// grade timeline.
//
// SAMPLE: /data/grades.sample.json (committed).
// TODO (real source): FL DOE School Grades files, one XLS/XLSX per school year
// (roughly 1999 to present). Join key: MSID. Preserve the full grade domain
// including I, NR, NG. Never coerce non-standard grades into A-F. See
// 03_DATA_CATALOG.md and 04_SAMPLE_SCHEMAS.md.

import { loadValidated } from "./base";
import { validateGrades } from "../validate";
import type { LoadResult, GradesFile } from "../types";

export const SAMPLE_URL = "/data/grades.sample.json";

export function loadGrades(): Promise<LoadResult<GradesFile>> {
  return loadValidated(SAMPLE_URL, validateGrades, {
    source: "FL DOE School Grades files (sample)",
    vintage: "2015-2016 through 2024-2025 (sample subset)",
  });
}
