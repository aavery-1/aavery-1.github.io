// Ellipsoidal geodesics on the WGS84 ellipsoid (Vincenty 1975), from the shared engine (src/shared-geo/sharedGeo.ts,
// byte-identical to Grove's; GEO_RULESET.md rules 2-3). Every eligibility decision (the 5-mile PLP radius) and every
// radius ring is built from these functions, so the number we decide on and the ring we draw are the same true ground
// geometry, and Grove measures the same distance to the millimetre.
//
//   - ellipsoidalDistanceMeters: the inverse problem (distance between two points)
//   - ellipsoidalDestination:    the direct problem (a point at a distance and bearing from a start)

import { destination, distanceMeters, METERS_PER_MILE } from "../shared-geo/sharedGeo";
import type { LngLat } from "./measure";

export function ellipsoidalDistanceMeters(a: LngLat, b: LngLat): number {
  return distanceMeters([a[0], a[1]], [b[0], b[1]]);
}

export function ellipsoidalDestination(start: LngLat, distMeters: number, bearingDeg: number): LngLat {
  return destination([start[0], start[1]], distMeters, bearingDeg);
}

export function ellipsoidalDistanceMiles(a: LngLat, b: LngLat): number {
  return ellipsoidalDistanceMeters(a, b) / METERS_PER_MILE;
}
