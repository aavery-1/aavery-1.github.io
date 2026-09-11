// Global UI state (Zustand). Small enough to avoid Redux ceremony, predictable
// enough to reason about. Loaded data does NOT live here (it lives in the data
// loading hook); this store holds only UI intent. See 06_ARCHITECTURE.md.
//
// The filter model has three primary dimensions, matching the redesigned left
// panel: GEOGRAPHY (which counties), MAP LAYERS (visual overlays), and SCHOOLS
// (which schools are drawn). Every surface that renders "the schools currently
// in scope" reads the same slice through src/data/derive/filters.ts, so the map,
// the school list, and the summary callouts can never disagree.

import { create } from "zustand";
import { DEFAULT_ACTIVE_LAYER_IDS, EXCLUSIVE_CHOROPLETH_IDS } from "./config/mapLayers";
import type { CountyName, SchoolLevel, SchoolType, TitleIState } from "./data/types";
import type { DistrictKind } from "./data/derive/districts";

// A single active district filter: one district of one kind (board / CD / SLDU /
// SLDL). null = no district constraint. `value` is the opaque key the
// district-tagging module produces (board keys are county-qualified).
export interface DistrictFilter {
  kind: DistrictKind;
  value: string;
}
import type { Grade } from "./map/gradeEncoding";

export interface LatLng {
  lat: number;
  lng: number;
}

// Current map viewport in geographic coordinates. Used to answer "which schools
// are in view" (the dock list and map summary), distinct from which schools pass
// the filters. null before the map reports its first bounds.
export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type ActiveTool = "none" | "measure" | "radius";

// Google base imagery. "satellite" maps to hybrid (imagery plus labels) in the
// map view so street and place names stay readable over the imagery.
export type BaseMapType = "roadmap" | "satellite" | "terrain";

// Google overlay layers, each independent of the base type and of each other.
export interface MapOverlays {
  traffic: boolean;
  transit: boolean;
  bicycling: boolean;
}

export const ALL_COUNTIES: CountyName[] = ["Miami-Dade", "Broward", "Orange"];

// The two primary views, surfaced as one switcher in the app bar:
//   "map"     - the primary console (map plus a compact "schools in view" dock),
//   "list"    - the full-width analytical school table.
// Map answers WHERE, List answers WHICH. "Which of these few" is no longer a
// third full-screen view: a scouting operator lives on the map, so the pinned
// sites are a SHORTLIST that rides the map (a collapsible bottom tray plus
// numbered markers in place), never a separate destination. See shortlistOpen
// and the comparePinnedMsids set (kept for continuity, incl. the URL "cmp" key).
export type ViewMode = "map" | "list";

// The List view can show every filtered school or just those in the current map
// bounds (the set the map dock hands off). See listScope.
export type ListScope = "all" | "inView";

// Facility utilization = enrollment / capacity, expressed as a fraction.
export const UTIL_OVER = 1.0;
// 75% is the statutory "underused" threshold: FL DOE Rule 6A-1.0998271(5)(e)
// deems a facility usable by a School of Hope when its Facility Utilization Rate
// (COFTE enrollment / student stations) is no more than 75 percent, OR it has a
// surplus of at least 400 student stations. We encode "under" (slack capacity /
// co-location signal) at that same 75% line so the map matches the rule.
export const UTIL_UNDER = 0.75;
export const SOH_SURPLUS_STATIONS = 400;

export function utilizationBucket(enrollment: number | null, capacity: number | null): "over" | "target" | "under" | "unknown" {
  if (enrollment == null || capacity == null || capacity === 0) return "unknown";
  const r = enrollment / capacity;
  if (r > UTIL_OVER) return "over";
  if (r < UTIL_UNDER) return "under";
  return "target";
}

// A facility is "underused" for Schools of Hope purposes when its utilization is
// at or below 75% OR it carries a surplus of at least 400 student stations
// (Rule 6A-1.0998271(5)(e)). This is the OR-composed statutory test, distinct
// from the visual bucket above: a very large school above 75% can still qualify
// on the 400-station surplus alone.
// Underused per Rule 6A-1.0998271(5)(e): FUR <= 75% OR surplus >= 400 student
// stations. The statutory FUR is COFTE / stations, so when the FISH COFTE is
// available we use it (and the FISH surplus); otherwise we fall back to NCES
// membership as a proxy. `surplus` is the FISH "available capacity" when known.
export function isUnderutilizedFacility(
  enrollment: number | null,
  capacity: number | null,
  cofte: number | null = null,
  surplus: number | null = null,
): boolean {
  if (capacity == null || capacity <= 0) return false;
  // A COFTE of 0 (or negative) for a real building is not a credible statutory
  // numerator, it is a missing/mis-parsed FISH value; trusting it would flag a
  // full school as "underused" (and its FISH surplus is derived from the same bad
  // figure). Treat it as absent and fall back to the enrollment proxy.
  if (cofte != null && cofte > 0) {
    const s = surplus != null ? surplus : capacity - cofte;
    return cofte / capacity <= UTIL_UNDER || s >= SOH_SURPLUS_STATIONS;
  }
  if (enrollment == null) return false;
  return enrollment / capacity <= UTIL_UNDER || capacity - enrollment >= SOH_SURPLUS_STATIONS;
}

// "Fully used" per FL DOE Rule 6A-1.0998271(1)(i): a facility using >=90% of its
// student stations. Between the 75% co-location line and here, a facility is in
// active use but not full.
export const UTIL_FULL = 0.9;

export type UtilKey = "under" | "inuse" | "full" | "unknown";

// One legally-meaningful classification of a facility's usage, with a color that
// communicates it. This is the single source for the utilization color scheme so
// the dock donut, the inspector bar, and any key all agree.
//   under  (teal)  = underused: <=75% Facility Utilization Rate OR >=400 surplus
//                    student stations (Rule (5)(e)); a co-location opportunity.
//   inuse  (amber) = between the 75% line and "fully used".
//   full   (red)   = fully used: >=90% of student stations (Rule (1)(i)).
export interface UtilStyle { pct: number | null; key: UtilKey; label: string; color: string; basis: "cofte" | "enrollment" | "none"; }
export const UTIL_COLORS: Record<UtilKey, string> = {
  under: "#0D9488",   // Teal 600 (matches the co-location dot)
  inuse: "#D97706",   // Amber 600
  full: "#DC2626",    // Red 600
  unknown: "#94A3B8", // Slate 400
};
export function utilizationStyle(
  enrollment: number | null,
  capacity: number | null,
  cofte: number | null = null,
  surplus: number | null = null,
): UtilStyle {
  if (capacity == null || capacity <= 0) {
    return { pct: null, key: "unknown", label: "No capacity data", color: UTIL_COLORS.unknown, basis: "none" };
  }
  // Prefer the statutory COFTE-based FUR; fall back to NCES membership. A COFTE
  // of 0 or less is a missing/mis-parsed FISH value, not a real rate, so it is
  // treated as absent (see isUnderutilizedFacility).
  const useCofte = cofte != null && cofte > 0;
  const num = useCofte ? cofte : enrollment;
  if (num == null) {
    return { pct: null, key: "unknown", label: "No capacity data", color: UTIL_COLORS.unknown, basis: "none" };
  }
  const basis: "cofte" | "enrollment" = useCofte ? "cofte" : "enrollment";
  const pct = Math.round((num / capacity) * 100);
  if (isUnderutilizedFacility(enrollment, capacity, cofte, surplus)) return { pct, key: "under", label: "Underused", color: UTIL_COLORS.under, basis };
  if (num / capacity >= UTIL_FULL) return { pct, key: "full", label: "Fully used", color: UTIL_COLORS.full, basis };
  return { pct, key: "inuse", label: "In use", color: UTIL_COLORS.inuse, basis };
}

// For a compact color key in the dock (in legal order).
export const UTIL_LEGEND: Array<{ key: UtilKey; label: string }> = [
  { key: "under", label: "Underused" },
  { key: "inuse", label: "In use" },
  { key: "full", label: "Fully used" },
];

// The facility-use facet in the filter panel: the three statutory tiers as a
// multi-select (OR within the facet), replacing the old continuous range slider.
// A school's tier is utilizationStyle(...).key; "unknown" (no capacity) never
// matches a chosen tier, so selecting any tier excludes capacity-less schools.
export type FacilityUseKey = "under" | "inuse" | "full";
export const FACILITY_USE_TIERS: Array<{ key: FacilityUseKey; label: string; hint: string; color: string }> = [
  { key: "under", label: "Underused", hint: "At or below 75%, or 400+ surplus stations", color: UTIL_COLORS.under },
  { key: "inuse", label: "In use", hint: "Between 75% and 90%", color: UTIL_COLORS.inuse },
  { key: "full", label: "Fully used", hint: "90% or above", color: UTIL_COLORS.full },
];

export interface AppState {
  // ---- Map layers (visual overlays) ----
  activeLayerIds: Set<string>;

  // ---- Geography ----
  countySelection: Set<CountyName>; // which counties are shown; drives the school set

  // ---- School filters (stackable) ----
  gradeSelection: Set<Grade>;   // ratings to show; empty = all
  levelSelection: Set<SchoolLevel>; // grade spans to show; empty = all
  typeSelection: Set<SchoolType>;   // school types to show; empty = all
  titleISelection: Set<TitleIState>; // Title I states to show; empty = all
  plpOnly: boolean;             // show only persistently low-performing schools
  coLocationOnly: boolean;      // show only co-location targets (underused district buildings)
  districtFilter: DistrictFilter | null; // limit to one board/legislative district
  facilityUseSelection: Set<FacilityUseKey>; // utilization tiers to show; empty = all
  // Custom utilization band (enrollment / capacity, %), for precise thresholds the
  // statutory tiers cannot express (e.g. "below 55%"). null bound = open on that end;
  // both null = no constraint. Composes (AND) with everything else.
  utilMin: number | null;
  utilMax: number | null;
  // Custom free/reduced-price lunch band (%), for targeting by student poverty
  // (e.g. "at or above 75%"). Same semantics as the utilization band: null bound
  // = open on that end; both null = no constraint. Composes (AND) with everything.
  frlMin: number | null;
  frlMax: number | null;

  // ---- Selection / tools / view ----
  selectedSchoolMsid: string | null;
  comparePinnedMsids: string[]; // the shortlist, up to 4
  shortlistOpen: boolean;       // whether the map's shortlist tray is expanded
  shortlistFullTableOpen: boolean; // the tray's "Full table" matrix modal
  activeTool: ActiveTool;
  measurePoints: LatLng[];
  radiusCenter: LatLng | null;
  radiusMiles: number;
  // Committed map-area filter: a closed polygon ring (a geodesic circle from the
  // radius tool's "Filter to this area") that limits the school set to points
  // inside it. Session-only (not persisted in the URL). Kept as a generic ring so
  // the filter (pointInPolygon) and rendering stay shape-agnostic.
  drawnBoundary: LatLng[] | null;
  mapCenter: LatLng;
  mapZoom: number;
  mapBounds: MapBounds | null;
  panelCollapsed: boolean;
  // Phone-only: whether the filters drawer is open. Lifted to the store so both
  // the app-bar menu button and the results sheet's Filters entry can open it.
  mobileRailOpen: boolean;
  baseMapType: BaseMapType;
  overlays: MapOverlays;
  viewMode: ViewMode;
  // Row scope for the List view: every filtered school, or only those inside the
  // current map bounds. The map's "schools in view" dock hands off to List by
  // setting this to "inView", so the table shows exactly the on-screen set.
  listScope: ListScope;

  // ---- Actions ----
  toggleLayer: (id: string) => void;
  setActiveLayers: (ids: string[]) => void;

  toggleCounty: (c: CountyName) => void;
  setCounties: (counties: CountyName[]) => void;

  toggleGrade: (g: Grade) => void;
  clearGrades: () => void;
  toggleLevel: (l: SchoolLevel) => void;
  clearLevels: () => void;
  toggleType: (t: SchoolType) => void;
  clearTypes: () => void;
  toggleTitleI: (t: TitleIState) => void;
  clearTitleI: () => void;
  setPlpOnly: (v: boolean) => void;
  setCoLocationOnly: (v: boolean) => void;
  setDistrictFilter: (f: DistrictFilter | null) => void;
  toggleFacilityUse: (k: FacilityUseKey) => void;
  setFacilityUse: (keys: FacilityUseKey[]) => void;
  clearFacilityUse: () => void;
  setUtilRange: (min: number | null, max: number | null) => void;
  setFrlRange: (min: number | null, max: number | null) => void;
  resetSchoolFilters: () => void;
  clearAllFilters: () => void;
  resetAll: () => void;

  setViewMode: (mode: ViewMode) => void;
  setListScope: (scope: ListScope) => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  setMobileRailOpen: (open: boolean) => void;
  setBaseMapType: (type: BaseMapType) => void;
  toggleOverlay: (key: keyof MapOverlays) => void;
  selectSchool: (msid: string | null) => void;
  toggleComparePin: (msid: string) => void;
  clearCompare: () => void;
  setShortlistOpen: (open: boolean) => void;
  setShortlistFullTableOpen: (open: boolean) => void;
  setTool: (tool: ActiveTool) => void;
  addMeasurePoint: (p: LatLng) => void;
  undoMeasurePoint: () => void;
  clearMeasure: () => void;
  setRadius: (center: LatLng | null, miles?: number) => void;
  setRadiusMiles: (miles: number) => void;
  setDrawnBoundary: (ring: LatLng[] | null) => void;
  clearDrawnBoundary: () => void;
  setMapView: (center: LatLng, zoom: number) => void;
  setMapBounds: (bounds: MapBounds) => void;
  hydrate: (partial: Partial<AppState>) => void;
}

const MAX_COMPARE = 4;

// Default view frames all three pilot counties (South + Central Florida). The
// center sits a little south of the geographic midpoint so Miami-Dade and
// Broward (the bulk of the schools) are not hidden behind the bottom callouts.
export const DEFAULT_CENTER: LatLng = { lat: 26.7, lng: -80.85 };
export const DEFAULT_ZOOM = 7;

export const useStore = create<AppState>((set) => ({
  activeLayerIds: new Set(DEFAULT_ACTIVE_LAYER_IDS),
  countySelection: new Set(ALL_COUNTIES),
  gradeSelection: new Set<Grade>(),
  levelSelection: new Set<SchoolLevel>(),
  typeSelection: new Set<SchoolType>(),
  titleISelection: new Set<TitleIState>(),
  plpOnly: false,
  coLocationOnly: false,
  districtFilter: null,
  facilityUseSelection: new Set<FacilityUseKey>(),
  utilMin: null,
  utilMax: null,
  frlMin: null,
  frlMax: null,

  selectedSchoolMsid: null,
  comparePinnedMsids: [],
  shortlistOpen: false,
  shortlistFullTableOpen: false,
  activeTool: "none",
  measurePoints: [],
  radiusCenter: null,
  radiusMiles: 3,
  drawnBoundary: null,
  mapCenter: DEFAULT_CENTER,
  mapZoom: DEFAULT_ZOOM,
  mapBounds: null,
  panelCollapsed: true,
  mobileRailOpen: false,
  baseMapType: "roadmap",
  overlays: { traffic: false, transit: false, bicycling: false },
  viewMode: "map",
  listScope: "all",

  toggleLayer: (id) =>
    set((s) => {
      const next = new Set(s.activeLayerIds);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        // Only one full-area choropleth can be read at a time, so enabling one
        // clears the others in that mutually exclusive group.
        if (EXCLUSIVE_CHOROPLETH_IDS.includes(id)) {
          for (const other of EXCLUSIVE_CHOROPLETH_IDS) if (other !== id) next.delete(other);
        }
      }
      return { activeLayerIds: next };
    }),
  setActiveLayers: (ids) => set({ activeLayerIds: new Set(ids) }),

  toggleCounty: (c) =>
    set((s) => {
      const next = new Set(s.countySelection);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { countySelection: next };
    }),
  setCounties: (counties) => set({ countySelection: new Set(counties) }),

  toggleGrade: (g) =>
    set((s) => {
      const next = new Set(s.gradeSelection);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return { gradeSelection: next };
    }),
  clearGrades: () => set({ gradeSelection: new Set<Grade>() }),
  toggleLevel: (l) =>
    set((s) => {
      const next = new Set(s.levelSelection);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return { levelSelection: next };
    }),
  clearLevels: () => set({ levelSelection: new Set<SchoolLevel>() }),
  toggleType: (t) =>
    set((s) => {
      const next = new Set(s.typeSelection);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return { typeSelection: next };
    }),
  clearTypes: () => set({ typeSelection: new Set<SchoolType>() }),
  toggleTitleI: (t) =>
    set((s) => {
      const next = new Set(s.titleISelection);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return { titleISelection: next };
    }),
  clearTitleI: () => set({ titleISelection: new Set<TitleIState>() }),
  setPlpOnly: (v) => set({ plpOnly: v }),
  setCoLocationOnly: (v) => set({ coLocationOnly: v }),
  setDistrictFilter: (f) => set({ districtFilter: f }),
  toggleFacilityUse: (k) =>
    set((s) => {
      const next = new Set(s.facilityUseSelection);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return { facilityUseSelection: next };
    }),
  setFacilityUse: (keys) => set({ facilityUseSelection: new Set(keys) }),
  clearFacilityUse: () => set({ facilityUseSelection: new Set<FacilityUseKey>() }),
  setUtilRange: (min, max) => set({ utilMin: min, utilMax: max }),
  setFrlRange: (min, max) => set({ frlMin: min, frlMax: max }),

  resetSchoolFilters: () =>
    set({
      gradeSelection: new Set<Grade>(),
      levelSelection: new Set<SchoolLevel>(),
      typeSelection: new Set<SchoolType>(),
      titleISelection: new Set<TitleIState>(),
      plpOnly: false,
      coLocationOnly: false,
      districtFilter: null,
      facilityUseSelection: new Set<FacilityUseKey>(),
      drawnBoundary: null,
    }),

  // Clear every FILTER (geography, all school facets, the district and the
  // drawn map-area filter) back to "show everything", and drop the tool that
  // draws the area circle so no overlay lingers. Map layers are display, not
  // filters, so they are deliberately left untouched: this is what the panel's
  // single "Clear all" runs. resetAll (below) additionally resets layers.
  clearAllFilters: () =>
    set({
      countySelection: new Set(ALL_COUNTIES),
      gradeSelection: new Set<Grade>(),
      levelSelection: new Set<SchoolLevel>(),
      typeSelection: new Set<SchoolType>(),
      titleISelection: new Set<TitleIState>(),
      plpOnly: false,
      coLocationOnly: false,
      districtFilter: null,
      facilityUseSelection: new Set<FacilityUseKey>(),
      utilMin: null,
      utilMax: null,
      frlMin: null,
      frlMax: null,
      drawnBoundary: null,
      activeTool: "none",
      radiusCenter: null,
      radiusMiles: 3,
    }),

  resetAll: () =>
    set({
      activeLayerIds: new Set(DEFAULT_ACTIVE_LAYER_IDS),
      countySelection: new Set(ALL_COUNTIES),
      gradeSelection: new Set<Grade>(),
      levelSelection: new Set<SchoolLevel>(),
      typeSelection: new Set<SchoolType>(),
      titleISelection: new Set<TitleIState>(),
      plpOnly: false,
      coLocationOnly: false,
      districtFilter: null,
      facilityUseSelection: new Set<FacilityUseKey>(),
      utilMin: null,
      utilMax: null,
      frlMin: null,
      frlMax: null,
      // Clear the spatial filter AND the tool that draws it, so "Clear all" is a
      // true clean slate: no lingering measurement circle or drawn-area overlay
      // left on the map after the filter behind it is gone.
      drawnBoundary: null,
      activeTool: "none",
      radiusCenter: null,
      radiusMiles: 3,
    }),

  setViewMode: (mode) => set({ viewMode: mode }),
  setListScope: (scope) => set({ listScope: scope }),
  setPanelCollapsed: (collapsed) => set({ panelCollapsed: collapsed }),
  setMobileRailOpen: (open) => set({ mobileRailOpen: open }),
  setBaseMapType: (type) => set({ baseMapType: type }),
  toggleOverlay: (key) => set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),

  selectSchool: (msid) => set({ selectedSchoolMsid: msid }),

  toggleComparePin: (msid) =>
    set((s) => {
      const has = s.comparePinnedMsids.includes(msid);
      if (has) return { comparePinnedMsids: s.comparePinnedMsids.filter((m) => m !== msid) };
      if (s.comparePinnedMsids.length >= MAX_COMPARE) return s;
      // Adding a site does NOT auto-open the tray (that yanked the map out from
      // under the operator mid-scan). Feedback is quieter: the shortlist button
      // pops and its counter ticks up; the operator opens the tray when ready.
      return { comparePinnedMsids: [...s.comparePinnedMsids, msid] };
    }),

  clearCompare: () => set({ comparePinnedMsids: [], shortlistOpen: false, shortlistFullTableOpen: false }),

  // Opening the tray closes the inspector: the two both claim the bottom/side of
  // the map, so the shortlist takes focus cleanly instead of overlapping. Closing
  // the tray also closes its full-table modal so it never lingers over the map.
  setShortlistOpen: (open) =>
    set(open
      ? { shortlistOpen: true, selectedSchoolMsid: null }
      : { shortlistOpen: false, shortlistFullTableOpen: false }),

  setShortlistFullTableOpen: (open) => set({ shortlistFullTableOpen: open }),

  setTool: (tool) =>
    set((s) => ({
      activeTool: tool,
      // Switching or closing a tool drops that tool's in-progress input; the
      // committed drawnBoundary (the area filter) persists independently.
      measurePoints: tool === "measure" ? s.measurePoints : [],
      radiusCenter: tool === "radius" ? s.radiusCenter : null,
    })),

  addMeasurePoint: (p) => set((s) => ({ measurePoints: [...s.measurePoints, p] })),
  undoMeasurePoint: () => set((s) => ({ measurePoints: s.measurePoints.slice(0, -1) })),
  clearMeasure: () => set({ measurePoints: [] }),

  setRadius: (center, miles) => set((s) => ({ radiusCenter: center, radiusMiles: miles ?? s.radiusMiles })),
  setRadiusMiles: (miles) => set({ radiusMiles: miles }),

  setDrawnBoundary: (ring) => set({ drawnBoundary: ring }),
  clearDrawnBoundary: () => set({ drawnBoundary: null }),

  setMapView: (center, zoom) => set({ mapCenter: center, mapZoom: zoom }),
  setMapBounds: (bounds) => set({ mapBounds: bounds }),

  hydrate: (partial) => set(partial),
}));

export { MAX_COMPARE };
