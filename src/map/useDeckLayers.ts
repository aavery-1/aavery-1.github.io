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
import { useStore, utilizationStyle, isUnderutilizedFacility, type UtilKey } from "../store";
import type { MapBounds } from "../store";
import { useData } from "../data/DataContext";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { resolveGradeStyle } from "./gradeEncoding";
import { matchHopeOperator } from "../data/derive/hopeOperators";
import { iconForShape, shapeForType } from "./markerShapes";
import { geodesicBufferMiles } from "../geo/buffer";
import type { SchoolFeature, LegislativeProps, SchoolOfHopeProps } from "../data/types";
import type { Feature, Point } from "geojson";

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
  // The statutory Facility Utilization Rate (COFTE / permanent stations) from the
  // shared utilizationStyle helper, so the tooltip agrees with the inspector, the
  // dock, and the list. `utilPct` is that rate; when no COFTE is reported it falls
  // back to an enrollment proxy, flagged by `utilBasis === "enrollment"`. We show
  // the rate only (not a raw enrollment/stations pair) so nothing on the tooltip
  // divides to a second, contradicting percentage.
  utilPct: number | null;
  utilKey: UtilKey;                 // under | inuse | full | unknown (statutory tiers)
  utilBasis: "cofte" | "enrollment" | "none";
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
}

export interface SohHoverInfo {
  x: number;
  y: number;
  // "loanfund" = a site from the Revolving Loan Fund ledger; "operator" = a
  // school in the main dataset run by a state-designated hope operator.
  kind: "loanfund" | "operator";
  operator: string;
  address: string;
  amount: number;
  date: string;
  note: string;
  // Set for operator schools: the school's own name (the ledger sites have none).
  schoolName?: string;
}

type SohFeature = Feature<Point, SchoolOfHopeProps>;

// A unified star datum: either a loan-fund ledger site or a designated-operator
// school. Both draw the same amber star; the hover card tells them apart.
type StarDatum = {
  position: [number, number];
  kind: "loanfund" | "operator";
  operator: string;
  address: string;
  amount: number;
  date: string;
  note: string;
  schoolName?: string;
};

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
      fontFamily: "system-ui, sans-serif",
      fontWeight: 700,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      background: true,
      getBackgroundColor: [255, 255, 255, 235],
      getBorderColor: [color[0], color[1], color[2], 235],
      getBorderWidth: 1,
      backgroundPadding: [5, 3],
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
        offsetY,
      ),
    );
  }
  return layers;
}

export function useDeckLayers(
  onSchoolHover?: (info: SchoolHoverInfo | null) => void,
  onSohHover?: (info: SohHoverInfo | null) => void,
): Layer[] {
  const activeLayerIds = useStore((s) => s.activeLayerIds);
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  const comparePinnedMsids = useStore((s) => s.comparePinnedMsids);
  const selectSchool = useStore((s) => s.selectSchool);
  const radiusCenter = useStore((s) => s.radiusCenter);
  const radiusMiles = useStore((s) => s.radiusMiles);
  const measurePoints = useStore((s) => s.measurePoints);
  const drawnBoundary = useStore((s) => s.drawnBoundary);
  const countySelection = useStore((s) => s.countySelection);
  const mapZoom = useStore((s) => s.mapZoom);
  const mapBounds = useStore((s) => s.mapBounds);
  const activeTool = useStore((s) => s.activeTool);
  const { income, boardDistricts, isochrones, populationGrowth, opportunityZones, legislative, schoolsOfHope } = useData();
  const { features: filteredFeats, all, ctx } = useFilteredSchools();

  // The selected school (from search, the list, or the dock) and any
  // compare-pinned schools must always be visible on the map, even when the
  // active filters would otherwise hide them: a search result that flies to a
  // location with zero rendered pins looks broken, and the marker layer
  // already colors these schools distinctly (isFocused below) whether or not
  // this augmentation is needed. This is map-rendering-only: the shared
  // useFilteredSchools() feed (and every count/list derived from it) is
  // untouched, so a filtered-out searched school never inflates "N schools".
  const feats = useMemo(() => {
    const focusMsids = [selectedSchoolMsid, ...comparePinnedMsids].filter((m): m is string => Boolean(m));
    if (focusMsids.length === 0) return filteredFeats;
    const inFeats = new Set(filteredFeats.map((f) => f.properties.msid));
    const missing = focusMsids
      .filter((msid) => !inFeats.has(msid))
      .map((msid) => all.find((f) => f.properties.msid === msid))
      .filter((f): f is SchoolFeature => Boolean(f));
    return missing.length ? [...filteredFeats, ...missing] : filteredFeats;
  }, [filteredFeats, all, selectedSchoolMsid, comparePinnedMsids]);

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

    // Drive-time reach (isochrone)
    if (has("drive_time_reach") && isochrones) {
      const cfg = layerById("drive_time_reach")!;
      const [fr, fg, fb] = hexToRgb(cfg.style.fillColor ?? "#0D9488");
      built.push({
        z: 40,
        layer: new GeoJsonLayer({
          id: "drive_time_reach",
          data: isochrones as unknown as GeoJSON.FeatureCollection,
          stroked: true,
          filled: true,
          getFillColor: [fr, fg, fb, Math.round((cfg.style.fillOpacity ?? 0.15) * 255)],
          getLineColor: [fr, fg, fb, 255],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
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
      if (has("congressional_districts")) built.push(...chamberLayer("congressional_districts", "CD", legFeatures, hexToRgb("#512DA8"), 2.5, 34, legLabelsLegible, mapBounds, -14));
      if (has("state_senate_districts")) built.push(...chamberLayer("state_senate_districts", "SLDU", legFeatures, hexToRgb("#7E57C2"), 1.75, 35, legLabelsLegible, mapBounds, 0));
      if (has("state_house_districts")) built.push(...chamberLayer("state_house_districts", "SLDL", legFeatures, hexToRgb("#B39DDB"), 1.25, 33, legLabelsLegible, mapBounds, 14));
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
          28,
        ),
      );
    }

    // 5-mile SoH radius around each PLP anchor in the selected counties. This is
    // a visual overlay: it reflects ALL PLP anchors in-geography, independent of
    // the school-level filters (grade, type, utilization), per the brief.
    if (has("plp_radius")) {
      const centers = plpAnchorCenters(all, ctx.plp, countySelection);
      if (centers.length) {
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
        built.push({
          z: 5,
          layer: new GeoJsonLayer({
            id: "plp_radius",
            data: { type: "FeatureCollection", features: [merged] } as GeoJSON.FeatureCollection,
            stroked: true,
            filled: true,
            getFillColor: [211, 47, 47, 16],
            getLineColor: [211, 47, 47, 120],
            getLineWidth: 1.25,
            lineWidthUnits: "pixels",
          }),
        });
      }
    }

    // School markers: SHAPE encodes operator type, COLOR encodes grade, and the
    // grade letter sits inside. Two icon copies (a larger outline behind a
    // smaller fill) give the pin a grade-stroke edge; the shared white shape mask
    // is tinted per grade so shape and color read independently.
    if (has("school_locations")) {
      // Marker treatment is tiered by on-screen DENSITY, not just zoom (Mapbox's
      // "density" + "legibility" principles). Every marker carries the type SHAPE
      // (circle=District, square=Charter, diamond=Magnet, triangle=Virtual,
      // hexagon=Alternative) colored by grade, with a white halo, so school type
      // is readable at any density. A dense view stops there: a calm field of
      // haloed shapes, no letters competing. A sparse view (a filtered set or a
      // zoomed-in neighborhood) adds the grade LETTER, a focus ring, and the
      // co-location dot. Detail appears exactly where it is legible.
      const RICH_MAX = 140; // above this many on-screen markers, labels turn to clutter
      const rich = feats.length <= RICH_MAX;

      const SELECTED_BLUE: [number, number, number, number] = [37, 99, 235, 255];
      const PINNED_BLACK: [number, number, number, number] = [17, 17, 17, 255];
      const HALO_WHITE: [number, number, number, number] = [255, 255, 255, 255];
      const isFocused = (msid: string) => msid === selectedSchoolMsid || comparePinnedMsids.includes(msid);

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
            x: info.x, y: info.y, name: p.name, grade: p.current_grade, type: p.type, level: p.level,
            utilPct: us.pct, utilKey: us.key, utilBasis: us.basis, underutilized,
            sohEligible: ctx.sohEligibleMsids.has(p.msid), isPlp: ctx.plp.has(p.msid),
            coLocationEligible: coLoc,
            coLocInOZ: reason?.inOpportunityZone ?? false,
            coLocNearestPlp: reason?.nearestPlp ?? null,
            coLocIsPlpAnchor: reason?.isPlpAnchor ?? false,
          });
        } else {
          onSchoolHover(null);
        }
      };

      if (!rich) {
        // DOT FIELD: a white halo ring behind a grade-colored fill dot, so dots
        // separate cleanly from neighbors and from the light base. Small and calm.
        const DOT_PX = Math.round(Math.max(7, Math.min(13, mapZoom)));
        built.push({
          z: 99,
          layer: new IconLayer<SchoolFeature>({
            id: "school_dot_halo",
            data: feats,
            getIcon: (f) => iconForShape(shapeForType(f.properties.type)),
            getPosition: (f) => f.geometry.coordinates as [number, number],
            sizeUnits: "pixels",
            getSize: (f) => (isFocused(f.properties.msid) ? DOT_PX + 6 : DOT_PX + 3),
            getColor: (f) => {
              const msid = f.properties.msid;
              if (msid === selectedSchoolMsid) return SELECTED_BLUE;
              if (comparePinnedMsids.includes(msid)) return PINNED_BLACK;
              return HALO_WHITE;
            },
            pickable: false,
            updateTriggers: { getColor: [selectedSchoolMsid, comparePinnedMsids], getSize: [selectedSchoolMsid, comparePinnedMsids, DOT_PX] },
          }),
        });
        built.push({
          z: 100,
          layer: new IconLayer<SchoolFeature>({
            id: "school_locations",
            data: feats,
            pickable: activeTool === "none",
            getIcon: (f) => iconForShape(shapeForType(f.properties.type)),
            getPosition: (f) => f.geometry.coordinates as [number, number],
            sizeUnits: "pixels",
            getSize: DOT_PX,
            getColor: (f) => resolveGradeStyle(f.properties.current_grade).fill,
            onClick: onMarkerClick,
            onHover: onMarkerHover,
          }),
        });
      } else {
        // RICH MARKERS: type shape + grade letter + focus ring, sized generously
        // because the view is sparse enough to carry them.
        const FILL_PX = Math.max(13, Math.min(26, 13 + (mapZoom - 9) * ((26 - 13) / (14 - 9))));
        const STROKE_PX = FILL_PX + 4;
        const iconFor = (f: SchoolFeature) => iconForShape(shapeForType(f.properties.type));

        // Outline copy (drawn first, slightly larger) = grade-stroke edge / focus ring.
        built.push({
          z: 99,
          layer: new IconLayer<SchoolFeature>({
            id: "school_outline",
            data: feats,
            getIcon: iconFor,
            getPosition: (f) => f.geometry.coordinates as [number, number],
            sizeUnits: "pixels",
            getSize: (f) => (isFocused(f.properties.msid) ? STROKE_PX + 4 : STROKE_PX),
            getColor: (f) => {
              const msid = f.properties.msid;
              if (msid === selectedSchoolMsid) return SELECTED_BLUE;
              if (comparePinnedMsids.includes(msid)) return PINNED_BLACK;
              return resolveGradeStyle(f.properties.current_grade).stroke;
            },
            pickable: false,
            updateTriggers: {
              getColor: [selectedSchoolMsid, comparePinnedMsids],
              getSize: [selectedSchoolMsid, comparePinnedMsids, STROKE_PX],
            },
          }),
        });

        // Fill copy (on top of the outline). This layer owns click + hover.
        built.push({
          z: 100,
          layer: new IconLayer<SchoolFeature>({
            id: "school_locations",
            data: feats,
            pickable: activeTool === "none",
            getIcon: iconFor,
            getPosition: (f) => f.geometry.coordinates as [number, number],
            sizeUnits: "pixels",
            getSize: FILL_PX,
            getColor: (f) => resolveGradeStyle(f.properties.current_grade).fill,
            onClick: onMarkerClick,
            onHover: onMarkerHover,
          }),
        });

        // Grade letter inside every marker (the encoding of record).
        built.push({
          z: 101,
          layer: new TextLayer({
            id: "school_letters",
            data: feats,
            getPosition: (f: SchoolFeature) => f.geometry.coordinates as [number, number],
            getText: (f: SchoolFeature) => resolveGradeStyle(f.properties.current_grade).letter,
            getSize: Math.max(9, Math.round(FILL_PX * 0.5)),
            getColor: (f: SchoolFeature) => resolveGradeStyle(f.properties.current_grade).letterColor,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            getTextAnchor: "middle",
            getAlignmentBaseline: "center",
            pickable: false,
          }),
        });
      }

      // Co-location channel: flag the buildings where occupancy legally matters
      // (a DISTRICT facility that is underused per Rule 6A-1.0998271(5)(e) AND in
      // a School of Hope siting area) with a small teal corner DOT rather than a
      // text badge, so the county view stays a clean grade read. Same set the
      // filter, dock count, list, and inspector use (ctx.coLocationMsids), so the
      // dot never disagrees with them. The exact rate lives in the hover card and
      // inspector. Shown once the view is legible (zoomed in or a small set).
      // Teal co-location dots ride the rich markers only; in the dot field every
      // school is already a bare dot, so a second dot would just add noise.
      if (rich) {
        const coLocFeats = feats.filter((f) => ctx.coLocationMsids.has(f.properties.msid));
        if (coLocFeats.length) {
          const dotOffset: [number, number] = [11, -11]; // upper-right of the pin
          const dotPos = (f: SchoolFeature) => f.geometry.coordinates as [number, number];
          // White halo behind the teal dot so it stays legible over imagery.
          built.push({
            z: 103,
            layer: new TextLayer({
              id: "school_colocation_dot_halo",
              data: coLocFeats,
              getPosition: dotPos,
              getText: () => "●",
              // The dot glyph is outside deck's default ASCII atlas, so it must
              // be declared or nothing renders.
              characterSet: ["●"],
              getSize: 15,
              getColor: [255, 255, 255, 255],
              getPixelOffset: dotOffset,
              fontFamily: "system-ui, sans-serif",
              fontWeight: 700,
              getTextAnchor: "middle",
              getAlignmentBaseline: "center",
              pickable: false,
            }),
          });
          built.push({
            z: 104,
            layer: new TextLayer({
              id: "school_colocation_dot",
              data: coLocFeats,
              getPosition: dotPos,
              getText: () => "●",
              characterSet: ["●"],
              getSize: 11,
              getColor: [13, 148, 136, 255], // Teal 600: a co-location candidate
              getPixelOffset: dotOffset,
              fontFamily: "system-ui, sans-serif",
              fontWeight: 700,
              getTextAnchor: "middle",
              getAlignmentBaseline: "center",
              pickable: false,
            }),
          });
        }
      }

      // Name labels. Two sources: the dedicated "school_labels" layer (all
      // visible schools, but only when the view is legible, i.e. zoomed in or a
      // small filtered set), plus always the focused schools (selected/pinned).
      const focusMsids = new Set([selectedSchoolMsid, ...comparePinnedMsids].filter(Boolean) as string[]);
      const labelsOn = has("school_labels");
      const labelsLegible = labelsOn && (mapZoom >= 13 || feats.length <= 60);
      const labelFeats = labelsLegible
        ? feats
        : feats.filter((f) => focusMsids.has(f.properties.msid));
      if (labelFeats.length) {
        built.push({
          z: 102,
          layer: new TextLayer({
            id: "school_name_labels",
            data: labelFeats,
            getPosition: (f: SchoolFeature) => f.geometry.coordinates as [number, number],
            getText: (f: SchoolFeature) => f.properties.name,
            getSize: 11,
            getColor: [17, 17, 17, 255],
            fontFamily: "system-ui, sans-serif",
            fontWeight: 600,
            getTextAnchor: "middle",
            getAlignmentBaseline: "bottom",
            getPixelOffset: [0, -18],
            background: true,
            getBackgroundColor: [255, 255, 255, 235],
            backgroundPadding: [5, 3],
            pickable: false,
          }),
        });
      }

      // Shortlist badges: a small numbered chip on each pinned site, in the same
      // 1..N order as the shortlist tray cards, so the operator's shortlist is
      // legible IN PLACE on the map, not only in the tray. Drawn above everything.
      if (comparePinnedMsids.length) {
        const order = new Map(comparePinnedMsids.map((m, i) => [m, i + 1]));
        const badgeFeats = feats.filter((f) => order.has(f.properties.msid));
        if (badgeFeats.length) {
          built.push({
            z: 106,
            layer: new TextLayer<SchoolFeature>({
              id: "school_shortlist_badge",
              data: badgeFeats,
              getPosition: (f) => f.geometry.coordinates as [number, number],
              getText: (f) => String(order.get(f.properties.msid)),
              characterSet: ["1", "2", "3", "4"],
              getSize: 12,
              getColor: [255, 255, 255, 255],
              getPixelOffset: [-13, -13], // upper-left corner of the pin
              fontFamily: "system-ui, sans-serif",
              fontWeight: 700,
              getTextAnchor: "middle",
              getAlignmentBaseline: "center",
              background: true,
              getBackgroundColor: [17, 17, 17, 255], // matches PINNED_BLACK
              backgroundPadding: [5, 4],
              updateTriggers: { getText: [comparePinnedMsids], getPosition: [comparePinnedMsids] },
              pickable: false,
            }),
          });
        }
      }
    }

    // Schools of Hope star overlay. Two sources, one gold-star treatment, shown
    // regardless of the school-level filters (a fixed reference overlay):
    //   1. Revolving Loan Fund ledger sites (F.S. 1001.292), scoped to the
    //      tri-county geography so a star in Tampa/Jacksonville does not read as
    //      noise on a Miami-Dade / Broward / Orange map.
    //   2. Every loaded school run by a state-designated hope operator
    //      (s. 1002.333(2); Mater, KIPP, IDEA, RCMA, Success, Renaissance/
    //      Warrington). A school of hope IS a charter run by such an operator, so
    //      the brief stars all of their schools. See data/derive/hopeOperators.ts.
    if (has("existing_soh")) {
      const stars: StarDatum[] = [];
      if (schoolsOfHope) {
        for (const f of (schoolsOfHope.features as SohFeature[])) {
          if (f.properties.county == null) continue; // out of the pilot counties
          const p = f.properties;
          stars.push({
            position: f.geometry.coordinates as [number, number],
            kind: "loanfund", operator: p.operator, address: p.address,
            amount: p.amount, date: p.date, note: p.note,
          });
        }
      }
      // Designated-operator schools come from the FULL loaded set (unfiltered), so
      // toggling grade/type filters never hides the reference stars.
      for (const f of all) {
        const op = matchHopeOperator(f.properties.name);
        if (!op) continue;
        stars.push({
          position: f.geometry.coordinates as [number, number],
          kind: "operator", operator: op, address: f.properties.address ?? "",
          amount: 0, date: "", note: "", schoolName: f.properties.name,
        });
      }
      if (stars.length) {
        built.push({
          z: 200,
          layer: new ScatterplotLayer<StarDatum>({
            id: "existing_soh",
            data: stars,
            pickable: activeTool === "none",
            stroked: true,
            filled: true,
            radiusUnits: "pixels",
            radiusMinPixels: 7,
            getPosition: (d) => d.position,
            getRadius: 10,
            getFillColor: [245, 158, 11, 255], // Amber 500
            getLineColor: [255, 255, 255, 255],
            getLineWidth: 2,
            lineWidthUnits: "pixels",
            onClick: () => true,
            onHover: (info: { object?: StarDatum; x: number; y: number }) => {
              if (!onSohHover) return;
              if (info.object) {
                const d = info.object;
                onSohHover({ x: info.x, y: info.y, kind: d.kind, operator: d.operator, address: d.address, amount: d.amount, date: d.date, note: d.note, schoolName: d.schoolName });
              } else {
                onSohHover(null);
              }
            },
          }),
        });
        built.push({
          z: 201,
          layer: new TextLayer<StarDatum>({
            id: "existing_soh_star",
            data: stars,
            characterSet: ["★"],
            getPosition: (d) => d.position,
            getText: () => "★",
            getSize: 11,
            getColor: [124, 45, 18, 255], // Amber 900-ish for contrast on gold
            fontFamily: "system-ui, sans-serif",
            getTextAnchor: "middle",
            getAlignmentBaseline: "center",
            pickable: false,
          }),
        });
      }
    }

    // Committed map-area filter: a filled circle (from the radius tool's "Filter
    // to this area") with a bright cased outline so the selected area reads
    // clearly over a busy map. Persists until removed. Suppressed while the
    // radius tool is open, since the live radius ring below is the same circle
    // and would otherwise double the outline.
    if (drawnBoundary && drawnBoundary.length >= 3 && activeTool !== "radius") {
      const ring: [number, number][] = drawnBoundary.map((p) => [p.lng, p.lat]);
      ring.push(ring[0]);
      const poly = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] } as GeoJSON.FeatureCollection;
      built.push({
        z: 879.8,
        layer: new GeoJsonLayer({ id: "drawn_boundary_casing", data: poly, stroked: true, filled: false, getLineColor: [255, 255, 255, 220], getLineWidth: 6, lineWidthUnits: "pixels" }),
      });
      built.push({
        z: 880,
        layer: new GeoJsonLayer({ id: "drawn_boundary", data: poly, stroked: true, filled: true, getFillColor: [37, 99, 235, 20], getLineColor: [37, 99, 235, 245], getLineWidth: 2.5, lineWidthUnits: "pixels" }),
      });
    }

    // Radius ring: a true geodesic buffer, not a pixel circle.
    if (radiusCenter) {
      const ring = geodesicBufferMiles([radiusCenter.lng, radiusCenter.lat], radiusMiles);
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
  }, [activeLayerIds, income, isochrones, boardDistricts, populationGrowth, opportunityZones, legislative, schoolsOfHope, feats, all, ctx, selectedSchoolMsid, comparePinnedMsids, selectSchool, radiusCenter, radiusMiles, measurePoints, drawnBoundary, countySelection, mapZoom, mapBounds, activeTool, onSchoolHover, onSohHover]);
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
