// The one hook every surface uses to answer "which schools are in scope right
// now, and what are the headline counts?" The map, the school list, the summary
// callouts, and the active-filter chips all read from here, so a filter change
// updates every component from the same computation. This is the guarantee in
// section 7 of the brief: one consistent underlying state for the current view.

import { useMemo } from "react";
import { useData } from "../DataContext";
import { useStore, utilizationBucket, isUnderutilizedFacility, type MapBounds } from "../../store";
import { buildFilterContext, passesFilters, type SchoolFilterInput, type SchoolFilterContext } from "./filters";
import type { SchoolFeature } from "../types";

// A school is "in view" when its point sits inside the current map bounds. Before
// the map reports bounds (null), every filtered school counts as in view.
function inBounds(f: SchoolFeature, b: MapBounds | null): boolean {
  if (!b) return true;
  const [lng, lat] = f.geometry.coordinates as [number, number];
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

export interface FilteredSchools {
  ready: boolean;                 // data has loaded
  all: SchoolFeature[];           // every loaded school (unfiltered)
  features: SchoolFeature[];      // schools passing all active filters
  ctx: SchoolFilterContext;
  input: SchoolFilterInput;
  // Headline counts, all derived from `features`.
  total: number;
  loaded: number;
  plpVisible: number;
  plpTotal: number;
  underutilizedVisible: number;   // known utilization below the under threshold
  overCapacityVisible: number;
  sohEligibleVisible: number;
  avgUtilization: number | null;  // mean of known utilizations, as a fraction
  // Viewport-limited slice: the filtered schools inside the current map bounds,
  // for the "Schools in view" dock and map summary. Falls back to the full
  // filtered set until the map reports its first bounds.
  inViewFeatures: SchoolFeature[];
  inViewTotal: number;
  inViewPlp: number;
  inViewUnderutilized: number;
  inViewCoLocation: number;       // co-location candidates in view (same set as the map dots / filter)
}

export function useFilteredSchools(): FilteredSchools {
  const { schools, grades, plp, ozIndex, schoolDistricts } = useData();
  const countySelection = useStore((s) => s.countySelection);
  const gradeSelection = useStore((s) => s.gradeSelection);
  const levelSelection = useStore((s) => s.levelSelection);
  const typeSelection = useStore((s) => s.typeSelection);
  const titleISelection = useStore((s) => s.titleISelection);
  const plpOnly = useStore((s) => s.plpOnly);
  const coLocationOnly = useStore((s) => s.coLocationOnly);
  const districtFilter = useStore((s) => s.districtFilter);
  const facilityUseSelection = useStore((s) => s.facilityUseSelection);
  const utilMin = useStore((s) => s.utilMin);
  const utilMax = useStore((s) => s.utilMax);
  const frlMin = useStore((s) => s.frlMin);
  const frlMax = useStore((s) => s.frlMax);
  const drawnBoundary = useStore((s) => s.drawnBoundary);
  const mapBounds = useStore((s) => s.mapBounds);

  const ctx = useMemo(() => buildFilterContext(schools, grades, plp, ozIndex), [schools, grades, plp, ozIndex]);

  // The set of schools inside the chosen district, resolved from the shared
  // spatial-join tags; null when no district filter is active.
  const districtMsids = useMemo(
    () => (districtFilter ? schoolDistricts.matchSet(districtFilter.kind, districtFilter.value) : null),
    [districtFilter, schoolDistricts],
  );

  const input: SchoolFilterInput = useMemo(
    () => ({
      counties: countySelection,
      grades: gradeSelection,
      levels: levelSelection,
      types: typeSelection,
      titleI: titleISelection,
      plpOnly,
      coLocationOnly,
      facilityUse: facilityUseSelection,
      utilMin,
      utilMax,
      frlMin,
      frlMax,
      boundary: drawnBoundary,
      districtMsids,
    }),
    [countySelection, gradeSelection, levelSelection, typeSelection, titleISelection, plpOnly, coLocationOnly, facilityUseSelection, utilMin, utilMax, frlMin, frlMax, drawnBoundary, districtMsids],
  );

  return useMemo(() => {
    const all = schools?.features ?? [];
    const features = all.filter((f) => passesFilters(f, input, ctx));
    let plpVisible = 0, underutilizedVisible = 0, overCapacityVisible = 0, sohEligibleVisible = 0;
    let utilSum = 0, utilN = 0;
    for (const f of features) {
      const p = f.properties;
      const b = utilizationBucket(p.enrollment, p.capacity);
      // "Underutilized" uses the statutory facility test (<=75% OR >=400 surplus
      // stations), not just the visual bucket, so the count matches Rule 6A-1.0998271.
      if (isUnderutilizedFacility(p.enrollment, p.capacity, p.cofte, p.fish_surplus)) underutilizedVisible++;
      if (b === "over") overCapacityVisible++;
      if (p.enrollment != null && p.capacity && p.capacity > 0) { utilSum += p.enrollment / p.capacity; utilN++; }
      if (ctx.plp.has(p.msid)) plpVisible++;
      if (ctx.sohEligibleMsids.has(p.msid)) sohEligibleVisible++;
    }
    // Viewport-limited slice for the "in view" dock + summary.
    const inViewFeatures = features.filter((f) => inBounds(f, mapBounds));
    let inViewPlp = 0, inViewUnderutilized = 0, inViewCoLocation = 0;
    for (const f of inViewFeatures) {
      const p = f.properties;
      if (ctx.plp.has(p.msid)) inViewPlp++;
      if (isUnderutilizedFacility(p.enrollment, p.capacity, p.cofte, p.fish_surplus)) inViewUnderutilized++;
      // Co-location candidates: the exact set the map dots, filter, list, and
      // inspector use, so the dock count can never disagree with them.
      if (ctx.coLocationMsids.has(p.msid)) inViewCoLocation++;
    }
    return {
      ready: schools != null,
      all,
      features,
      ctx,
      input,
      total: features.length,
      loaded: all.length,
      plpVisible,
      plpTotal: ctx.plp.size,
      underutilizedVisible,
      overCapacityVisible,
      sohEligibleVisible,
      avgUtilization: utilN ? utilSum / utilN : null,
      inViewFeatures,
      inViewTotal: inViewFeatures.length,
      inViewPlp,
      inViewUnderutilized,
      inViewCoLocation,
    };
  }, [schools, input, ctx, mapBounds]);
}
