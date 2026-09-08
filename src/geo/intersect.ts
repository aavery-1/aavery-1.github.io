// Area-weighted apportionment. When a radius ring or a drive-time isochrone
// partially covers a census polygon, that polygon contributes a fraction of its
// value equal to the fraction of its area that falls inside. A tract 40% inside
// the buffer contributes 40% of its population. We never count a polygon as
// fully in or fully out. All areas are true ground areas (turf.area on WGS84),
// so the weighting is honest.

import { intersect, area as turfArea, featureCollection } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, FeatureCollection } from "geojson";

export interface ApportionResult {
  total: number; // apportioned sum of the value field
  contributions: Array<{
    id: string;
    fullValue: number;
    fraction: number; // 0..1, area of overlap / area of polygon
    contributed: number;
  }>;
}

// Sum a numeric property of every polygon in `polygons`, weighting each by the
// fraction of its area that intersects `region`.
export function apportionByArea(
  region: Feature<Polygon | MultiPolygon>,
  polygons: FeatureCollection<Polygon | MultiPolygon>,
  valueField: string,
  idField = "geoid",
): ApportionResult {
  const contributions: ApportionResult["contributions"] = [];
  let total = 0;

  for (const poly of polygons.features) {
    const rawValue = poly.properties?.[valueField];
    if (rawValue == null || typeof rawValue !== "number") continue;

    const polyArea = turfArea(poly);
    if (polyArea <= 0) continue;

    let overlap: Feature<Polygon | MultiPolygon> | null = null;
    try {
      overlap = intersect(featureCollection([region, poly])) as Feature<Polygon | MultiPolygon> | null;
    } catch {
      overlap = null;
    }
    if (!overlap) continue;

    const overlapArea = turfArea(overlap);
    const fraction = Math.max(0, Math.min(1, overlapArea / polyArea));
    if (fraction <= 0) continue;

    const contributed = rawValue * fraction;
    total += contributed;
    contributions.push({
      id: String(poly.properties?.[idField] ?? poly.properties?.[valueField] ?? contributions.length),
      fullValue: rawValue,
      fraction,
      contributed,
    });
  }

  return { total, contributions };
}
