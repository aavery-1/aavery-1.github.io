// Geodesic radius rings. A correct N-mile ring is a true geodesic buffer, not a
// fixed-pixel circle. On a Web Mercator screen it appears slightly non-circular,
// especially far from the equator. That is honesty, not a bug: every point on
// the ring is genuinely N ground miles from the center.
//
// Ring vertices are placed with the WGS84 ELLIPSOIDAL direct geodesic (Vincenty,
// see geodesic.ts), the same model distanceMiles uses, so the drawn ring and the
// eligibility decision are the identical ground geometry (no sphere-vs-ellipsoid
// mismatch at the ring edge).

import { ringAreaSqMi } from "../shared-geo/sharedGeo";
import type { Feature, Polygon } from "geojson";
import type { LngLat } from "./measure";
import { milesToMeters } from "./measure";
import { ellipsoidalDestination } from "./geodesic";


// A true ellipsoidal geodesic circle of the given radius in miles, as a GeoJSON
// polygon. steps controls vertex count; 128 keeps the area within a hair of the
// ideal and the outline visually smooth.
export function geodesicBufferMiles(center: LngLat, miles: number, steps = 128): Feature<Polygon> {
  const distM = milesToMeters(miles);
  const ring: LngLat[] = [];
  for (let i = 0; i < steps; i++) {
    ring.push(ellipsoidalDestination(center, distM, (i / steps) * 360));
  }
  ring.push(ring[0]); // close the ring
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

// Ground area of a polygon in square miles: the shared engine's formula (turf.area's
// spherical formula, mean Earth radius), so Grove reports the same area. Holes subtract.
export function areaSquareMiles(feature: Feature<Polygon>): number {
  const [outer, ...holes] = feature.geometry.coordinates;
  return holes.reduce((a, h) => a - ringAreaSqMi(h), ringAreaSqMi(outer));
}
