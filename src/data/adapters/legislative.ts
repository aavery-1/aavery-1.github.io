// Legislative districts adapter (P5). REAL DATA.
//
// Source: U.S. Census Bureau TIGERweb - 119th Congressional Districts plus the
// 2024 State Legislative Districts (Upper and Lower), clipped to the three pilot
// counties. Fetched to public/data/legislative.geojson by
// scripts/fetch-real-layers.mjs. Officeholder names are a separate dataset (see
// the reps adapter); this layer carries boundaries and district numbers only.

import { loadValidated } from "./base";
import { validateLegislative } from "../validate";
import type { LoadResult, LegislativeCollection } from "../types";

export const SOURCE_URL = "/data/legislative.geojson";

export function loadLegislative(): Promise<LoadResult<LegislativeCollection>> {
  return loadValidated(SOURCE_URL, validateLegislative, {
    source: "U.S. Census Bureau TIGERweb (CD 119th; SLDU/SLDL 2024)",
    vintage: "119th Congress; 2024 state legislative maps",
  });
}
