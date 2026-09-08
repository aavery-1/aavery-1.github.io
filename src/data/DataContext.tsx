// The data-loading layer. Loaded GeoJSON lives here, not in the Zustand store.
// Each source is loaded once through its adapter, validated, and cached in
// memory with a per-layer status (loading / ok / error). A single layer failing
// to load never takes down the others: its status carries a specific message
// that the panel shows as an error chip with a retry.

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import type {
  LoadResult,
  SchoolCollection,
  GradesFile,
  IncomeCollection,
  BoardDistrictCollection,
  IsochroneCollection,
  PopulationGrowthCollection,
  OpportunityZoneCollection,
  LegislativeCollection,
  RepresentativesFile,
  OrangeBoardFile,
  EnrollmentHistoryFile,
  SchoolsOfHopeCollection,
} from "./types";
import type { PlpFile } from "./adapters/plp";
import { getAdapter } from "./adapters";
import { PolygonIndex } from "../geo/spatialIndex";
import { buildSchoolDistricts, type SchoolDistricts } from "./derive/districts";

export type LayerStatus = "idle" | "loading" | "ok" | "error";

export interface LayerEntry {
  status: LayerStatus;
  result: LoadResult<unknown> | null;
}

export interface DataContextValue {
  entries: Record<string, LayerEntry>;
  load: (id: string) => void;
  retry: (id: string) => void;
  schools: SchoolCollection | null;
  grades: GradesFile | null;
  plp: PlpFile | null;
  income: IncomeCollection | null;
  boardDistricts: BoardDistrictCollection | null;
  isochrones: IsochroneCollection | null;
  populationGrowth: PopulationGrowthCollection | null;
  opportunityZones: OpportunityZoneCollection | null;
  legislative: LegislativeCollection | null;
  reps: RepresentativesFile | null;
  enrollment: EnrollmentHistoryFile | null;
  schoolsOfHope: SchoolsOfHopeCollection | null;
  incomeIndex: PolygonIndex | null;
  boardIndex: PolygonIndex | null;
  growthIndex: PolygonIndex | null;
  ozIndex: PolygonIndex | null;
  legislativeIndex: PolygonIndex | null;
  schoolDistricts: SchoolDistricts;
}

const DataContext = createContext<DataContextValue | null>(null);

// Sources loaded eagerly on mount (everything with a committed sample, plus the
// grades dataset that feeds the inspector). Loading here is deliberately
// decoupled from `activeLayerIds`: the inspector shows a school's
// opportunity-zone, income, and district facts whether or not the matching map
// layer is toggled on, so the spatial indexes below must be built from data that
// is always loaded, never gated on a layer being visible (P0.1). Exported so a
// test can assert the inspector's point-query sources stay eager.
export const EAGER_IDS = [
  "school_locations", "historic_grades", "plp_designations", "household_income",
  "board_districts", "drive_time_reach",
  "population_growth", "opportunity_zones", "legislative_districts",
  "representatives", "school_enrollment_history", "existing_soh",
  "orange_board_districts",
];

export function DataProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, LayerEntry>>({});

  const load = useCallback((id: string) => {
    const adapter = getAdapter(id);
    if (!adapter) {
      setEntries((e) => ({
        ...e,
        [id]: { status: "error", result: { ok: false, data: null, error: "No adapter registered for this layer id.", source: "unknown", vintage: "unknown" } },
      }));
      return;
    }
    setEntries((e) => ({ ...e, [id]: { status: "loading", result: null } }));
    adapter()
      .then((result) => {
        setEntries((e) => ({ ...e, [id]: { status: result.ok ? "ok" : "error", result } }));
      })
      .catch((err: unknown) => {
        // Every adapter is expected to catch its own failures and resolve to
        // ok:false (see loadValidated in base.ts), so this should never fire.
        // It exists so a future adapter that skips that helper (e.g. wiring a
        // real endpoint per PROJECT_NOTES.md) fails as a visible error chip
        // with a retry, not a layer stuck on "loading" forever.
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        setEntries((e) => ({
          ...e,
          [id]: { status: "error", result: { ok: false, data: null, error: message, source: "unknown", vintage: "unknown" } },
        }));
      });
  }, []);

  const retry = useCallback((id: string) => load(id), [load]);

  useEffect(() => {
    for (const id of EAGER_IDS) load(id);
  }, [load]);

  const dataOf = <T,>(id: string): T | null => {
    const e = entries[id];
    return e?.status === "ok" ? (e.result?.data as T) : null;
  };

  const schools = dataOf<SchoolCollection>("school_locations");
  const grades = dataOf<GradesFile>("historic_grades");
  const plp = dataOf<PlpFile>("plp_designations");
  const income = dataOf<IncomeCollection>("household_income");
  const boardDistricts = dataOf<BoardDistrictCollection>("board_districts");
  const isochrones = dataOf<IsochroneCollection>("drive_time_reach");
  const populationGrowth = dataOf<PopulationGrowthCollection>("population_growth");
  const opportunityZones = dataOf<OpportunityZoneCollection>("opportunity_zones");
  const legislative = dataOf<LegislativeCollection>("legislative_districts");
  const reps = dataOf<RepresentativesFile>("representatives");
  const enrollment = dataOf<EnrollmentHistoryFile>("school_enrollment_history");
  const schoolsOfHope = dataOf<SchoolsOfHopeCollection>("existing_soh");
  const orangeBoard = dataOf<OrangeBoardFile>("orange_board_districts");

  // Spatial indexes built once per loaded polygon layer, reused by every
  // inspector point-in-polygon lookup.
  const incomeIndex = useMemo(() => (income ? new PolygonIndex(income.features) : null), [income]);
  const boardIndex = useMemo(() => (boardDistricts ? new PolygonIndex(boardDistricts.features) : null), [boardDistricts]);
  const growthIndex = useMemo(() => (populationGrowth ? new PolygonIndex(populationGrowth.features) : null), [populationGrowth]);
  const ozIndex = useMemo(() => (opportunityZones ? new PolygonIndex(opportunityZones.features) : null), [opportunityZones]);
  const legislativeIndex = useMemo(() => (legislative ? new PolygonIndex(legislative.features) : null), [legislative]);
  // Each school's board / congressional / legislative districts, resolved once
  // by spatial join and reused by the district filter and its picker.
  const schoolDistricts = useMemo(
    () => buildSchoolDistricts(schools?.features ?? [], boardIndex, legislativeIndex, orangeBoard),
    [schools, boardIndex, legislativeIndex, orangeBoard],
  );

  const value: DataContextValue = {
    entries,
    load,
    retry,
    schools,
    grades,
    plp,
    income,
    boardDistricts,
    isochrones,
    populationGrowth,
    opportunityZones,
    legislative,
    reps,
    enrollment,
    schoolsOfHope,
    incomeIndex,
    boardIndex,
    growthIndex,
    ozIndex,
    legislativeIndex,
    schoolDistricts,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}
