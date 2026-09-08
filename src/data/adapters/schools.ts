// School locations adapter.
//
// SAMPLE: /data/schools.sample.geojson (committed).
// TODO (real source): FL DOE Master School ID (MSID) file joined to NCES
// CCD/EDGE geocodes. Prefer NCES EDGE rooftop coordinates; fall back to Census
// Geocoder for schools opened in the last cycle that EDGE lags on. Join key:
// MSID. See 03_DATA_CATALOG.md. To wire real data, replace SAMPLE_URL with the
// real endpoint and adjust the field mapping in validateSchools if names differ.

import { loadValidated } from "./base";
import { validateSchools } from "../validate";
import type { LoadResult, SchoolCollection } from "../types";

export const SAMPLE_URL = "/data/schools.sample.geojson";

export function loadSchools(): Promise<LoadResult<SchoolCollection>> {
  return loadValidated(SAMPLE_URL, validateSchools, {
    source: "FL DOE Master School ID + NCES EDGE geocodes (sample)",
    vintage: "MSID 2024-2025; NCES EDGE 2023-2024",
  });
}
