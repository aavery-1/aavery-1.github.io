// Drive-time reach (isochrone) adapter.
//
// SAMPLE: /data/isochrone.sample.geojson (committed, one 15-minute driving
// isochrone per county).
// TODO (real source): OpenStreetMap routed through OpenRouteService (demo only,
// roughly 40 isochrones/day on the free tier) or a self-hosted Valhalla on a
// small VM (the recommended default at 3-county scale). Isochrones are already
// ground-truth because they run on the real road network. population_within is
// precomputed by area-weighting ACS school-age population against the polygon
// (see src/geo/intersect.ts). Precompute and cache. See 03_DATA_CATALOG.md.

import { loadValidated } from "./base";
import { validateIsochrones } from "../validate";
import type { LoadResult, IsochroneCollection } from "../types";

export const SAMPLE_URL = "/data/isochrone.sample.geojson";

export function loadIsochrones(): Promise<LoadResult<IsochroneCollection>> {
  return loadValidated(SAMPLE_URL, validateIsochrones, {
    source: "OSM via OpenRouteService or self-hosted Valhalla (sample)",
    vintage: "OSM snapshot 2025-11-01",
  });
}
