// School neighborhood demographics adapter.
//
// REAL SOURCE (wired): a precomputed dasymetric aggregation built offline by
// scripts/build-school-demographics.mjs. For every school (by MSID) and every
// radius ring (1, 2, 5, 8 miles) it carries the neighborhood's total population,
// K-8 age population (ACS ages 5-14), median household income, % Black, and %
// Hispanic, each with a margin of error where one applies.
//
// Method: 2020 Census block populations (a 100% count, TIGERweb POP100) place
// people where they live; ACS 2019-2023 5-year block-group estimates supply the
// demographics; a block counts toward a ring when its internal point is within
// the ring radius (WGS84 ellipsoidal geodesic, the same model the map draws
// rings with). Join key: MSID. See 03_DATA_CATALOG.md.

import { loadValidated } from "./base";
import { validateSchoolDemographics } from "../validate";
import type { LoadResult, SchoolDemographicsFile } from "../types";

export const SAMPLE_URL = "/data/school_demographics.json";

export function loadSchoolDemographics(): Promise<LoadResult<SchoolDemographicsFile>> {
  return loadValidated(SAMPLE_URL, validateSchoolDemographics, {
    source: "U.S. Census Bureau ACS 2019-2023 5-year + 2020 Census blocks (TIGERweb)",
    vintage: "ACS 2019-2023 5-year; 2020 Census blocks",
  });
}
