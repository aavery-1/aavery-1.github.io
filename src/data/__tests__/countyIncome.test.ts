import { describe, it, expect } from "vitest";
import { incomeVsCounty, COUNTY_MEDIAN_INCOME } from "../countyIncome";
import type { SchoolDemographicsEntry } from "../types";

const entry = (median: number | null): SchoolDemographicsEntry => ({
  lon: 0, lat: 0,
  rings: [1, 2, 5, 8].map((r) => ({
    r, blocks: 1, total_pop: 1, total_pop_moe: 0, k8_pop: 0, k8_pop_moe: 0,
    pct_black: null, pct_black_moe: null, pct_hispanic: null, pct_hispanic_moe: null,
    median_income: r === 5 ? median : 1, median_income_moe: null, coverage_pct: 1,
  })),
});

describe("income vs county", () => {
  it("compares the 5-mile median with the county median", () => {
    const iv = incomeVsCounty(entry(56_328), "Miami-Dade")!;
    expect(iv.county).toBe(COUNTY_MEDIAN_INCOME["Miami-Dade"]);
    expect(Math.round(iv.delta * 100)).toBe(-18);
  });
  it("returns null when there is no neighborhood figure", () => {
    expect(incomeVsCounty(entry(null), "Broward")).toBeNull();
    expect(incomeVsCounty(undefined, "Orange")).toBeNull();
  });
});
