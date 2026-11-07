// Adapter for the official Florida DOE list of Persistently Low-Performing
// (PLP) schools per F.S. 1002.333. This is the authoritative source for SoH
// eligibility, not our computed rule: the FL DOE designation uses a specific
// data window (grades as of the designation year) and takes precedence over
// any recomputed rule against fresher grade data.
//
// Data file is produced by scripts/parse-plp.mjs (npm run data:plp).

import { loadValidated } from "./base";
import type { LoadResult } from "../types";

export const SAMPLE_URL = "/data/plp.sample.json";

export interface PlpSchoolRecord {
  district_name: string;
  school_name: string;
  // One "grade_YYYY" key per grade column on the DOE sheet (the newest year
  // varies with the list's vintage, so these are open-ended).
  [gradeKey: `grade_${number}`]: string | null;
  // Criterion (c)3 screening flags (bottom 10% on grade-3 ELA / grade-4 math
  // in >=2 of the previous 3 years). Absent on lists parsed before 2025-26.
  ela3_bottom10?: boolean | null;
  math4_bottom10?: boolean | null;
  charter?: boolean | null;
  school_type?: string | null;
}

export interface PlpFile {
  vintage: string;
  source: string;
  designated_year: string;   // "2025-2026"
  designated_short?: string; // "2025-26"
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
    vintage: "2025-2026 designations",
  });
}

// "2025-26" for the loaded list, for compact "as of SY25-26" style labels.
export function plpShortYear(plp: PlpFile | null | undefined): string | null {
  if (!plp) return null;
  if (plp.designated_short) return plp.designated_short;
  const m = /^(\d{4})-\d{2}(\d{2})$/.exec(plp.designated_year ?? "");
  return m ? `${m[1]}-${m[2]}` : null;
}
