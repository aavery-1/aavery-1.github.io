// Enrollment history adapter (dataset). REAL DATA.
//
// Feeds the inspector's enrollment trend. Source: FL DOE "Membership by School
// by Grade" (Final Survey 2, the October count used for FEFP funding), keyed by
// MSID to match the school points. Built to public/data/enrollment_history.json
// by scripts/parse-fldoe-membership.py. Broward schools additionally carry a
// SY2026-27 point from the district's Tenth Day Enrollment Count
// (scripts/parse-broward-tenthday.py) -- the newest point in their trend.

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
    source: "FL DOE Membership by School by Grade (Survey 2); Broward SY2026-27 Tenth Day count",
    vintage: "Final Survey 2 (October membership), 2020-21 through 2024-25; Broward through 2026-27",
  });
}
