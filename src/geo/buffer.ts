// Geodesic radius rings. A correct N-mile ring is a true geodesic buffer, not a
// fixed-pixel circle. On a Web Mercator screen it appears slightly non-circular,
// especially far from the equator. That is honesty, not a bug: every point on
// the ring is genuinely N ground miles from the center.
//
// Ring vertices are placed with the WGS84 ELLIPSOIDAL direct geodesic (Vincenty,
// see geodesic.ts), the same model distanceMiles uses, so the drawn ring and the
// eligibility decision are the identical ground geometry (no sphere-vs-ellipsoid
// mismatch at the ring edge).

import { area as turfArea } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { LngLat } from "./measure";
import { milesToMeters } from "./measure";
import { ellipsoidalDestination } from "./geodesic";

const SQ_METERS_PER_SQ_MILE = 2589988.110336;

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

// Ground area of a polygon in square miles. turf.area returns square meters on
// the WGS84 ellipsoid, which is the true ground area, not a Mercator area.
export function areaSquareMiles(feature: Feature<Polygon>): number {
  return turfArea(feature) / SQ_METERS_PER_SQ_MILE;
}
