// Catalog of independently-toggleable MAP LAYERS (visual overlays), grouped for
// the LeftRail "Map layers" section. This is intentionally separate from the
// data-source config in 07_LAYERS.config.json: several UI layers here (the three
// legislative chambers, the school name labels, the PLP radius) are distinct
// toggles that draw from a shared data source. useDeckLayers reads activeLayerIds
// against these ids; the LeftRail renders the same catalog. One source of truth
// for "what can be turned on" so the panel, the map, and the legend never drift.

export type MapLayerGroup = "Schools" | "Boundaries" | "Context";

export interface MapLayerDef {
  id: string;
  label: string;
  group: MapLayerGroup;
  description: string;
  // Legend swatch. "fill" draws a filled square; "outline" draws a ring; "dot"
  // a small circle. color is CSS.
  swatch: { kind: "fill" | "outline" | "dot"; color: string };
  // The DataContext key this layer needs loaded to render (for an honest
  // "data unavailable" state). null = always renderable (derived).
  needs: string | null;
  defaultOn?: boolean;
}

export const MAP_LAYERS: MapLayerDef[] = [
  // ---- Schools ----
  {
    id: "school_locations",
    label: "School locations",
    group: "Schools",
    description: "Every school in scope, colored and lettered by current grade.",
    swatch: { kind: "dot", color: "#388E3C" },
    needs: "schools",
    defaultOn: true,
  },
  {
    id: "school_labels",
    label: "School name labels",
    group: "Schools",
    description: "Names beside each pin. Best used zoomed in or with a tight filter.",
    swatch: { kind: "fill", color: "#0F172A" },
    needs: "schools",
  },
  {
    id: "plp_radius",
    label: "5-mile radius around PLP schools",
    group: "Schools",
    description: "Schools of Hope eligibility rings around persistently low-performing schools.",
    swatch: { kind: "outline", color: "#D32F2F" },
    needs: "schools",
  },
  {
    id: "existing_soh",
    label: "Schools of Hope",
    group: "Schools",
    description: "Gold stars: existing Schools of Hope, plus every school run by a state-designated hope operator (Mater, KIPP, IDEA, RCMA, Success, Renaissance/Warrington).",
    swatch: { kind: "dot", color: "#F59E0B" },
    needs: "schools",
    defaultOn: true,
  },

  // ---- Boundaries ----
  {
    id: "board_districts",
    label: "School board districts",
    group: "Boundaries",
    description: "Each school board member's district (District 1, 2, 3 ...).",
    swatch: { kind: "outline", color: "#6D28D9" },
    needs: "boardDistricts",
  },
  {
    id: "congressional_districts",
    label: "Congressional districts",
    group: "Boundaries",
    description: "U.S. House districts (119th Congress).",
    swatch: { kind: "outline", color: "#512DA8" },
    needs: "legislative",
  },
  {
    id: "state_senate_districts",
    label: "State Senate districts",
    group: "Boundaries",
    description: "Florida Senate districts (2024 map).",
    swatch: { kind: "outline", color: "#7E57C2" },
    needs: "legislative",
  },
  {
    id: "state_house_districts",
    label: "State House districts",
    group: "Boundaries",
    description: "Florida House districts (2024 map).",
    swatch: { kind: "outline", color: "#B39DDB" },
    needs: "legislative",
  },

  // ---- Context: demand & demographics overlays ----
  {
    id: "opportunity_zones",
    label: "Opportunity zones",
    group: "Context",
    description: "Designated Qualified Opportunity Zone tracts.",
    swatch: { kind: "fill", color: "#FFCC80" },
    needs: "opportunityZones",
  },
  {
    id: "drive_time_reach",
    label: "15-minute drive-time reach",
    group: "Context",
    description: "Population reachable within a 15-minute drive.",
    swatch: { kind: "outline", color: "#00897B" },
    needs: "isochrones",
  },
  {
    id: "population_growth",
    label: "Population growth (by county)",
    group: "Context",
    description: "Annual population change, shaded light to dark (Census PEP).",
    swatch: { kind: "fill", color: "#66BB6A" },
    needs: "populationGrowth",
  },
  {
    id: "household_income",
    label: "Median household income",
    group: "Context",
    description: "Median household income by census tract (ACS 5-year).",
    swatch: { kind: "fill", color: "#A5D6A7" },
    needs: "income",
  },
];

// Graduated choropleths that shade the entire map area. Only one can be read at a
// time (a second full-area fill just occludes the first), so these are mutually
// exclusive: turning one on turns the others off. Categorical area overlays
// (opportunity zones) and all point/line layers stay freely additive.
export const EXCLUSIVE_CHOROPLETH_IDS = ["household_income", "population_growth"];

export const MAP_LAYER_GROUPS: MapLayerGroup[] = ["Schools", "Boundaries", "Context"];

export function mapLayersByGroup(): Array<{ group: MapLayerGroup; layers: MapLayerDef[] }> {
  return MAP_LAYER_GROUPS.map((group) => ({
    group,
    layers: MAP_LAYERS.filter((l) => l.group === group),
  }));
}

export const DEFAULT_ACTIVE_LAYER_IDS = MAP_LAYERS.filter((l) => l.defaultOn).map((l) => l.id);
