// Adapter for the official Florida DOE list of Persistently Low-Performing
// (PLP) schools per F.S. 1002.333. This is the authoritative source for SoH
// eligibility, not our computed rule: the FL DOE designation uses a specific
// data window (grades as of the designation year) and takes precedence over
// any recomputed rule against fresher grade data.
//
// Data file is produced by scripts/parse-fl-doe-grades.mjs.

import { loadValidated } from "./base";
import type { LoadResult } from "../types";

export const SAMPLE_URL = "/data/plp.sample.json";

export interface PlpSchoolRecord {
  district_name: string;
  school_name: string;
  grade_2025: string | null;
  grade_2024: string | null;
  grade_2023: string | null;
  grade_2022: string | null;
  grade_2021: string | null;
}

export interface PlpFile {
  vintage: string;
  source: string;
  designated_year: string;
  schools: Record<string, PlpSchoolRecord>;
}

function validatePlp(data: unknown, file = "plp.sample.json"): PlpFile {
  if (!data || typeof data !== "object") throw new Error(`${file}: not an object`);
  const d = data as Partial<PlpFile>;
  if (!d.schools || typeof d.schools !== "object") throw new Error(`${file}: missing schools object`);
  return d as PlpFile;
}

export function loadPlp(): Promise<LoadResult<PlpFile>> {
  return loadValidated(SAMPLE_URL, validatePlp, {
    source: "Florida Department of Education, PLP list per F.S. 1002.333",
    vintage: "2024-2025 designations",
  });
}
