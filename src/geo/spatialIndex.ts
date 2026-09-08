// Client-side spatial index for the inspector's point-in-polygon lookups
// ("which tract / district / flood zone contains this school?"). Naive iteration
// is fine for 30 sample polygons and wrong for 4,000 tracts in production, so we
// build an rbush index of polygon bounding boxes once when a layer loads and
// query it before running the exact point-in-polygon test.

import RBush from "rbush";
import { booleanPointInPolygon, bbox as turfBbox } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { LngLat } from "./measure";

interface IndexedBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  feature: Feature<Polygon | MultiPolygon>;
}

export class PolygonIndex {
  private tree = new RBush<IndexedBox>();

  constructor(features: Array<Feature<Polygon | MultiPolygon>>) {
    const boxes = features.map((feature) => {
      const [minX, minY, maxX, maxY] = turfBbox(feature);
      return { minX, minY, maxX, maxY, feature };
    });
    this.tree.load(boxes);
  }

  // Every polygon that actually contains the point (bbox prefilter, then exact
  // point-in-polygon). Usually zero or one; more if polygons overlap.
  containing(pointLngLat: LngLat): Array<Feature<Polygon | MultiPolygon>> {
    const [x, y] = pointLngLat;
    const candidates = this.tree.search({ minX: x, minY: y, maxX: x, maxY: y });
    return candidates
      .map((c) => c.feature)
      .filter((f) => booleanPointInPolygon(pointLngLat, f));
  }

  // Convenience: the first containing polygon, or null.
  first(pointLngLat: LngLat): Feature<Polygon | MultiPolygon> | null {
    return this.containing(pointLngLat)[0] ?? null;
  }
}
