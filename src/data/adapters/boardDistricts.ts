// School board member districts adapter.
//
// REAL: /data/board_districts.geojson, built by scripts/fetch-board-districts.mjs
// from authoritative county GIS: Miami-Dade County GIS (9 districts) and Broward
// County GIS / Supervisor of Elections (7 single-member districts). Member names
// come from the current Supervisor-of-Elections rosters. Orange County publishes
// its board-member districts only as a PDF map (no open GeoJSON), so Orange
// boundaries are a documented gap rather than an approximation. Join is spatial
// point-in-polygon. See 03_DATA_CATALOG.md and 06_ARCHITECTURE.md.

import { loadValidated } from "./base";
import { validateBoardDistricts } from "../validate";
import type { LoadResult, BoardDistrictCollection } from "../types";

export const SAMPLE_URL = "/data/board_districts.geojson";

export function loadBoardDistricts(): Promise<LoadResult<BoardDistrictCollection>> {
  return loadValidated(SAMPLE_URL, validateBoardDistricts, {
    source: "Miami-Dade County GIS + Broward County GIS / Supervisor of Elections",
    vintage: "Boundaries from county GIS; members from current SOE rosters",
  });
}
