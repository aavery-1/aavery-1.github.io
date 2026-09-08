// Builds the inspector's Context rows for one school point. Rows populate from
// whichever overlays are currently active and loaded. Three distinct states,
// never conflated: "value" (real number), "no-data" (layer loaded but nothing at
// this point), and "not-loaded" (overlay not on). The analyst always knows which
// they are looking at, and we never render a fake zero. Reused by the Compare view
// so both views show identical rows.

import type { LngLat } from "../geo/measure";
import type { SchoolFeature } from "../data/types";
import type { useData } from "../data/DataContext";
import { incomeAtPoint, boardDistrictAtPoint, driveTimeReachForSchool, formatIncomeWithMoe, opportunityZoneAtPoint, legislativeDistrictsAtPoint, formatLegislativeDistricts, populationGrowthAtPoint } from "../data/derive/contextReads";

export type RowState = "value" | "no-data" | "not-loaded";

export interface ContextRow {
  key: string;
  label: string;
  layerId: string;
  state: RowState;
  value: string;
  source?: string;
}

type DataCtx = ReturnType<typeof useData>;

export function buildContextRows(school: SchoolFeature, data: DataCtx, activeLayerIds: Set<string>): ContextRow[] {
  const point = school.geometry.coordinates as LngLat;
  const rows: ContextRow[] = [];

  const loaded = (id: string) => activeLayerIds.has(id) && data.entries[id]?.status === "ok";

  // Board district (spatial join)
  if (loaded("board_districts")) {
    const bd = boardDistrictAtPoint(data.boardIndex, point);
    rows.push(
      bd
        ? { key: "board", label: "School board district", layerId: "board_districts", state: "value", value: `District ${bd.district_number} (${bd.county})`, source: bd.source }
        : { key: "board", label: "School board district", layerId: "board_districts", state: "no-data", value: "no district polygon at this location" },
    );
  } else {
    rows.push({ key: "board", label: "School board district", layerId: "board_districts", state: "not-loaded", value: "layer not loaded" });
  }

  // Tract median household income
  if (loaded("household_income")) {
    const inc = incomeAtPoint(data.incomeIndex, point);
    rows.push(
      inc && inc.median_household_income != null
        ? { key: "income", label: "Tract median household income", layerId: "household_income", state: "value", value: `${formatIncomeWithMoe(inc)} (tract ${inc.geoid})`, source: "ACS 2019-2023 (5-year), Census B19013" }
        : { key: "income", label: "Tract median household income", layerId: "household_income", state: "no-data", value: "no data at this location" },
    );
  } else {
    rows.push({ key: "income", label: "Tract median household income", layerId: "household_income", state: "not-loaded", value: "layer not loaded" });
  }

  // Drive-time reach (population within 15 minutes)
  if (loaded("drive_time_reach")) {
    const iso = driveTimeReachForSchool(data.isochrones, school.properties.msid);
    rows.push(
      iso
        ? { key: "reach", label: "Population within 15 min drive", layerId: "drive_time_reach", state: "value", value: `${iso.population_within.toLocaleString("en-US")} people`, source: `${iso.mode}, OSM via ORS, computed ${iso.computed_at.slice(0, 10)}` }
        : { key: "reach", label: "Population within 15 min drive", layerId: "drive_time_reach", state: "no-data", value: "no isochrone precomputed for this school" },
    );
  } else {
    rows.push({ key: "reach", label: "Population within 15 min drive", layerId: "drive_time_reach", state: "not-loaded", value: "layer not loaded" });
  }

  // Population growth (county-level). Relevant to a school for future demand.
  if (loaded("population_growth")) {
    const g = populationGrowthAtPoint(data.growthIndex, point);
    rows.push(
      g
        ? {
            key: "growth",
            label: "County population growth (annual)",
            layerId: "population_growth",
            state: "value",
            value: `${(g.growth_rate * 100).toFixed(2)}% in ${g.county} (net migration ${g.net_migration >= 0 ? "+" : ""}${g.net_migration.toLocaleString("en-US")})`,
            source: "U.S. Census Bureau PEP, Vintage 2024 (2023→2024)",
          }
        : { key: "growth", label: "County population growth (annual)", layerId: "population_growth", state: "no-data", value: "no county polygon at this location" },
    );
  } else {
    rows.push({ key: "growth", label: "County population growth (annual)", layerId: "population_growth", state: "not-loaded", value: "layer not loaded" });
  }

  // Opportunity zone: is this school inside a designated QOZ tract? This
  // matters for SoH siting - an Opportunity Zone independently expands
  // eligibility under the F.S. 1002.333 "whichever is greater" clause.
  if (loaded("opportunity_zones")) {
    const oz = opportunityZoneAtPoint(data.ozIndex, point);
    rows.push(
      oz
        ? { key: "oz", label: "In an Opportunity Zone?", layerId: "opportunity_zones", state: "value", value: `Yes - designated QOZ tract ${oz.geoid}${oz.rural ? " (rural)" : ""}`, source: "HUD / Treasury designated QOZ tracts (2018)" }
        : { key: "oz", label: "In an Opportunity Zone?", layerId: "opportunity_zones", state: "no-data", value: "No - not in a designated Opportunity Zone" },
    );
  } else {
    rows.push({ key: "oz", label: "In an Opportunity Zone?", layerId: "opportunity_zones", state: "not-loaded", value: "layer not loaded" });
  }

  // Legislative districts (CD / SLDU / SLDL) with the federal member name.
  if (loaded("legislative_districts")) {
    const districts = legislativeDistrictsAtPoint(data.legislativeIndex, point);
    rows.push(
      districts.length
        ? { key: "legislative", label: "Legislative districts", layerId: "legislative_districts", state: "value", value: formatLegislativeDistricts(districts, data.reps), source: "Census TIGERweb (boundaries); congress-legislators (U.S. House)" }
        : { key: "legislative", label: "Legislative districts", layerId: "legislative_districts", state: "no-data", value: "no district polygon at this location" },
    );
  } else {
    rows.push({ key: "legislative", label: "Legislative districts", layerId: "legislative_districts", state: "not-loaded", value: "layer not loaded" });
  }

  return rows;
}
