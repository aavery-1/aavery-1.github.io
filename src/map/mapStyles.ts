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

// Palette (kept in step with the app shell's neutrals).
const LAND = "#f4f3ee";        // warm paper
const LAND_STROKE = "#e7e5dd";
const ROAD = "#ffffff";
const ROAD_STROKE = "#e9e6df";
const ROAD_HWY = "#efece4";
const ROAD_HWY_STROKE = "#e2ded3";
const WATER = "#c7d8de";       // muted blue-gray
const PARK = "#e7ece0";        // faint green
const ADMIN = "#d8d5cc";
const LABEL = "#5c5b52";
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
