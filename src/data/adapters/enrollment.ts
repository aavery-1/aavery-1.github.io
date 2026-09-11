// Enrollment history adapter (dataset). REAL DATA.
//
// Feeds the inspector's enrollment trend. Source: FL DOE "Membership by School
// by Grade" (Final Survey 2, the October count used for FEFP funding), keyed by
// MSID to match the school points. Built to public/data/enrollment_history.json
// by scripts/parse-fldoe-membership.py.

import { loadValidated } from "./base";
import type { LoadResult, EnrollmentHistoryFile } from "../types";

export const SOURCE_URL = "/data/enrollment_history.json";

function validateEnrollment(data: unknown, file = "enrollment_history.json"): EnrollmentHistoryFile {
  if (!data || typeof data !== "object") throw new Error(`${file}: not an object`);
  const d = data as Partial<EnrollmentHistoryFile>;
  if (!d.schools || typeof d.schools !== "object") throw new Error(`${file}: missing schools object`);
  return d as EnrollmentHistoryFile;
}

export function loadEnrollmentHistory(): Promise<LoadResult<EnrollmentHistoryFile>> {
  return loadValidated(SOURCE_URL, validateEnrollment, {
    source: "FL DOE Membership by School by Grade (Survey 2)",
    vintage: "Final Survey 2 (October membership), 2020-21 through 2024-25",
  });
}
