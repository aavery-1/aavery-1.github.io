// Representatives adapter (dataset, P5). REAL DATA (federal).
//
// Populates member_name in the legislative_districts inspector rows. Source:
// unitedstates/congress-legislators for the current U.S. House members whose
// district overlaps a pilot county, plus both Florida U.S. Senators. Fetched to
// public/data/representatives.json by scripts/fetch-real-layers.mjs.
//
// State-legislative (SLDU/SLDL) and county school-board member NAMES are carried
// as empty tables rather than guessed: those come from OpenStates and each
// county's board/SOE roster and are refreshed after each election. District
// boundaries for those chambers are already real (legislative_districts layer);
// only the officeholder names are pending. Join key: district id.

import { loadValidated } from "./base";
import type { LoadResult, RepresentativesFile } from "../types";

export const SOURCE_URL = "/data/representatives.json";

function validateReps(data: unknown, file = "representatives.json"): RepresentativesFile {
  if (!data || typeof data !== "object") throw new Error(`${file}: not an object`);
  const d = data as Partial<RepresentativesFile>;
  if (!d.congressional || typeof d.congressional !== "object") throw new Error(`${file}: missing congressional`);
  if (!Array.isArray(d.senate)) throw new Error(`${file}: missing senate array`);
  return d as RepresentativesFile;
}

export function loadReps(): Promise<LoadResult<RepresentativesFile>> {
  return loadValidated(SOURCE_URL, validateReps, {
    source: "unitedstates/congress-legislators (federal)",
    vintage: "Current U.S. House + Senate for Florida",
  });
}
