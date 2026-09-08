// Basemap styling: a clean, light cartographic "analyst" base.
//
// The single biggest lever for a professional data map is CONTRAST and
// HIERARCHY: the data must lead and the basemap must recede to a quiet,
// legible substrate (Mapbox's four principles: contrast, hierarchy, density,
// legibility). Google's default roadmap ships at full saturation with business
// POIs and transit that fight the data. Simply desaturating it reads drab, so
// this is an explicit light palette instead: paper-toned land, soft off-white
// roads, a muted blue-gray water, and a whisper of green for parks. POIs and
// transit are removed as noise; place labels keep a white halo for legibility.
//
// Applied to the roadmap and terrain base types (Google ignores geometry colors
// on satellite imagery, but the POI/label hides still declutter the hybrid view).

import type { BaseMapType } from "../store";

// Palette, tuned to harmonize with the MD3 surface tones (cool, slightly
// blue-lavender neutrals from the surfaceContainer family, not the old warm
// paper). The land sits a step darker than the app surface (#faf8ff) so the map
// reads as its own surface; water leans into the MD3 blue family.
const LAND = "#eef0f8";        // cool MD3 neutral land
const LAND_STROKE = "#e2e4ef";
const ROAD = "#ffffff";
const ROAD_STROKE = "#e6e8f1";
const ROAD_HWY = "#eceef6";
const ROAD_HWY_STROKE = "#dfe2ee";
const WATER = "#c4d3e8";       // muted MD3-family blue
const PARK = "#dde8e2";        // faint cool green
const ADMIN = "#cfd2e0";
const LABEL = "#4a4c58";       // cool onSurfaceVariant-toned label
const LABEL_HALO = "#ffffff";

const ANALYST_BASEMAP_STYLE: google.maps.MapTypeStyle[] = [
  // Paper land + haloed labels; drop label icons so only text remains.
  { elementType: "geometry", stylers: [{ color: LAND }] },
  { elementType: "labels.text.fill", stylers: [{ color: LABEL }] },
  { elementType: "labels.text.stroke", stylers: [{ visibility: "on" }, { color: LABEL_HALO }, { weight: 2 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },

  // Administrative lines: quiet county/state edges; hide parcel + neighborhood noise.
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: ADMIN }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", elementType: "labels", stylers: [{ visibility: "off" }] },

  // POIs are noise for siting analysis: remove them, keep parks as faint green.
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: PARK }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: LAND }] },

  // Transit is irrelevant here.
  { featureType: "transit", stylers: [{ visibility: "off" }] },

  // Roads: a soft off-white network for orientation; highways a touch warmer,
  // local road labels hidden so the network reads as structure, not text.
  { featureType: "road", elementType: "geometry", stylers: [{ color: ROAD }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: ROAD_STROKE }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: ROAD_HWY }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: ROAD_HWY_STROKE }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: LAND_STROKE }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },

  // A calm, low-saturation water so the coastline reads without shouting.
  { featureType: "water", elementType: "geometry", stylers: [{ color: WATER }] },
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
];

// The style to apply for a given base type. Satellite (hybrid) keeps its imagery
// but still benefits from the POI/transit declutter; terrain and roadmap take
// the full light treatment.
export function basemapStyleFor(_type: BaseMapType): google.maps.MapTypeStyle[] {
  return ANALYST_BASEMAP_STYLE;
}
