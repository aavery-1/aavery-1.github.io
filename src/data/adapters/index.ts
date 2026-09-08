// Adapter registry keyed by the layer/dataset id in 07_LAYERS.config.json. This
// is the seam that makes the app config-driven: the config names a layer id, and
// the registry maps that id to its loader. A layer added to the config with no
// entry here still appears in the panel (its row shows a "no adapter / no
// sample" state), which satisfies the acceptance item that a new config layer
// appears with no other code changes.

import type { LoadResult } from "../types";
import { loadSchools } from "./schools";
import { loadGrades } from "./grades";
import { loadIncome } from "./income";
import { loadBoardDistricts } from "./boardDistricts";
import { loadIsochrones } from "./isochrones";
import { loadOpportunityZones } from "./opportunityZones";
import { loadLegislative } from "./legislative";
import { loadReps } from "./reps";
import { loadOrangeBoard } from "./orangeBoard";
import { loadParcels } from "./parcels";
import { loadPlp } from "./plp";
import { loadPopulationGrowth } from "./populationGrowth";
import { loadEnrollmentHistory } from "./enrollment";
import { loadSchoolsOfHope } from "./schoolsOfHope";

export type AnyLoader = () => Promise<LoadResult<unknown>>;

// Keyed by config id. Layers and datasets both live here.
export const ADAPTERS: Record<string, AnyLoader> = {
  // rendered layers
  school_locations: loadSchools as AnyLoader,
  household_income: loadIncome as AnyLoader,
  board_districts: loadBoardDistricts as AnyLoader,
  drive_time_reach: loadIsochrones as AnyLoader,
  population_growth: loadPopulationGrowth as AnyLoader,
  opportunity_zones: loadOpportunityZones as AnyLoader,
  legislative_districts: loadLegislative as AnyLoader,
  existing_soh: loadSchoolsOfHope as AnyLoader,
  parcels: loadParcels as AnyLoader,
  // datasets (feed the inspector, not the map)
  historic_grades: loadGrades as AnyLoader,
  plp_designations: loadPlp as AnyLoader,
  representatives: loadReps as AnyLoader,
  school_enrollment_history: loadEnrollmentHistory as AnyLoader,
  orange_board_districts: loadOrangeBoard as AnyLoader,
};

export function getAdapter(id: string): AnyLoader | undefined {
  return ADAPTERS[id];
}
