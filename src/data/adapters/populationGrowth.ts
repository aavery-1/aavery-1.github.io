// Population growth adapter (P3). REAL DATA.
//
// Source: U.S. Census Bureau Population Estimates Program (Vintage 2024) county
// totals - births, deaths, and net migration, the exact components the layer
// legend names - plus ACS 2019-2023 under-18 population. County polygons from
// TIGERweb. Fetched to public/data/population_growth.geojson by
// scripts/fetch-real-layers.mjs. County-level and coarse by design; the
// choropleth is driven by growth_rate (2023->2024). Join: county FIPS.
//
// This replaces the earlier split births/migration stubs: the PEP file carries
// both components in one authoritative table, so a single adapter is correct.

import { loadValidated } from "./base";
import { validatePopulationGrowth } from "../validate";
import type { LoadResult, PopulationGrowthCollection } from "../types";

export const SOURCE_URL = "/data/population_growth.geojson";

export function loadPopulationGrowth(): Promise<LoadResult<PopulationGrowthCollection>> {
  return loadValidated(SOURCE_URL, validatePopulationGrowth, {
    source: "U.S. Census Bureau PEP (Vintage 2024) + ACS 2019-2023",
    vintage: "PEP 2023->2024; ACS 2019-2023 under-18",
  });
}
