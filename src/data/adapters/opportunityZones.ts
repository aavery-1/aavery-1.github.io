// Opportunity zones adapter (P4). REAL DATA.
//
// Source: HUD Opportunity Zones feature service - the spatial representation of
// the U.S. Treasury/IRS designated Qualified Opportunity Zone (QOZ) census
// tracts. 2018 designations, in effect through 12/31/2028. Fetched to
// public/data/opportunity_zones.geojson by scripts/fetch-real-layers.mjs.
// The 2027 OBBBA refresh should be swapped in when those designations publish.
// Join: spatial point-in-polygon (a school falls in a designated tract or not).

import { loadValidated } from "./base";
import { validateOpportunityZones } from "../validate";
import type { LoadResult, OpportunityZoneCollection } from "../types";

export const SOURCE_URL = "/data/opportunity_zones.geojson";

export function loadOpportunityZones(): Promise<LoadResult<OpportunityZoneCollection>> {
  return loadValidated(SOURCE_URL, validateOpportunityZones, {
    source: "HUD Opportunity Zones (Treasury/IRS designated QOZ tracts)",
    vintage: "2018 designations (in effect through 12/31/2028)",
  });
}
