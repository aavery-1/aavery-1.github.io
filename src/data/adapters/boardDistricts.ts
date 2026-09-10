// School board member districts adapter.
//
// REAL: /data/board_districts.geojson, built by scripts/fetch-board-districts.mjs
// from authoritative county GIS: Miami-Dade County GIS (9 districts), Broward
// County GIS / Supervisor of Elections (7 single-member districts), and Orange
// County Supervisor of Elections GIS (7 single-member districts). Member names
// come from the current Supervisor-of-Elections / OCPS board rosters. All three
// counties are now real polygons; the Orange school-to-district lookup
// (orange_board_districts.json) is kept only as a fallback for schools that fall
// outside every polygon. Join is spatial point-in-polygon. See 03_DATA_CATALOG.md
// and 06_ARCHITECTURE.md.

import { loadValidated } from "./base";
import { validateBoardDistricts } from "../validate";
import type { LoadResult, BoardDistrictCollection } from "../types";

export const SAMPLE_URL = "/data/board_districts.geojson";

export function loadBoardDistricts(): Promise<LoadResult<BoardDistrictCollection>> {
  return loadValidated(SAMPLE_URL, validateBoardDistricts, {
    source: "Miami-Dade + Broward + Orange County GIS / Supervisor of Elections",
    vintage: "Boundaries from county GIS; members from current SOE / OCPS rosters",
  });
}
