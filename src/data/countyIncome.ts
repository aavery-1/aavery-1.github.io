// County median household income, the baseline for "Income vs county": the
// same survey and vintage as the 5-mile neighborhood figures (ACS 2019-2023
// 5-year, table B19013), so the comparison is like for like.
// Source: api.census.gov/data/2023/acs/acs5, B19013_001E (retrieved Nov 2026).

import type { CountyName, SchoolDemographicsEntry } from "./types";

export const COUNTY_MEDIAN_INCOME: Record<CountyName, number> = {
  "Miami-Dade": 68_694, // MOE ±832
  Broward: 74_534,      // MOE ±993
  Orange: 77_011,       // MOE ±1,108
};

export interface IncomeVsCounty {
  nearby: number;   // household-weighted median income within 5 miles
  county: number;   // county median
  delta: number;    // (nearby - county) / county, e.g. -0.18
}

// Median household income within 5 miles of the school vs its county median.
// Null when the school has no neighborhood figures (e.g. off the populated map).
export function incomeVsCounty(entry: SchoolDemographicsEntry | undefined, county: CountyName, radiusMiles = 5): IncomeVsCounty | null {
  const nearby = entry?.rings.find((r) => r.r === radiusMiles)?.median_income ?? null;
  const base = COUNTY_MEDIAN_INCOME[county];
  if (nearby == null || !base) return null;
  return { nearby, county: base, delta: (nearby - base) / base };
}
