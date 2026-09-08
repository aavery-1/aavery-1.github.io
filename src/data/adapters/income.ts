// Household income choropleth adapter.
//
// REAL SOURCE (wired): American Community Survey 5-year estimates - median
// household income (B19013) and a school-age proxy (population under 18,
// B09001) from the Census ACS API, joined by GEOID to Census TIGERweb 2020
// tract polygons. Built by scripts/build-acs-income.mjs (needs CENSUS_API_KEY).
// Covers the three pilot counties at tract level (~1,390 tracts). This replaced
// the earlier synthetic 4x4 grid so the inspector's income value and the
// choropleth are real ACS figures. Join key: GEOID. See 03_DATA_CATALOG.md.

import { loadValidated } from "./base";
import { validateIncome } from "../validate";
import type { LoadResult, IncomeCollection } from "../types";

export const SAMPLE_URL = "/data/income.geojson";

export function loadIncome(): Promise<LoadResult<IncomeCollection>> {
  return loadValidated(SAMPLE_URL, validateIncome, {
    source: "U.S. Census Bureau ACS 5-year (B19013, B09001) + TIGERweb tracts",
    vintage: "ACS 2019-2023",
  });
}
