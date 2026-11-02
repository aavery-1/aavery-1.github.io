// Basemap styling: a clean, light cartographic "analyst" base in Carbon grays.
//
// The single biggest lever for a professional data map is CONTRAST and
// HIERARCHY: the data must lead and the basemap must recede to a quiet,
// legible substrate (Mapbox's four principles: contrast, hierarchy, density,
// legibility). Google's default roadmap ships at full saturation with business
// POIs and transit that fight the data. Simply desaturating it reads drab, so
// this is an explicit light palette instead: neutral gray land, white
// roads, a muted blue-gray water, and a whisper of green for parks. POIs and
// transit are removed as noise; place labels keep a white halo for legibility.
//
// Applied to the roadmap and terrain base types (Google ignores geometry colors
// on satellite imagery, but the POI/label hides still declutter the hybrid view).

import type { BaseMapType } from "../store";

// Palette: Carbon's neutral Gray family (the app's g10 canvas), so the basemap
// reads as part of the same UI rather than a warm, off-brand paper. The cool,
// low-chroma water and park tints stay quiet so every hue on the map belongs to
// the data (grade, PLP, co-location), not the substrate.
const LAND = "#f2f2f2";        // between Carbon Gray 10 and White
const LAND_STROKE = "#e0e0e0"; // Gray 20
const ROAD = "#ffffff";
const ROAD_STROKE = "#e0e0e0"; // Gray 20
const ROAD_HWY = "#e8e8e8";
const ROAD_HWY_STROKE = "#d1d1d1";
const ROAD_ART = "#fbfbfb";
const WATER = "#cbd9e4";       // a desaturated Carbon Blue 20
const PARK = "#e2ebde";        // a whisper of Carbon Green
const ADMIN = "#c6c6c6";       // Gray 30
const LABEL = "#6f6f6f";       // Gray 60, helper text
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
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: ROAD_ART }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: LAND_STROKE }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#8d8d8d" }] }, // Gray 50
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
