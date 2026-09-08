// Enrollment history adapter (dataset). REAL DATA.
//
// Feeds the inspector's enrollment trend. Source: NCES Common Core of Data
// (annual PK-12 membership, all grades) via the Urban Institute Education Data
// Portal, keyed by MSID to match the school points. Fetched to
// public/data/enrollment_history.json by scripts/fetch-real-layers.mjs.

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
    source: "NCES CCD via Urban Institute Education Data Portal",
    vintage: "Annual PK-12 membership (October survey)",
  });
}
