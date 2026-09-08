// Orange County school-board district assignment (dataset). REAL DATA.
//
// Orange County GIS has no board-district polygons (unlike Miami-Dade / Broward),
// so this maps each Orange district-run school MSID to its board district (1-7),
// derived from OCPS's own per-district school lists by
// scripts/parse-orange-board.mjs -> public/data/orange_board_districts.json.
// buildSchoolDistricts() uses it to tag Orange schools where a polygon lookup has
// nothing. Covers district-run schools only (the source doesn't list charters,
// virtual, or brand-new schools).

import { loadValidated } from "./base";
import type { LoadResult, OrangeBoardFile } from "../types";

export const SOURCE_URL = "/data/orange_board_districts.json";

function validateOrangeBoard(data: unknown, file = "orange_board_districts.json"): OrangeBoardFile {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${file}: not an object`);
  const out: OrangeBoardFile = {};
  for (const [msid, district] of Object.entries(data as Record<string, unknown>)) {
    if (typeof district !== "number" || district < 1 || district > 7) throw new Error(`${file}: bad district for ${msid}`);
    out[msid] = district;
  }
  return out;
}

export function loadOrangeBoard(): Promise<LoadResult<OrangeBoardFile>> {
  return loadValidated(SOURCE_URL, validateOrangeBoard, {
    source: "Orange County Public Schools per-district school lists (ocps.net)",
    vintage: "2025-2026 board districts",
  });
}
