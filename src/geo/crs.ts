// Coordinate reference notes and helpers for Florida.
//
// Rule (see 05_ACCURACY_STANDARDS.md section 1):
//   Store in WGS84 (EPSG:4326). Measure geodesically. Render in Web Mercator
//   (EPSG:3857, which Google Maps and deck.gl both use). Never let the rendering
//   projection do the math.
//
// Distance is the WGS84 ELLIPSOIDAL geodesic (Vincenty, src/geo/geodesic.ts) and
// area is turf.area (also ellipsoidal), both operating on WGS84 lon/lat, so on
// the client we never manually project to measure and the values are true ground
// distance/area. These constants document the projected CRS options for a future
// PostGIS backend, where geography-type math or a projected State Plane CRS gives
// equivalent fidelity within Florida.

export const CRS = {
  storage: "EPSG:4326", // WGS84, what every sample file uses
  render: "EPSG:3857", // Web Mercator, the on-screen projection
  // Florida East State Plane, best for the three pilot counties (feet).
  floridaEastStatePlane: "EPSG:2236",
  // UTM zone 17N, an equal-ish alternative covering the pilot area (meters).
  utm17N: "EPSG:26917",
} as const;

// The three pilot counties all fall in Florida East State Plane.
export const PILOT_PROJECTED_CRS = CRS.floridaEastStatePlane;
