// Parcels adapter (optional). No sample committed, and deliberately never a
// committed GeoJSON.
//
// TODO (real source): county Property Appraiser parcel files, THREE separate
// county sources (Miami-Dade, Broward, Orange), join key folio. Miami-Dade alone
// has roughly 800,000 parcels, so this cannot follow the sample-GeoJSON pattern
// the other layers use. It requires PostGIS storage and vector tiles from day
// one. The layer's high minZoom (16) prevents accidentally loading it at county
// view. This is why parcels stays optional. See 03_DATA_CATALOG.md.

import { noSample } from "./base";
import type { LoadResult } from "../types";

export function loadParcels(): Promise<LoadResult<unknown>> {
  return Promise.resolve(
    noSample({
      source: "Miami-Dade, Broward, Orange Property Appraisers (requires PostGIS + vector tiles)",
      vintage: "Varies per county",
    }),
  );
}
