// Coarse county bounding polygons for the three pilot counties.
//
// These are intentionally simplified rectangles. They exist to support
// point-in-county validation on the sample data, not to be authoritative county
// boundaries. The identical numbers live in scripts/generate-sample-data.mjs so
// generation and validation never drift. When real data wires in, replace these
// with true county polygons (Census TIGER county shapefile, GEOID 12086 /
// 12011 / 12095) and the containment check keeps working unchanged.

import type { Feature, Polygon } from "geojson";

export type CountyName = "Miami-Dade" | "Broward" | "Orange";

interface Bbox {
  west: number;
  east: number;
  south: number;
  north: number;
  fips: string;
}

// Bounding boxes sized to the real county extents (not just the populated
// coastal strip). Real Broward and Miami-Dade run west deep into the
// Everglades, and Orange extends west toward Lake County. These loose bounds
// let the containment check pass for real NCES-geocoded schools without
// requiring real TIGER county polygons. When TIGER county polygons wire in,
// swap these for the true boundaries and the containment check still works.
export const COUNTY_BBOX: Record<CountyName, Bbox> = {
  "Miami-Dade": { west: -80.9, east: -80.10, south: 25.10, north: 26.00, fips: "12086" },
  Broward: { west: -80.9, east: -80.05, south: 25.95, north: 26.40, fips: "12011" },
  Orange: { west: -81.70, east: -80.85, south: 28.30, north: 28.85, fips: "12095" },
};

// Floor on zoom-out. The default view (zoom 7) frames all three pilot counties
// (Orange is ~200 mi north of Miami-Dade/Broward, so the tri-county overview is
// inherently a near-whole-state view). The floor sits one step below the default
// so users get a little breathing room for orientation, while the map still
// cannot recede to national scale into empty basemap. A tight lat/lng
// `restriction` box is deliberately NOT used: it is incompatible with three
// far-apart counties (it would fight the tri-county overview), so the zoom floor
// is the clean lever.
export const PILOT_MIN_ZOOM = 6;

// Florida-wide bounding box used as a first-pass sanity gate on every
// coordinate (see 04_SAMPLE_SCHEMAS.md validation on load). Sized to Florida's
// true extent: the Atlantic coast reaches about -79.97 E and the tip of the
// mainland/Florida Bay drops to about 24.4 N, so authoritative TIGER boundary
// polygons (county, tract, legislative district) validate without false
// rejects. This is a coarse sanity gate, not an authoritative boundary.
export const FLORIDA_BBOX = { west: -87.65, east: -79.9, south: 24.3, north: 31.05 };

export function isInFloridaBbox(lon: number, lat: number): boolean {
  return (
    lon >= FLORIDA_BBOX.west &&
    lon <= FLORIDA_BBOX.east &&
    lat >= FLORIDA_BBOX.south &&
    lat <= FLORIDA_BBOX.north
  );
}

export function countyPolygon(county: CountyName): Feature<Polygon> {
  const b = COUNTY_BBOX[county];
  return {
    type: "Feature",
    properties: { county, fips: b.fips },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [b.west, b.south],
          [b.east, b.south],
          [b.east, b.north],
          [b.west, b.north],
          [b.west, b.south],
        ],
      ],
    },
  };
}
