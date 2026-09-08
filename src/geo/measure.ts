// The ONLY place straight-line distance is computed. Every component that needs
// a distance imports from here. No component measures on its own. This is the
// single source of geometric truth for distance, enforced by the tests in
// src/geo/__tests__/.
//
// All distance is geodesic on the WGS84 ELLIPSOID (Vincenty, see geodesic.ts),
// exact to well under a millimeter at any scale here. We never do arithmetic on
// raw longitude/latitude as if the map were flat graph paper, and we never
// measure in screen pixels. That is the "5 miles is 5 miles" guarantee.

// Longitude first, latitude second (GeoJSON order). Aliased so intent is clear.
export type LngLat = [number, number];

import { ellipsoidalDistanceMeters } from "./geodesic";

const METERS_PER_MILE = 1609.344;

// Ellipsoidal geodesic distance between two points, in meters.
export function distanceMeters(a: LngLat, b: LngLat): number {
  return ellipsoidalDistanceMeters(a, b);
}

// Ellipsoidal geodesic distance between two points, in statute miles.
export function distanceMiles(a: LngLat, b: LngLat): number {
  return distanceMeters(a, b) / METERS_PER_MILE;
}

// Cumulative geodesic length of a polyline (the measure tool's running total).
export function pathDistanceMiles(points: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceMiles(points[i - 1], points[i]);
  }
  return total;
}

// Ground distance represented by one horizontal screen span at a given map
// center latitude. The scale bar uses this so its label is true ground distance
// at the current view, matching the measure tool on any local segment.
export function groundDistanceAtLatitudeMiles(centerLat: number, lonSpanDegrees: number): number {
  const a: LngLat = [0, centerLat];
  const b: LngLat = [lonSpanDegrees, centerLat];
  return distanceMiles(a, b);
}

export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}
