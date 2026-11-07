// Builds the deck.gl layer list from the active-layer set and the loaded data.
// This is the only place layer geometry becomes deck.gl layers. The school set
// it draws comes straight from useFilteredSchools, so the map, the list, and the
// summary callouts always render the exact same schools. Tool overlays (radius
// ring, measure path) are appended last so they draw over the data.

import { useMemo } from "react";
import { GeoJsonLayer, ScatterplotLayer, TextLayer, PathLayer, IconLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import { centroid, bboxClip, pointOnFeature, union } from "@turf/turf";
import { layerById } from "../config/layers";
import { useStore, utilizationStyle, isUnderutilizedFacility, emptyPermanentSeats, type UtilKey } from "../store";
import type { MapBounds } from "../store";
import { useData } from "../data/DataContext";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import type { NearbyPlp } from "../data/derive/filters";
import { resolveGradeStyle } from "./gradeEncoding";
import { matchHopeOperator, isKippSchool } from "../data/derive/hopeOperators";
import { sohMarker, sohMarkerLabel, hasKippMarker, type SohMarker } from "../data/derive/sohSites";
import { iconForShape, shapeForType, shadowIconForShape, iconForBadge, SHADOW_SCALE, type MarkerBadge } from "./markerShapes";
import { placeLabels, measureLabel, LABEL_PAD_X, LABEL_PAD_Y, type PlacedLabel } from "./labelPlacement";
import { useMapFont } from "./mapFonts";
import { geodesicBufferMiles } from "../geo/buffer";
import type { SchoolFeature, LegislativeProps } from "../data/types";
import { levelLabel } from "../data/types";
import { useDriveTimes } from "../geo/driveTime";

const SOH_RADIUS_MILES = 5;

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerp(a: Rgb, b: Rgb, frac: number): Rgb {
  return [Math.round(a[0] + (b[0] - a[0]) * frac), Math.round(a[1] + (b[1] - a[1]) * frac), Math.round(a[2] + (b[2] - a[2]) * frac)];
}

function rampColor(value: number, domain: number[], stops: string[]): Rgb {
  if (domain.length === 3 && stops.length === 3) {
    const [lo, mid, hi] = domain;
    if (value <= mid) {
      const t = Math.max(0, Math.min(1, (value - lo) / (mid - lo)));
      return lerp(hexToRgb(stops[0]), hexToRgb(stops[1]), t);
    }
    const t = Math.max(0, Math.min(1, (value - mid) / (hi - mid)));
    return lerp(hexToRgb(stops[1]), hexToRgb(stops[2]), t);
  }
  const lo = domain[0];
  const hi = domain[domain.length - 1];
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  return lerp(hexToRgb(stops[i]), hexToRgb(stops[i + 1]), scaled - i);
}

export interface SchoolHoverInfo {
  x: number;
  y: number;
  name: string;
  grade: string;
  type: string;
  level: string;
  // The statutory Facility Utilization Rate (COFTE / TOTAL stations) from the
  // shared utilizationStyle helper, so the tooltip agrees with the inspector, the
  // dock, and the list. `utilPct` is that rate; when no COFTE is reported it falls
  // back to an enrollment proxy, flagged by `utilBasis === "enrollment"`. We show
  // the rate only (not a raw enrollment/stations pair) so nothing on the tooltip
  // divides to a second, contradicting percentage.
  utilPct: number | null;
  utilKey: UtilKey;                 // under | inuse | full | unknown (statutory tiers)
  utilBasis: "cofte" | "enrollment" | "none";
  // The room figure: permanent stations minus headcount (emptyPermanentSeats).
  // Shown as a COUNT beside the statutory rate, never as a second percentage.
  emptySeats: number | null;
  // The statutory underused test (FUR <= 75% OR >= 400 surplus stations), as an
  // explicit yes/no; null when capacity is unreported so we can say so.
  underutilized: boolean | null;
  sohEligible: boolean;             // in a School of Hope siting area and Title I eligible
  isPlp: boolean;                   // a persistently low-performing anchor
  coLocationEligible: boolean;
  // Structured qualifying pathways for a co-location candidate, so the tooltip can
  // list them as scannable rows instead of one run-on sentence.
  coLocInOZ: boolean;
  coLocNearestPlp: { msid: string; name: string; miles: number } | null;
  coLocIsPlpAnchor: boolean;
  // Every same-county PLP within 5 miles of this school, nearest first (all schools,
  // not just co-location candidates), so the tooltip can list the anchors a School
  // of Hope here could serve. Empty when none. From ctx.nearbyPlps in filters.ts.
  nearbyPlps: NearbyPlp[];
  // The state-designated hope operator that runs this school (Mater, KIPP, ...),
  // or null. When set, the school is an existing School of Hope and its marker
  // carries a gold star. Surfaced on the tooltip so the star reads as meaning.
  hopeOperator: string | null;
  // A KIPP school: shows a reduced tooltip (the letter grade instead of the
  // facility facts), matching the inspector's reduced view. Same predicate the
  // inspector uses, so the two never disagree. See data/derive/hopeOperators.ts.
  isKipp: boolean;
  // The School of Hope marker this school carries on the map (gold star, a solid
  // KIPP dot, an open KIPP requested-building dot), or null, with its hover-card
  // label. From the shared classifier in data/derive/sohSites.ts, so the card and
  // the map dot never disagree.
  sohMarker: SohMarker;
  sohLabel: string | null;
}

// One GeoJsonLayer for a single legislative chamber, filtered from the shared
// legislative source. Kept as a helper so the three chamber toggles stay
// independent and consistent.
// A boundary line drawn with a white casing beneath it, so a thin colored
// outline stays legible over a busy basemap (the technique that keeps drawn
// boundaries readable). Returns the casing and the colored line as a pair.
function casedBoundary(
  id: string,
  data: GeoJSON.FeatureCollection,
  color: Rgb,
  width: number,
  z: number,
): Array<{ z: number; layer: Layer }> {
  return [
    {
      z: z - 0.1,
      layer: new GeoJsonLayer({
        id: `${id}_casing`,
        data,
        stroked: true,
        filled: false,
        getLineColor: [255, 255, 255, 210],
        getLineWidth: width + 2.5,
        lineWidthUnits: "pixels",
      }),
    },
    {
      z,
      layer: new GeoJsonLayer({
        id,
        data,
        stroked: true,
        filled: false,
        getLineColor: [color[0], color[1], color[2], 245],
        getLineWidth: width,
        lineWidthUnits: "pixels",
      }),
    },
  ];
}

// Where a boundary's label sits. Normally its centroid, but when the user has
// zoomed deep into a large district the centroid scrolls off-screen; to keep the
// label visible we clip the polygon to the current viewport and place the label
// inside the visible piece (pointOnFeature guarantees it lands on the district,
// not in a neighbor). Features that fall entirely outside the viewport return
// null so no label is drawn for them.
function labelAnchor(feature: GeoJSON.Feature, bounds: MapBounds | null): [number, number] | null {
  const c = centroid(feature as Parameters<typeof centroid>[0]).geometry.coordinates as [number, number];
  if (!bounds) return c;
  const [lng, lat] = c;
  const inView = lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north;
  if (inView) return c;
  try {
    const clipped = bboxClip(feature as Parameters<typeof bboxClip>[0], [bounds.west, bounds.south, bounds.east, bounds.north]);
    const coords = (clipped.geometry as { coordinates: unknown[] } | null)?.coordinates;
    if (!coords || coords.length === 0) return null;
    return pointOnFeature(clipped).geometry.coordinates as [number, number];
  } catch {
    return c;
  }
}

// A label for each boundary polygon, matching the board-district convention:
// bold text in the boundary color inside a white pill, so the district name
// reads over a busy basemap. This is the single place boundary labels are
// styled, so every boundary layer names itself the same way. offsetY lets
// several boundary layers that are on at once stack their labels into a legible
// ladder instead of piling onto the same point.
function boundaryLabels(
  id: string,
  features: GeoJSON.Feature[],
  getLabel: (f: GeoJSON.Feature) => string,
  color: Rgb,
  z: number,
  bounds: MapBounds | null,
  font: string,
  offsetY = 0,
): { z: number; layer: Layer } {
  const data = features
    .map((f) => {
      const position = labelAnchor(f, bounds);
      return position ? { position, text: getLabel(f) } : null;
    })
    .filter((d): d is { position: [number, number]; text: string } => d !== null);
  return {
    z,
    layer: new TextLayer({
      id: `${id}_labels`,
      data,
      getPosition: (d: { position: [number, number] }) => d.position,
      getText: (d: { text: string }) => d.text,
      getSize: 12,
      getColor: [color[0], color[1], color[2], 255],
      getPixelOffset: [0, offsetY],
      fontFamily: font,
      fontWeight: 600,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      background: true,
      getBackgroundColor: [255, 255, 255, 242],
      getBorderColor: [color[0], color[1], color[2], 235],
      getBorderWidth: 1,
      backgroundBorderRadius: 2,
      backgroundPadding: [6, 3],
    }),
  };
}

// Compact chamber-prefixed district label (e.g. "CD 27", "SD 38", "HD 98"), so
// a busy set of districts stays legible where the full "Congressional District
// 27" would collide.
const CHAMBER_PREFIX: Record<LegislativeProps["chamber"], string> = { CD: "CD", SLDU: "SD", SLDL: "HD" };

function chamberLayer(
  id: string,
  chamber: LegislativeProps["chamber"],
  features: GeoJSON.Feature[],
  color: Rgb,
  width: number,
  z: number,
  showLabels: boolean,
  bounds: MapBounds | null,
  offsetY: number,
  font: string,
): Array<{ z: number; layer: Layer }> {
  const subset = features.filter((f) => (f.properties as LegislativeProps).chamber === chamber);
  const layers = casedBoundary(id, { type: "FeatureCollection", features: subset } as GeoJSON.FeatureCollection, color, width, z);
  if (showLabels && subset.length) {
    layers.push(
      boundaryLabels(
        id,
        subset,
        (f) => `${CHAMBER_PREFIX[chamber]} ${(f.properties as LegislativeProps).district_number}`,
        color,
        z + 0.5,
        bounds,
        font,
        offsetY,
      ),
    );
  }
  return layers;
}

export function useDeckLayers(
  onSchoolHover?: (info: SchoolHoverInfo | null) => void,
): Layer[] {
  const activeLayerIds = useStore((s) => s.activeLayerIds);
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  const comparePinnedMsids = useStore((s) => s.comparePinnedMsids);
  const pickedMsids = useStore((s) => s.pickedMsids);
  const isolatePicked = useStore((s) => s.isolatePicked);
  const selectSchool = useStore((s) => s.selectSchool);
  const radiusCenter = useStore((s) => s.radiusCenter);
  const radiusMiles = useStore((s) => s.radiusMiles);
  const measurePoints = useStore((s) => s.measurePoints);
  const drawnCircle = useStore((s) => s.drawnCircle);
  const countySelection = useStore((s) => s.countySelection);
  const mapZoom = useStore((s) => s.mapZoom);
  const mapBounds = useStore((s) => s.mapBounds);
  const activeTool = useStore((s) => s.activeTool);
  const { income, boardDistricts, populationGrowth, opportunityZones, legislative } = useData();
  // Drive times are computed on demand per school (geo/driveTime.ts); the map
  // draws the selected school's once the "Drive times" layer is on.
  const driveEntry = useDriveTimes((s) => (selectedSchoolMsid ? s.byMsid[selectedSchoolMsid] : undefined));
  const { features: filteredFeats, inViewFeatures, all, ctx } = useFilteredSchools();
  const font = useMapFont();

  // The selected school (from search, the list, or the dock) and any
  // compare-pinned schools must always be visible on the map, even when the
  // active filters would otherwise hide them: a search result that flies to a
  // location with zero rendered pins looks broken, and the marker layer
  // already colors these schools distinctly (isFocused below) whether or not
  // this augmentation is needed. This is map-rendering-only: the shared
  // useFilteredSchools() feed (and every count/list derived from it) is
  // untouched, so a filtered-out searched school never inflates "N schools".
  const feats = useMemo(() => {
    // Hand-picked schools are also kept always-visible (like the selection and the
    // shortlist), so building a pick list never fights the other filters. But NOT
    // while isolate is on: there the picks ARE the whole set, and re-adding them
    // would defeat "show only these" (and re-show picks the filter already drops).
    const focusMsids = [
      selectedSchoolMsid,
      ...comparePinnedMsids,
      ...(isolatePicked ? [] : [...pickedMsids]),
    ].filter((m): m is string => Boolean(m));
    if (focusMsids.length === 0) return filteredFeats;
    const inFeats = new Set(filteredFeats.map((f) => f.properties.msid));
    const missing = focusMsids
      .filter((msid) => !inFeats.has(msid))
      .map((msid) => all.find((f) => f.properties.msid === msid))
      .filter((f): f is SchoolFeature => Boolean(f));
    return missing.length ? [...filteredFeats, ...missing] : filteredFeats;
  }, [filteredFeats, all, selectedSchoolMsid, comparePinnedMsids, pickedMsids, isolatePicked]);

  // 5-mile SoH radius around each PLP anchor in the selected counties. This is
  // a visual overlay: it reflects ALL PLP anchors in-geography, independent of
  // the school-level filters (grade, type, utilization), per the brief.
  const plpOn = activeLayerIds.has("plp_radius");
  const plpArea = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!plpOn) return null;
    const centers = plpAnchorCenters(all, ctx.plp, countySelection);
    if (!centers.length) return null;
    const circles = centers.map((c) => geodesicBufferMiles([c.lng, c.lat], SOH_RADIUS_MILES));
    // Dissolve the overlapping 5-mile circles into ONE eligibility area, so
    // the fill reads as a single calm region with a clean outer boundary
    // instead of dozens of stacked circles compounding into a red blob. This
    // is also the honest shape: the union of the radii IS the eligible area.
    let merged: GeoJSON.Feature;
    try {
      merged = union({ type: "FeatureCollection", features: circles } as GeoJSON.FeatureCollection<GeoJSON.Polygon>) as GeoJSON.Feature;
    } catch {
      merged = {
        type: "Feature",
        properties: {},
        geometry: { type: "MultiPolygon", coordinates: circles.map((c) => (c.geometry as GeoJSON.Polygon).coordinates) },
      };
    }
    return { type: "FeatureCollection", features: [merged] } as GeoJSON.FeatureCollection;
  }, [plpOn, all, ctx.plp, countySelection]);

  return useMemo(() => {
    const built: Array<{ z: number; layer: Layer }> = [];
    const has = (id: string) => activeLayerIds.has(id);

    // Income choropleth (fill only; sample tract geometry reads as a grid with
    // strokes, so strokes stay off until real ACS geometry wires in).
    if (has("household_income") && income) {
      const cfg = layerById("household_income")!;
      const ramp = cfg.style.colorRamp!;
      built.push({
        z: 10,
        layer: new GeoJsonLayer({
          id: "household_income",
          data: income as unknown as GeoJSON.FeatureCollection,
          stroked: true,
          filled: true,
          getFillColor: (f: GeoJSON.Feature) => {
            const v = (f.properties as { median_household_income: number | null }).median_household_income;
            if (v == null) return [0, 0, 0, 0];
            const [r, g, b] = rampColor(v, ramp.domain, ramp.stops);
            return [r, g, b, Math.round((cfg.style.fillOpacity ?? 0.32) * 255)];
          },
          // Real ACS tract geometry now, so faint boundary strokes read as tracts.
          getLineColor: [255, 255, 255, 90],
          getLineWidth: 0.5,
          lineWidthUnits: "pixels",
        }),
      });
    }

    // Population growth choropleth (county level, diverging on growth_rate).
    if (has("population_growth") && populationGrowth) {
      const cfg = layerById("population_growth")!;
      const ramp = cfg.style.colorRamp!;
      built.push({
        z: 12,
        layer: new GeoJsonLayer({
          id: "population_growth",
          data: populationGrowth as unknown as GeoJSON.FeatureCollection,
          stroked: true,
          filled: true,
          getFillColor: (f: GeoJSON.Feature) => {
            const v = (f.properties as { growth_rate: number }).growth_rate;
            const [r, g, b] = rampColor(v, ramp.domain, ramp.stops);
            return [r, g, b, Math.round((cfg.style.fillOpacity ?? 0.5) * 255)];
          },
          getLineColor: [255, 255, 255, 180],
          getLineWidth: 0.5,
          lineWidthUnits: "pixels",
        }),
      });
    }

    // Opportunity zones
    if (has("opportunity_zones") && opportunityZones) {
      const cfg = layerById("opportunity_zones")!;
      const [fr, fg, fb] = hexToRgb(cfg.style.fillColor ?? "#FFECB3");
      const [sr, sg, sb] = hexToRgb(cfg.style.strokeColor ?? "#FF8F00");
      built.push({
        z: 22,
        layer: new GeoJsonLayer({
          id: "opportunity_zones",
          data: opportunityZones as unknown as GeoJSON.FeatureCollection,
          stroked: true,
          filled: true,
          getFillColor: [fr, fg, fb, Math.round((cfg.style.fillOpacity ?? 0.4) * 255)],
          getLineColor: [sr, sg, sb, 220],
          getLineWidth: 1,
          lineWidthUnits: "pixels",
        }),
      });
    }

    // Drive times for the selected school: nested 15 / 10 / 5 minute areas,
    // drawn outermost first so the inner (darker) bands sit on top. Colors match
    // the inspector's column keys (KIPP navy to light blue).
    if (has("drive_time_reach") && driveEntry?.status === "ready") {
      const DRIVE_COLORS: Record<number, Rgb> = { 5: [32, 39, 93], 10: [74, 111, 181], 15: [82, 195, 237] };
      const contours = [...driveEntry.result.contours].sort((a, b) => b.minutes - a.minutes);
      built.push({
        z: 40,
        layer: new GeoJsonLayer({
          id: "drive_time_reach",
          data: {
            type: "FeatureCollection",
            features: contours.map((c) => ({ type: "Feature", geometry: c.geometry, properties: { minutes: c.minutes } })),
          } as GeoJSON.FeatureCollection,
          stroked: true,
          filled: true,
          getFillColor: (f: GeoJSON.Feature) => [...(DRIVE_COLORS[(f.properties as { minutes: number }).minutes] ?? [32, 39, 93]), 34] as [number, number, number, number],
          getLineColor: (f: GeoJSON.Feature) => [...(DRIVE_COLORS[(f.properties as { minutes: number }).minutes] ?? [32, 39, 93]), 230] as [number, number, number, number],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      });
    }

    // Legislative chambers, each an independent toggle over the shared source.
    // District labels appear once the view is zoomed enough for the pills to sit
    // apart (matching the school-label legibility convention); at a full-state
    // zoom-out the many districts would collide, so labels stay hidden there.
    if (legislative) {
      const legFeatures = (legislative as unknown as GeoJSON.FeatureCollection).features;
      const legLabelsLegible = mapZoom >= 8.5;
      // When several chambers are on at once, stack their labels into a ladder so
      // the pills sit apart instead of colliding at a shared district center.
      if (has("congressional_districts")) built.push(...chamberLayer("congressional_districts", "CD", legFeatures, hexToRgb("#512DA8"), 2.5, 34, legLabelsLegible, mapBounds, -14, font));
      if (has("state_senate_districts")) built.push(...chamberLayer("state_senate_districts", "SLDU", legFeatures, hexToRgb("#7E57C2"), 1.75, 35, legLabelsLegible, mapBounds, 0, font));
      if (has("state_house_districts")) built.push(...chamberLayer("state_house_districts", "SLDL", legFeatures, hexToRgb("#B39DDB"), 1.25, 33, legLabelsLegible, mapBounds, 14, font));
    }

    // Board districts (outline) plus district-number labels. Few districts per
    // county, so labels stay on at every zoom.
    if (has("board_districts") && boardDistricts) {
      const color = hexToRgb("#6D28D9");
      built.push(...casedBoundary("board_districts", boardDistricts as unknown as GeoJSON.FeatureCollection, color, 1.75, 30));
      built.push(
        boundaryLabels(
          "board_districts",
          boardDistricts.features as unknown as GeoJSON.Feature[],
          (f) => `District ${(f.properties as { district_number: string }).district_number}`,
          color,
          31,
          mapBounds,
          font,
          28,
        ),
      );
    }

    // 5-mile SoH radius around each PLP anchor in the selected counties (the
    // dissolved area is computed once in plpArea, outside this memo, so panning
    // and label placement never redo the polygon union).
    if (has("plp_radius") && plpArea) {
      built.push({
        z: 5,
        layer: new GeoJsonLayer({
          id: "plp_radius",
          data: plpArea,
          stroked: true,
          filled: true,
          // Carbon Red 60, kept faint: the area is context, the pins are the data.
          getFillColor: [218, 30, 40, 12],
          getLineColor: [218, 30, 40, 150],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
        }),
      });
    }

    // School markers: SHAPE encodes operator type, COLOR encodes grade, and the
    // grade letter sits inside. Each rich marker is a small stack: a soft drop
    // shadow, a white keyline ring, the grade-tinted shape, and the letter, so it
    // reads as one raised object over the basemap. The shared white shape mask is
    // tinted per grade so shape and color read independently.
    if (has("school_locations")) {
      // Marker treatment is tiered by ON-SCREEN density (Mapbox's "density" +
      // "legibility" principles), counted from the schools actually in view, not
      // the whole filtered set: a street-level view of 120 schools is sparse
      // enough for letters even when 1,100 match the filters statewide. Every
      // marker carries the type SHAPE (circle=District, square=Charter,
      // diamond=Magnet, triangle=Virtual, hexagon=Alternative) colored by grade.
      // A dense view stops there: a calm field of keylined shapes. A sparse view
      // (a filtered set or a zoomed-in neighborhood) adds the grade LETTER, the
      // shadow, and the co-location badge. Detail appears exactly where it is legible.
      const RICH_MAX = 180; // above this many on-screen markers, letters turn to clutter
      const rich = inViewFeatures.length <= RICH_MAX || mapZoom >= 14;

      // State colors, from the Carbon palette and the KIPP brand interactive.
      const SELECTED: [number, number, number, number] = [0, 30, 98, 255];      // KIPP navy, the --focus / interactive token
      const SELECTED_HALO: [number, number, number, number] = [82, 195, 237, 72]; // KIPP light blue, translucent
      const PINNED: [number, number, number, number] = [22, 22, 22, 255];       // Carbon Gray 100
      const PICKED: [number, number, number, number] = [36, 161, 72, 255];      // Carbon Green 50: a hand-picked school
      const WHITE: [number, number, number, number] = [255, 255, 255, 255];
      const HOVER_SHADE: [number, number, number, number] = [0, 0, 0, 52];     // Carbon hover: one step darker
      const isFocused = (msid: string) => msid === selectedSchoolMsid || comparePinnedMsids.includes(msid);
      // A picked school gets a distinct ring so the analyst can see what they have
      // selected while everything is still on the map. Suppressed while isolate is
      // on, where every marker is a pick and a ring on all of them is just noise.
      const isPicked = (msid: string) => !isolatePicked && pickedMsids.has(msid);
      const ringColor = (msid: string): [number, number, number, number] => {
        if (msid === selectedSchoolMsid) return SELECTED;
        if (comparePinnedMsids.includes(msid)) return PINNED;
        if (isPicked(msid)) return PICKED;
        return WHITE;
      };
      const pos = (f: SchoolFeature) => f.geometry.coordinates as [number, number];
      const iconFor = (f: SchoolFeature) => iconForShape(shapeForType(f.properties.type));

      // Shared interaction handlers so dot mode and rich mode behave identically.
      const onMarkerClick = (info: { object?: SchoolFeature }) => {
        if (useStore.getState().activeTool !== "none") return false;
        if (info.object) selectSchool(info.object.properties.msid);
        return true;
      };
      const onMarkerHover = (info: { object?: SchoolFeature; x: number; y: number }) => {
        if (!onSchoolHover) return;
        if (info.object) {
          const p = info.object.properties;
          // Single source of truth for the utilization figure: the statutory
          // COFTE-based FUR (same helper the inspector, dock, and list use), NOT a
          // raw enrollment/capacity ratio. This is why the tooltip previously
          // showed two different numbers for one building.
          const us = utilizationStyle(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
          const underutilized = (p.capacity != null && p.capacity > 0)
            ? isUnderutilizedFacility(p.enrollment, p.capacity, p.cofte, p.fish_surplus)
            : null;
          const coLoc = ctx.coLocationMsids.has(p.msid);
          const reason = coLoc ? ctx.coLocationReasons.get(p.msid) : undefined;
          onSchoolHover({
            x: info.x, y: info.y, name: p.name, grade: p.current_grade, type: p.type, level: levelLabel(p),
            utilPct: us.pct, utilKey: us.key, utilBasis: us.basis, underutilized,
            emptySeats: emptyPermanentSeats(p.enrollment, p.permanent_capacity, p.capacity).seats,
            sohEligible: ctx.sohEligibleMsids.has(p.msid), isPlp: ctx.plp.has(p.msid),
            coLocationEligible: coLoc,
            coLocInOZ: reason?.inOpportunityZone ?? false,
            coLocNearestPlp: reason?.nearestPlp ?? null,
            coLocIsPlpAnchor: reason?.isPlpAnchor ?? false,
            nearbyPlps: ctx.nearbyPlps.get(p.msid) ?? [],
            hopeOperator: matchHopeOperator(p.name),
            isKipp: isKippSchool(p.name),
            sohMarker: sohMarker(p.name, p.msid),
            sohLabel: sohMarkerLabel(p.name, p.msid),
          });
        } else {
          onSchoolHover(null);
        }
      };

      // Marker geometry for this zoom. FILL is the grade shape; RING adds the white
      // keyline (or the state color for a focused school) around it.
      const FILL_PX = rich
        ? Math.max(16, Math.min(28, 16 + (mapZoom - 10) * 2.4))
        : Math.round(Math.max(7, Math.min(13, mapZoom)));
      const RING_PX = FILL_PX + (rich ? 5 : 3);
      const FOCUS_PX = RING_PX + (rich ? 5 : 4);
      const markerRadius = RING_PX / 2;
      const focusFeats = feats.filter((f) => isFocused(f.properties.msid) || isPicked(f.properties.msid));

      // Selection halo: a translucent KIPP-blue disc under the selected school, so
      // the one you are inspecting is findable at a glance on a busy map.
      const selectedFeat = selectedSchoolMsid ? feats.find((f) => f.properties.msid === selectedSchoolMsid) : undefined;
      if (selectedFeat) {
        built.push({
          z: 97,
          layer: new ScatterplotLayer<SchoolFeature>({
            id: "school_selected_halo",
            data: [selectedFeat],
            getPosition: pos,
            radiusUnits: "pixels",
            getRadius: FOCUS_PX / 2 + (rich ? 8 : 7),
            getFillColor: SELECTED_HALO,
            stroked: true,
            getLineColor: [SELECTED[0], SELECTED[1], SELECTED[2], 140],
            getLineWidth: 1,
            lineWidthUnits: "pixels",
            pickable: false,
          }),
        });
      }

      // Soft drop shadow (sparse views only; in a dense field the shadows would
      // merge into a gray smudge).
      if (rich) {
        built.push({
          z: 98,
          layer: new IconLayer<SchoolFeature>({
            id: "school_shadow",
            data: feats,
            getIcon: (f) => shadowIconForShape(shapeForType(f.properties.type)),
            getPosition: pos,
            sizeUnits: "pixels",
            getSize: (f) => (isFocused(f.properties.msid) || isPicked(f.properties.msid) ? FOCUS_PX : RING_PX) * SHADOW_SCALE,
            pickable: false,
            updateTriggers: { getSize: [selectedSchoolMsid, comparePinnedMsids, pickedMsids, isolatePicked, RING_PX] },
          }),
        });
      }

      // Keyline ring: white for every school, the state color (selected navy,
      // shortlisted gray, picked green) for a focused one.
      built.push({
        z: 99,
        layer: new IconLayer<SchoolFeature>({
          id: "school_outline",
          data: feats,
          getIcon: iconFor,
          getPosition: pos,
          sizeUnits: "pixels",
          getSize: (f) => (isFocused(f.properties.msid) || isPicked(f.properties.msid) ? FOCUS_PX : RING_PX),
          getColor: (f) => ringColor(f.properties.msid),
          pickable: false,
          updateTriggers: {
            getColor: [selectedSchoolMsid, comparePinnedMsids, pickedMsids, isolatePicked],
            getSize: [selectedSchoolMsid, comparePinnedMsids, pickedMsids, isolatePicked, RING_PX, FOCUS_PX],
          },
        }),
      });

      // A focused school's state ring is set off from its fill by a thin white
      // inset (Carbon's focus treatment: a color ring over a 1px white gap), so a
      // navy ring never fuses with a dark grade fill.
      if (focusFeats.length) {
        built.push({
          z: 99.5,
          layer: new IconLayer<SchoolFeature>({
            id: "school_focus_inset",
            data: focusFeats,
            getIcon: iconFor,
            getPosition: pos,
            sizeUnits: "pixels",
            getSize: FILL_PX + 3,
            getColor: WHITE,
            pickable: false,
          }),
        });
      }

      // The grade fill. This layer owns click + hover, and darkens a step under
      // the cursor (Carbon's hover state) so the pin you are on is unambiguous.
      built.push({
        z: 100,
        layer: new IconLayer<SchoolFeature>({
          id: "school_locations",
          data: feats,
          pickable: activeTool === "none",
          autoHighlight: true,
          highlightColor: HOVER_SHADE,
          getIcon: iconFor,
          getPosition: pos,
          sizeUnits: "pixels",
          getSize: FILL_PX,
          getColor: (f) => resolveGradeStyle(f.properties.current_grade).fill,
          onClick: onMarkerClick,
          onHover: onMarkerHover,
        }),
      });

      // Grade letter inside every rich marker (the encoding of record), set in
      // IBM Plex Sans like the rest of the Carbon UI. Two-letter grades (NR / NG)
      // step down so they fit the same shape.
      if (rich) {
        const letterPx = Math.max(9, Math.round(FILL_PX * 0.54));
        built.push({
          z: 101,
          layer: new TextLayer<SchoolFeature>({
            id: "school_letters",
            data: feats,
            getPosition: pos,
            getText: (f) => resolveGradeStyle(f.properties.current_grade).letter,
            getSize: (f) => (resolveGradeStyle(f.properties.current_grade).letter.length > 1 ? Math.round(letterPx * 0.74) : letterPx),
            getColor: (f) => resolveGradeStyle(f.properties.current_grade).letterColor,
            getPixelOffset: [0, 0.5],
            fontFamily: font,
            fontWeight: 700,
            getTextAnchor: "middle",
            getAlignmentBaseline: "center",
            pickable: false,
          }),
        });
      }

      // Corner badges, one per school, upper-right of the pin. Precedence: a
      // School of Hope designation (see data/derive/sohSites.ts) over the
      // co-location flag, since a KIPP or Hope marker already owns that corner.
      //   star            Mater (and any non-KIPP operator) plus Success Academy
      //                   approved co-location hosts.
      //   kipp-current    a solid gold disc: a current KIPP Miami campus.
      //   kipp-requested  an open gold ring: a KIPP requested district building.
      //   coloc           a teal disc: a co-location candidate (the same set the
      //                   filter, dock, list, and inspector use). Sparse views
      //                   only; in the dense field it would just add noise.
      // Drawn from the rendered feats, so a badge hides with its school.
      const badgeFeats: Array<{ f: SchoolFeature; badge: MarkerBadge }> = [];
      for (const f of feats) {
        const m = sohMarker(f.properties.name, f.properties.msid);
        if (m) badgeFeats.push({ f, badge: m });
        else if (rich && ctx.coLocationMsids.has(f.properties.msid) && !hasKippMarker(f.properties.name, f.properties.msid)) {
          badgeFeats.push({ f, badge: "coloc" });
        }
      }
      if (badgeFeats.length) {
        // Tucked onto the shoulder of the pin (about 45 degrees), not floating off
        // its bounding-box corner.
        const corner = Math.round((RING_PX / 2) * 0.82);
        const badgePx = rich ? 17 : 12;
        built.push({
          z: 105,
          layer: new IconLayer<{ f: SchoolFeature; badge: MarkerBadge }>({
            id: "school_badges",
            data: badgeFeats,
            getIcon: (d) => iconForBadge(d.badge),
            getPosition: (d) => pos(d.f),
            sizeUnits: "pixels",
            getSize: (d) => (d.badge === "star" ? badgePx + 3 : badgePx),
            getPixelOffset: (d) => {
              const lift = isFocused(d.f.properties.msid) ? 2 : 0;
              return [corner + lift, -(corner + lift)];
            },
            pickable: false,
            updateTriggers: { getPixelOffset: [selectedSchoolMsid, comparePinnedMsids, corner] },
          }),
        });
      }

      // Name labels, placed by priority with collision avoidance (labelPlacement.ts):
      // never two labels on top of each other, never a label over another
      // school's marker. Two sources: the "school_labels" layer (every school in
      // view once the view is legible), plus always the focused schools.
      const labelsOn = has("school_labels");
      const labelsLegible = labelsOn && (mapZoom >= 12 || inViewFeatures.length <= 80);
      const inBox = (f: SchoolFeature) => {
        if (!mapBounds) return true;
        const [lng, lat] = f.geometry.coordinates as [number, number];
        return lng >= mapBounds.west && lng <= mapBounds.east && lat >= mapBounds.south && lat <= mapBounds.north;
      };
      const onScreen = feats.filter(inBox);
      const labelSource = labelsLegible ? onScreen : focusFeats.filter((f) => isFocused(f.properties.msid));
      if (labelSource.length) {
        const priorityOf = (msid: string) => {
          if (msid === selectedSchoolMsid) return 1000;
          if (comparePinnedMsids.includes(msid)) return 900;
          if (isPicked(msid)) return 800;
          if (ctx.plp.has(msid)) return 50;
          if (ctx.coLocationMsids.has(msid)) return 40;
          return 0;
        };
        const placed = placeLabels(
          labelSource.map((f) => {
            const [lng, lat] = f.geometry.coordinates as [number, number];
            const focused = isFocused(f.properties.msid) || isPicked(f.properties.msid);
            return { id: f.properties.msid, lng, lat, text: f.properties.name, priority: priorityOf(f.properties.msid), markerRadius: (focused ? FOCUS_PX : RING_PX) / 2 };
          }),
          onScreen.map((f) => {
            const [lng, lat] = f.geometry.coordinates as [number, number];
            return { id: f.properties.msid, lng, lat, radius: markerRadius };
          }),
          mapZoom,
          (t) => measureLabel(t, font),
        );
        if (placed.length) {
          const isSel = (d: PlacedLabel) => d.id === selectedSchoolMsid;
          built.push({
            z: 102,
            layer: new TextLayer<PlacedLabel>({
              id: "school_name_labels",
              data: placed,
              getPosition: (d) => d.position,
              getText: (d) => d.text,
              getTextAnchor: (d) => d.textAnchor,
              getAlignmentBaseline: (d) => d.baseline,
              getPixelOffset: (d) => d.pixelOffset,
              characterSet: "auto",
              getSize: 12,
              fontFamily: font,
              fontWeight: 500,
              // Carbon tooltip anatomy: Gray 100 text on a white layer with a
              // Gray 30 hairline and a 2px radius. The selected school inverts to
              // the brand interactive color so it reads as the active one.
              getColor: (d) => (isSel(d) ? [255, 255, 255, 255] : [22, 22, 22, 255]),
              background: true,
              getBackgroundColor: (d) => (isSel(d) ? SELECTED : [255, 255, 255, 242]),
              getBorderColor: (d) => (isSel(d) ? SELECTED : [198, 198, 198, 255]),
              getBorderWidth: 1,
              backgroundBorderRadius: 2,
              backgroundPadding: [LABEL_PAD_X, LABEL_PAD_Y],
              pickable: false,
              updateTriggers: { getColor: [selectedSchoolMsid], getBackgroundColor: [selectedSchoolMsid], getBorderColor: [selectedSchoolMsid] },
            }),
          });
        }
      }

      // Shortlist badges: a small numbered chip on each pinned site, in the same
      // 1..N order as the shortlist tray cards, so the operator's shortlist is
      // legible IN PLACE on the map, not only in the tray. Drawn above everything.
      if (comparePinnedMsids.length) {
        const order = new Map(comparePinnedMsids.map((m, i) => [m, i + 1]));
        const numberFeats = feats.filter((f) => order.has(f.properties.msid));
        if (numberFeats.length) {
          const corner = FOCUS_PX / 2 - 1;
          built.push({
            z: 106,
            layer: new TextLayer<SchoolFeature>({
              id: "school_shortlist_badge",
              data: numberFeats,
              getPosition: pos,
              getText: (f) => String(order.get(f.properties.msid)),
              characterSet: ["1", "2", "3", "4"],
              getSize: 11,
              getColor: [255, 255, 255, 255],
              getPixelOffset: [-corner, -corner], // upper-left corner of the pin
              fontFamily: font,
              fontWeight: 700,
              getTextAnchor: "middle",
              getAlignmentBaseline: "center",
              background: true,
              getBackgroundColor: PINNED,
              getBorderColor: [255, 255, 255, 255],
              getBorderWidth: 1.5,
              backgroundBorderRadius: 8,
              backgroundPadding: [5, 3],
              updateTriggers: { getText: [comparePinnedMsids], getPosition: [comparePinnedMsids] },
              pickable: false,
            }),
          });
        }
      }
    }

    // Committed radius-area filter: the exact geodesic disk (from the radius
    // tool's "Filter to this area"), drawn as a finely sampled ring so the outline
    // the user sees coincides with the distance test that filters the schools.
    // A bright cased outline reads clearly over a busy map. Persists until removed.
    // Suppressed while the radius tool is open, since the live radius ring below is
    // the same circle and would otherwise double the outline.
    if (drawnCircle && activeTool !== "radius") {
      const ring = geodesicBufferMiles([drawnCircle.center.lng, drawnCircle.center.lat], drawnCircle.radiusMiles, 256);
      const poly = { type: "FeatureCollection", features: [ring] } as GeoJSON.FeatureCollection;
      built.push({
        z: 879.8,
        layer: new GeoJsonLayer({ id: "drawn_boundary_casing", data: poly, stroked: true, filled: false, getLineColor: [255, 255, 255, 220], getLineWidth: 6, lineWidthUnits: "pixels" }),
      });
      built.push({
        z: 880,
        layer: new GeoJsonLayer({ id: "drawn_boundary", data: poly, stroked: true, filled: true, getFillColor: [37, 99, 235, 20], getLineColor: [37, 99, 235, 245], getLineWidth: 2.5, lineWidthUnits: "pixels" }),
      });
    }

    // Radius ring: a true geodesic buffer, not a pixel circle. Sampled finely so
    // the ring the analyst sees is the same disk the distance filter tests.
    if (radiusCenter) {
      const ring = geodesicBufferMiles([radiusCenter.lng, radiusCenter.lat], radiusMiles, 256);
      built.push({
        z: 900,
        layer: new GeoJsonLayer({
          id: "radius_ring",
          data: { type: "FeatureCollection", features: [ring] } as GeoJSON.FeatureCollection,
          stroked: true,
          filled: true,
          getFillColor: [37, 99, 235, 25],
          getLineColor: [37, 99, 235, 220],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
        }),
      });
      built.push({
        z: 901,
        layer: new ScatterplotLayer({
          id: "radius_center",
          data: [radiusCenter],
          getPosition: (p: { lng: number; lat: number }) => [p.lng, p.lat],
          getRadius: 5,
          radiusUnits: "pixels",
          getFillColor: [37, 99, 235, 255],
          stroked: true,
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
        }),
      });
    }

    // Measure path
    if (measurePoints.length >= 2) {
      const path: [number, number][] = measurePoints.map((p) => [p.lng, p.lat]);
      built.push({
        z: 910,
        layer: new PathLayer<{ path: [number, number][] }>({
          id: "measure_path",
          data: [{ path }],
          getPath: (d) => d.path,
          getColor: [17, 17, 17, 230],
          getWidth: 2,
          widthUnits: "pixels",
        }),
      });
    }
    if (measurePoints.length >= 1) {
      built.push({
        z: 911,
        layer: new ScatterplotLayer({
          id: "measure_points",
          data: measurePoints,
          getPosition: (p: { lng: number; lat: number }) => [p.lng, p.lat],
          getRadius: 4,
          radiusUnits: "pixels",
          getFillColor: [17, 17, 17, 255],
          stroked: true,
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
        }),
      });
    }

    return built.sort((a, b) => a.z - b.z).map((b) => b.layer);
  }, [activeLayerIds, income, driveEntry, boardDistricts, populationGrowth, opportunityZones, legislative, feats, ctx, selectedSchoolMsid, comparePinnedMsids, pickedMsids, isolatePicked, selectSchool, radiusCenter, radiusMiles, measurePoints, drawnCircle, mapZoom, mapBounds, activeTool, onSchoolHover, inViewFeatures, font, plpArea]);
}

// PLP anchor centers among all loaded schools, restricted to the selected
// counties, for the 5-mile radius layer.
function plpAnchorCenters(
  allFeats: SchoolFeature[],
  plp: Set<string>,
  counties: Set<string>,
): Array<{ msid: string; lng: number; lat: number; name: string }> {
  const out: Array<{ msid: string; lng: number; lat: number; name: string }> = [];
  for (const f of allFeats) {
    const p = f.properties;
    if (!plp.has(p.msid)) continue;
    if (!counties.has(p.county)) continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    out.push({ msid: p.msid, lng, lat, name: p.name });
  }
  return out;
}
