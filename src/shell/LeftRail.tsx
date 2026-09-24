// Left filter panel, rebuilt around one consistent faceted-filter pattern
// (Baymard / NN-g / Airbnb / Zillow conventions):
//
//   - ONE control type for categorical facets: a checkbox row per option, with a
//     live RESULT COUNT on the right so the analyst sees what each choice yields.
//   - Within a facet, options compose as OR; across facets, as AND (the standard
//     faceted-search model). Counts hold all OTHER active filters fixed.
//   - An APPLIED-FILTERS summary at the top, mirroring the map breadcrumb, with a
//     per-chip remove and one "Clear all".
//   - Progressive disclosure: the district picker (hundreds of options) sits
//     behind "More filters".
//   - Map layers (display overlays, not filters) stay last and visually separate.
//
// The bespoke grade-button grid and the dual-range utilization slider were
// removed in favour of this uniform pattern; facility use is now the three
// statutory tiers as checkboxes (store `facilityUseSelection`).

import {
  Box, Typography, Divider, Button, Tooltip, Chip, Collapse, IconButton, Stack,
  Checkbox, Badge, Select, MenuItem, ToggleButton, ToggleButtonGroup, TextField, InputAdornment,
  Autocomplete, Switch,
} from "@mui/material";
import { useMemo, useRef, useState, type RefObject } from "react";
import {
  Close as CloseIcon, Location as LocationIcon, Star as StarIcon,
  Building as BuildingIcon, Money as MoneyIcon, Categories as CategoriesIcon,
  Education as EducationIcon, Report as ReportIcon, MapBoundary as MapBoundaryIcon,
  ZoomIn as ZoomToIcon, Filter as FilterFunnelIcon, Reset as ResetIcon,
  Restaurant as MealIcon, View as PickIcon, Add as AddIcon,
} from "@carbon/icons-react";
import { alpha } from "@mui/material/styles";
import { useStore, ALL_COUNTIES, FACILITY_USE_TIERS, utilizationStyle, type FacilityUseKey, type LatLng } from "../store";
import { DEFAULT_ACTIVE_LAYER_IDS } from "../config/mapLayers";
import { COUNTY_BBOX } from "../geo/countyBounds";
import { panMapTo } from "../map/mapController";
import { resolveGradeStyle, rgbaToCss, type Grade } from "../map/gradeEncoding";
import { mapLayersByGroup, type MapLayerDef, type MapLayerGroup } from "../config/mapLayers";
import { TEAL, ACCENT, ACCENT_TEXT, SHELL_BG, SHELL_ON, SHELL_DIM, SHELL_HAIRLINE, STATUS } from "../muiTheme";
import { Icon } from "../ui/icons";
import { useData } from "../data/DataContext";
import { sohMarker, isSuccessColocation } from "../data/derive/sohSites";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { passesFilters, type SchoolFilterInput } from "../data/derive/filters";
import { useActiveFilters } from "../status/useActiveFilters";
import { AccountMenu } from "./AccountMenu";
import { DISTRICT_KINDS, type DistrictKind } from "../data/derive/districts";
import {
  SCHOOL_LEVELS, SCHOOL_TYPES, TITLE_I_STATES, schoolTypeLabel, titleILabel,
  type CountyName, type SchoolLevel, type SchoolType, type TitleIState, type SchoolFeature,
} from "../data/types";

const RAIL_COLLAPSED = 64;
const PANEL_WIDTH = 340;

// Letter grades exposed as facet rows (four-plus-F, then the non-standard codes
// grouped as "Not rated").
const RATING_GRADES: Grade[] = ["A", "B", "C", "D", "F"];
const OTHER_GRADES: Grade[] = ["I", "NR", "NG"];

const LAYER_GROUP_ICON: Record<MapLayerGroup, React.ReactNode> = {
  Schools: <Icon.Schools size={14} />,
  Boundaries: <Icon.Boundaries size={14} />,
  Context: <Icon.Context size={14} />,
};

function countyCenter(c: CountyName): { center: LatLng; zoom: number } {
  const b = COUNTY_BBOX[c];
  return { center: { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 }, zoom: 10 };
}

// ---------------------------------------------------------------------------
// Faceted result counts: for each facet, how many schools each option yields
// while every OTHER active filter is held fixed (the standard faceted-count
// behaviour). Computed once per (schools, filters) change.
// ---------------------------------------------------------------------------
interface FacetCounts {
  county: Record<string, number>;
  grade: Record<string, number>;
  level: Record<string, number>;
  type: Record<string, number>;
  titleI: Record<string, number>;
  facility: Record<string, number>;
  plp: number;
  coloc: number;
}

function useFacetCounts(): FacetCounts {
  const { all, ctx, input } = useFilteredSchools();
  return useMemo(() => {
    // Facet counts always reflect the underlying filter world, never the isolate
    // override (which would collapse every count to the pick set), so the numbers
    // beside each option stay meaningful even while "show only picks" is on.
    const baseExcept = (override: Partial<SchoolFilterInput>) =>
      all.filter((f) => passesFilters(f, { ...input, isolatePicked: false, ...override }, ctx));
    const tally = (list: SchoolFeature[], keyFn: (f: SchoolFeature) => string | null): Record<string, number> => {
      const r: Record<string, number> = {};
      for (const f of list) { const k = keyFn(f); if (k != null) r[k] = (r[k] ?? 0) + 1; }
      return r;
    };
    const plpBase = baseExcept({ plpOnly: false });
    const colocBase = baseExcept({ coLocationOnly: false });
    return {
      county: tally(baseExcept({ counties: new Set(ALL_COUNTIES) }), (f) => f.properties.county),
      grade: tally(baseExcept({ grades: new Set<Grade>() }), (f) => f.properties.current_grade),
      level: tally(baseExcept({ levels: new Set<SchoolLevel>() }), (f) => f.properties.level),
      type: tally(baseExcept({ types: new Set<SchoolType>() }), (f) => f.properties.type),
      titleI: tally(baseExcept({ titleI: new Set<TitleIState>() }), (f) => f.properties.title_i),
      facility: tally(baseExcept({ facilityUse: new Set<FacilityUseKey>() }), (f) => utilizationStyle(f.properties.enrollment, f.properties.capacity, f.properties.cofte, f.properties.fish_surplus).key),
      plp: plpBase.filter((f) => ctx.plp.has(f.properties.msid)).length,
      coloc: colocBase.filter((f) => ctx.coLocationMsids.has(f.properties.msid)).length,
    };
  }, [all, ctx, input]);
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export function LeftRail({ onNavigate, onOpenAttribution }: { onNavigate?: () => void; onOpenAttribution?: () => void } = {}) {
  const collapsed = useStore((s) => s.panelCollapsed);
  const setCollapsed = useStore((s) => s.setPanelCollapsed);

  const layersRef = useRef<HTMLDivElement | null>(null);

  const activeLayerIds = useStore((s) => s.activeLayerIds);
  const activeLayerCount = activeLayerIds.size;
  // One canonical count of active filters (same source as the applied-filter
  // chips), shown on the rail's Filters button.
  const filterCount = useActiveFilters().length;

  const expandTo = (ref: RefObject<HTMLDivElement | null>) => {
    setCollapsed(false);
    requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const inDrawer = Boolean(onNavigate);

  // The panel body, shared by the desktop rail and the phone drawer so the two
  // never drift apart.
  const panelContent = (
    <>
      <PanelHeader inDrawer={inDrawer} onClose={onNavigate} />
      <AppliedFilters />

      {/* Manual pick / isolate: clear the map to only the schools the analyst
          hand-picks. Sits first because it overrides every other filter. */}
      <PickSchoolsFacet />
      <FacetDivider />

      {/* Filters: geography first (where), then the school facets (which). */}
      <GeographyFacet onNavigate={onNavigate} />
      <FacetDivider />
      <SchoolFacets />

      {/* Map layers: display overlays, kept visually apart from the filters
          above by a heavier separator and its own reset. */}
      <Box ref={layersRef} sx={{ borderTop: `1px solid ${SHELL_HAIRLINE}`, mt: 1, px: 2.5, pt: 2, pb: inDrawer ? 2 : 3 }}>
        <SectionHeader
          title="Map layers"
          activeCount={activeLayerCount}
          onReset={activeLayerCount !== DEFAULT_ACTIVE_LAYER_IDS.length || [...activeLayerIds].some((id) => !DEFAULT_ACTIVE_LAYER_IDS.includes(id))
            ? () => useStore.getState().setActiveLayers(DEFAULT_ACTIVE_LAYER_IDS)
            : undefined}
        />
        <MapLayersSection />
      </Box>

      {/* In the phone drawer, a sticky primary action doubles as the obvious exit:
          apply-and-return to the map. Filters already apply live, so this simply
          closes the drawer onto the updated results. */}
      {inDrawer && <DrawerDone onDone={onNavigate} />}
    </>
  );

  return (
    <Box sx={{ display: "flex", height: "100%" }}>
      {!inDrawer && (
        <Box sx={{
          width: RAIL_COLLAPSED, flex: "none", bgcolor: SHELL_BG, borderRight: `1px solid ${SHELL_HAIRLINE}`,
          display: "flex", flexDirection: "column", alignItems: "stretch", py: 1, zIndex: 1,
        }}>
          {/* Two entries only: Filters (the whole filter panel) and Map layers.
              The Filters button is also the panel's open/close toggle, so there is
              no separate, redundant collapse control. Reset lives in the panel as
              a single "Clear all". */}
          <RailIcon
            label="Filters"
            icon={<FilterFunnelIcon size={22} />}
            onClick={() => setCollapsed(!collapsed)}
            active={!collapsed || filterCount > 0}
            badge={filterCount}
            expanded={!collapsed}
          />
          <RailIcon
            label="Layers"
            icon={<Icon.Layers size={22} />}
            onClick={() => expandTo(layersRef)}
            active={activeLayerCount > 0}
            badge={activeLayerCount}
          />
          <Box sx={{ flex: 1 }} />
          {/* Reset lives at the foot of the rail: one click restores the filters
              AND the map layers to their defaults (store.resetAll), a clean slate
              without moving the map. Enabled only when something differs. */}
          <RailIcon
            label="Reset"
            icon={<ResetIcon size={22} />}
            onClick={() => useStore.getState().resetAll()}
            active={filterCount > 0 || activeLayerCount !== DEFAULT_ACTIVE_LAYER_IDS.length || [...activeLayerIds].some((id) => !DEFAULT_ACTIVE_LAYER_IDS.includes(id))}
          />
          {/* Account is a low-frequency global utility, parked at the foot of the
              rail so the header stays uncluttered. */}
          {onOpenAttribution && (
            <Box sx={{ borderTop: `1px solid ${SHELL_HAIRLINE}`, mt: 0.5, pt: 0.5, display: "flex", justifyContent: "center" }}>
              <AccountMenu variant="rail" onOpenAttribution={onOpenAttribution} />
            </Box>
          )}
        </Box>
      )}

      {/* In the phone drawer the content fills the drawer at 100% width. On the
          desktop rail it is wrapped in a horizontal Collapse for the expand
          animation; that Collapse must NOT wrap the drawer content, because a
          horizontal Collapse sizes to the content's intrinsic width and would
          overflow the fixed-width drawer. */}
      {inDrawer ? (
        <Box sx={{ width: "100%", minWidth: 0, height: "100%", overflowY: "auto", bgcolor: SHELL_BG, display: "flex", flexDirection: "column" }}>
          {panelContent}
        </Box>
      ) : (
        <Collapse in={!collapsed} orientation="horizontal" timeout={260} easing="cubic-bezier(0.4, 0, 0.2, 1)" sx={{ height: "100%" }}>
          <Box sx={{
            width: PANEL_WIDTH, minWidth: PANEL_WIDTH,
            height: "100%", overflowY: "auto", bgcolor: SHELL_BG,
            borderRight: `1px solid ${SHELL_HAIRLINE}`,
          }}>
            {panelContent}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Panel header + applied filters
// ---------------------------------------------------------------------------
function PanelHeader({ inDrawer, onClose }: { inDrawer: boolean; onClose?: () => void }) {
  const { total } = useFilteredSchools();
  const active = useActiveFilters();
  const setCollapsed = useStore((s) => s.setPanelCollapsed);
  return (
    <Box sx={{
      position: "sticky", top: 0, zIndex: 3, bgcolor: SHELL_BG,
      px: 2.5, py: 1.75, display: "flex", alignItems: "center", justifyContent: "space-between",
      borderBottom: `1px solid ${SHELL_HAIRLINE}`,
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: SHELL_ON, lineHeight: 1.2 }}>Filters</Typography>
        <Typography sx={{ fontSize: 13, color: total === 0 ? STATUS.error : SHELL_DIM, fontWeight: 400, mt: 0.25, fontVariantNumeric: "tabular-nums" }}>
          {total.toLocaleString("en-US")} school{total === 1 ? "" : "s"}{active.length ? ` · ${active.length} filter${active.length === 1 ? "" : "s"}` : ""}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flex: "none" }}>
        <Button size="small" disabled={active.length === 0} onClick={() => useStore.getState().clearAllFilters()} sx={{ color: TEAL, textTransform: "none", fontWeight: 600, minWidth: 0, px: 1, "&.Mui-disabled": { color: SHELL_DIM } }}>
          Clear all
        </Button>
        {/* One close control: the drawer gets an X, the desktop panel closes from
            the same rail Filters button that opened it (so no redundant chevron). */}
        {inDrawer && onClose && (
          <IconButton size="small" onClick={onClose} aria-label="Close filters" sx={{ color: SHELL_ON }}>
            <CloseIcon size={20} />
          </IconButton>
        )}
        {!inDrawer && (
          <IconButton size="small" onClick={() => setCollapsed(true)} aria-label="Close filters" sx={{ color: SHELL_DIM }}>
            <CloseIcon size={18} />
          </IconButton>
        )}
      </Stack>
    </Box>
  );
}

// Phone drawer footer: a sticky primary action that applies-and-returns. Reads
// the live filtered total so the label previews the result set.
function DrawerDone({ onDone }: { onDone?: () => void }) {
  const { total } = useFilteredSchools();
  return (
    <Box sx={{
      position: "sticky", bottom: 0, zIndex: 4, bgcolor: SHELL_BG,
      borderTop: `1px solid ${SHELL_HAIRLINE}`, px: 2.5, py: 1.5,
    }}>
      <Button
        fullWidth variant="contained" onClick={onDone} disableElevation
        disabled={total === 0}
        sx={{ textTransform: "none", fontWeight: 700, py: 1.15, fontSize: 14 }}
      >
        Show {total.toLocaleString("en-US")} school{total === 1 ? "" : "s"}
      </Button>
    </Box>
  );
}

// Applied-filters summary: dismissible chips for every active filter, so the
// current state is visible even when its facet is scrolled off screen.
function AppliedFilters() {
  const filters = useActiveFilters();
  if (filters.length === 0) return null;
  return (
    <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${SHELL_HAIRLINE}`, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {filters.map((f) => (
        <Chip
          key={f.key}
          label={f.label}
          size="small"
          onDelete={f.onClear}
          deleteIcon={<Box component="span" sx={{ fontSize: 14, lineHeight: 1, pr: 0.25 }}>×</Box>}
          sx={{
            height: 24, fontSize: 12, fontWeight: 600, maxWidth: "100%",
            color: f.section === "Geography" ? "#5B21B6" : ACCENT_TEXT,
            bgcolor: f.section === "Geography" ? alpha("#7E57C2", 0.1) : alpha(TEAL, 0.1),
            border: `1px solid ${f.section === "Geography" ? alpha("#7E57C2", 0.3) : alpha(TEAL, 0.3)}`,
            "& .MuiChip-label": { px: 1 },
            "& .MuiChip-deleteIcon": { color: "inherit", opacity: 0.7, "&:hover": { opacity: 1 } },
          }}
        />
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Pick schools / isolate: hand-pick an arbitrary set of schools and (optionally)
// clear the map down to just them. The picks are built here (search-to-add) or by
// clicking a marker and using the inspector's "Add to my map". Isolate is a hard
// override in passesFilters, so this facet sits first and reads as its own tool.
// ---------------------------------------------------------------------------
function matchPickOptions(all: SchoolFeature[], raw: string, picked: Set<string>): SchoolFeature[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ f: SchoolFeature; score: number }> = [];
  for (const f of all) {
    if (picked.has(f.properties.msid)) continue; // already picked, do not re-offer
    const name = f.properties.name.toLowerCase();
    const msid = f.properties.msid.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 80;
    else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name)) score = 65;
    else if (msid.startsWith(q)) score = 50;
    else if (name.includes(q)) score = 30;
    else if (msid.includes(q)) score = 20;
    if (score >= 0) scored.push({ f, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.f.properties.name.length - b.f.properties.name.length || a.f.properties.name.localeCompare(b.f.properties.name))
    .slice(0, 24)
    .map((m) => m.f);
}

// The School of Hope cohorts a quick-add chip can drop into the pick set in one
// click. Several (Success co-locations, KIPP requested buildings) are host
// district schools whose NAMES give no hint, so they cannot be found by typing
// "Success"/"KIPP" in the search; the chip is the only practical way to pick them
// as a group. Classified by the same sohMarker() the map markers use.
interface SohCohort { key: string; label: string; msids: string[]; }
function sohCohorts(all: SchoolFeature[]): SohCohort[] {
  const mater: string[] = [], kippCurrent: string[] = [], kippRequested: string[] = [], success: string[] = [];
  for (const f of all) {
    const { msid, name } = f.properties;
    if (isSuccessColocation(msid)) { success.push(msid); continue; } // starred, but its own cohort
    const m = sohMarker(name, msid);
    if (m === "kipp-current") kippCurrent.push(msid);
    else if (m === "kipp-requested") kippRequested.push(msid);
    else if (m === "star") mater.push(msid); // Mater and any other non-KIPP operator
  }
  const out: SohCohort[] = [];
  if (mater.length) out.push({ key: "mater", label: "Mater sites", msids: mater });
  if (kippCurrent.length) out.push({ key: "kippCurrent", label: "KIPP campuses", msids: kippCurrent });
  if (kippRequested.length) out.push({ key: "kippRequested", label: "KIPP requested", msids: kippRequested });
  if (success.length) out.push({ key: "success", label: "Success sites", msids: success });
  return out;
}

function PickSchoolsFacet() {
  const { schools } = useData();
  const pickedMsids = useStore((s) => s.pickedMsids);
  const addPicked = useStore((s) => s.addPicked);
  const removePicked = useStore((s) => s.removePicked);
  const addPickedMany = useStore((s) => s.addPickedMany);
  const removePickedMany = useStore((s) => s.removePickedMany);
  const clearPicked = useStore((s) => s.clearPicked);
  const isolatePicked = useStore((s) => s.isolatePicked);
  const setIsolatePicked = useStore((s) => s.setIsolatePicked);
  const selectSchool = useStore((s) => s.selectSchool);
  const setMapView = useStore((s) => s.setMapView);

  const all = useMemo(() => schools?.features ?? [], [schools]);
  const [query, setQuery] = useState("");
  const options = useMemo(() => matchPickOptions(all, query, pickedMsids), [all, query, pickedMsids]);
  const pickedList = useMemo(() => all.filter((f) => pickedMsids.has(f.properties.msid)), [all, pickedMsids]);
  const cohorts = useMemo(() => sohCohorts(all), [all]);
  const count = pickedMsids.size;

  const goTo = (f: SchoolFeature) => {
    const [lng, lat] = f.geometry.coordinates as [number, number];
    selectSchool(f.properties.msid);
    setMapView({ lat, lng }, 15);
    panMapTo({ lat, lng }, 15);
  };

  return (
    <Box sx={{ px: 2.5, py: 1.75, bgcolor: alpha(TEAL, 0.045) }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
          <Box sx={{ color: SHELL_DIM, display: "flex" }}><PickIcon size={15} /></Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: SHELL_ON, letterSpacing: 0 }}>Pick schools</Typography>
          {count ? <Chip label={count} size="small" sx={{ height: 16, fontSize: 11, fontWeight: 600, bgcolor: alpha(TEAL, 0.14), color: ACCENT_TEXT, "& .MuiChip-label": { px: 0.75 } }} /> : null}
        </Stack>
        {count ? (
          <Button size="small" onClick={clearPicked} sx={{ color: TEAL, minWidth: 0, p: 0, fontSize: 12, textTransform: "none", fontWeight: 600 }}>Clear</Button>
        ) : null}
      </Stack>

      {/* The isolate toggle: on = map/list/counts show ONLY the picks. Allowed with
          zero picks (that is the "clear the map" state), with a helper line below. */}
      <Box component="label" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", py: 0.25 }}>
        <Typography sx={{ fontSize: 13, fontWeight: isolatePicked ? 600 : 500, color: SHELL_ON }}>
          Show only picked schools
        </Typography>
        <Switch
          size="small"
          checked={isolatePicked}
          onChange={(e) => setIsolatePicked(e.target.checked)}
          sx={{ "& .MuiSwitch-switchBase.Mui-checked": { color: TEAL }, "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: TEAL } }}
        />
      </Box>
      <Typography sx={{ fontSize: 12, color: isolatePicked && count === 0 ? STATUS.error : SHELL_DIM, lineHeight: 1.5, mb: 1 }}>
        {isolatePicked
          ? (count === 0
              ? "The map is cleared. Add schools below, or click any marker and choose “Add to my map.”"
              : "Showing only your picks. Other filters are paused while this is on.")
          : "Add schools to build a list, then turn this on to show only them."}
      </Typography>

      <Autocomplete
        size="small"
        options={options}
        value={null}
        inputValue={query}
        onInputChange={(_, v, reason) => { if (reason !== "reset") setQuery(v); }}
        filterOptions={(x) => x}
        getOptionLabel={(o) => o.properties.name}
        isOptionEqualToValue={(a, b) => a.properties.msid === b.properties.msid}
        noOptionsText={query.trim() ? "No matches" : "Type a school name or MSID"}
        onChange={(_, v) => { if (v) { addPicked(v.properties.msid); setQuery(""); } }}
        renderOption={(props, o) => (
          <li {...props} key={o.properties.msid}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: SHELL_ON, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.properties.name}</Typography>
              <Typography sx={{ fontSize: 11, color: SHELL_DIM }}>{o.properties.county}, {o.properties.level}, <Box component="span" className="mono">{o.properties.msid}</Box></Typography>
            </Box>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Add a school by name or MSID"
            InputProps={{ ...params.InputProps, startAdornment: <InputAdornment position="start" sx={{ color: SHELL_DIM }}><AddIcon size={14} /></InputAdornment> }}
            inputProps={{ ...params.inputProps, style: { fontSize: 13 } }}
          />
        )}
      />

      {cohorts.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <Typography sx={{ fontSize: 12, color: SHELL_DIM, mb: 0.5 }}>Quick add a group</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {cohorts.map((c) => {
              const allIn = c.msids.every((m) => pickedMsids.has(m));
              return (
                <Chip
                  key={c.key}
                  label={`${c.label} (${c.msids.length})`}
                  size="small"
                  icon={allIn ? undefined : <Box component="span" sx={{ display: "flex", ml: 0.5 }}><AddIcon size={12} /></Box>}
                  onClick={() => (allIn ? removePickedMany(c.msids) : addPickedMany(c.msids))}
                  title={allIn ? `Remove these ${c.msids.length} from your picks` : `Add these ${c.msids.length} to your picks`}
                  sx={{
                    height: 24, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    color: allIn ? "#fff" : ACCENT_TEXT,
                    border: `1px solid ${allIn ? TEAL : alpha(TEAL, 0.3)}`,
                    "& .MuiChip-label": { px: 0.75 },
                    // Double-& to outrank MUI Chip's own compound-selector background.
                    "&&": { backgroundColor: allIn ? TEAL : alpha(TEAL, 0.1) },
                    "&&:hover": { backgroundColor: allIn ? TEAL : alpha(TEAL, 0.18) },
                  }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {pickedList.length > 0 && (
        <Stack sx={{ mt: 1 }}>
          {pickedList.map((f) => (
            <Box key={f.properties.msid} sx={{ display: "flex", alignItems: "center", gap: 0.5, py: 0.15 }}>
              <Box
                component="button"
                onClick={() => goTo(f)}
                title={`Zoom to ${f.properties.name}`}
                sx={{ flex: 1, minWidth: 0, textAlign: "left", appearance: "none", border: "none", bgcolor: "transparent", cursor: "pointer", p: 0.25, borderRadius: 1, color: SHELL_ON, "&:hover": { bgcolor: alpha(SHELL_ON, 0.04) } }}
              >
                <Typography sx={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.properties.name}</Typography>
                <Typography sx={{ fontSize: 11, color: SHELL_DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.properties.county}, {f.properties.level}</Typography>
              </Box>
              <IconButton size="small" aria-label={`Remove ${f.properties.name}`} onClick={() => removePicked(f.properties.msid)} sx={{ color: SHELL_DIM, flex: "none", "&:hover": { color: STATUS.error } }}>
                <CloseIcon size={16} />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Geography facet (counties) with per-county counts + zoom-to
// ---------------------------------------------------------------------------
function GeographyFacet({ onNavigate }: { onNavigate?: () => void }) {
  const counts = useFacetCounts().county;
  const countySelection = useStore((s) => s.countySelection);
  const toggleCounty = useStore((s) => s.toggleCounty);
  const setCounties = useStore((s) => s.setCounties);
  const setMapView = useStore((s) => s.setMapView);
  const allSelected = countySelection.size === ALL_COUNTIES.length;

  const focus = (c: CountyName) => {
    const v = countyCenter(c);
    setMapView(v.center, v.zoom);
    panMapTo(v.center, v.zoom);
    onNavigate?.();
  };

  return (
    <FacetSection
      title="County"
      icon={<LocationIcon size={15} />}
      onClear={allSelected ? undefined : () => setCounties(ALL_COUNTIES)}
      clearLabel="All"
    >
      <Stack>
        {ALL_COUNTIES.map((c) => (
          <Box key={c} sx={{ display: "flex", alignItems: "center" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <CheckboxRow
                label={c}
                checked={countySelection.has(c)}
                count={counts[c] ?? 0}
                onToggle={() => toggleCounty(c)}
              />
            </Box>
            <Tooltip title={`Zoom to ${c}`} placement="left">
              <IconButton size="small" onClick={() => focus(c)} aria-label={`Zoom to ${c}`} sx={{ color: SHELL_DIM, ml: 0.5, "&:hover": { color: TEAL } }}>
                <ZoomToIcon size={15} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Stack>
      {countySelection.size === 0 && (
        <Typography sx={{ fontSize: 12, color: STATUS.error, bgcolor: alpha(STATUS.error, 0.06), border: `1px solid ${alpha(STATUS.error, 0.25)}`, borderRadius: 1, px: 1, py: 0.75, mt: 1, lineHeight: 1.5 }}>
          No counties selected, so the map is empty. Pick at least one county.
        </Typography>
      )}
    </FacetSection>
  );
}

// ---------------------------------------------------------------------------
// School facets (all checkbox facets + the district picker under "More")
// ---------------------------------------------------------------------------
function SchoolFacets() {
  const { all } = useFilteredSchools();
  const counts = useFacetCounts();

  const gradeSelection = useStore((s) => s.gradeSelection);
  const toggleGrade = useStore((s) => s.toggleGrade);
  const clearGrades = useStore((s) => s.clearGrades);
  const levelSelection = useStore((s) => s.levelSelection);
  const toggleLevel = useStore((s) => s.toggleLevel);
  const clearLevels = useStore((s) => s.clearLevels);
  const typeSelection = useStore((s) => s.typeSelection);
  const toggleType = useStore((s) => s.toggleType);
  const clearTypes = useStore((s) => s.clearTypes);
  const titleISelection = useStore((s) => s.titleISelection);
  const toggleTitleI = useStore((s) => s.toggleTitleI);
  const clearTitleI = useStore((s) => s.clearTitleI);
  const plpOnly = useStore((s) => s.plpOnly);
  const setPlpOnly = useStore((s) => s.setPlpOnly);
  const coLocationOnly = useStore((s) => s.coLocationOnly);
  const setCoLocationOnly = useStore((s) => s.setCoLocationOnly);
  const facilityUseSelection = useStore((s) => s.facilityUseSelection);
  const toggleFacilityUse = useStore((s) => s.toggleFacilityUse);
  const clearFacilityUse = useStore((s) => s.clearFacilityUse);
  const utilMin = useStore((s) => s.utilMin);
  const utilMax = useStore((s) => s.utilMax);
  const setUtilRange = useStore((s) => s.setUtilRange);
  const utilRangeActive = utilMin != null || utilMax != null;
  const frlMin = useStore((s) => s.frlMin);
  const frlMax = useStore((s) => s.frlMax);
  const setFrlRange = useStore((s) => s.setFrlRange);
  const frlRangeActive = frlMin != null || frlMax != null;

  // Only offer options that actually occur in the loaded data.
  const presentLevels = SCHOOL_LEVELS.filter((l) => all.some((f) => f.properties.level === l));
  const presentTypes = SCHOOL_TYPES.filter((t) => all.some((f) => f.properties.type === t));
  const presentGrades = new Set(all.map((f) => f.properties.current_grade));
  const otherGradeCount = OTHER_GRADES.reduce((n, g) => n + (counts.grade[g] ?? 0), 0);
  const otherGradesPresent = OTHER_GRADES.some((g) => presentGrades.has(g));
  const otherGradesAllOn = OTHER_GRADES.filter((g) => presentGrades.has(g)).every((g) => gradeSelection.has(g)) && OTHER_GRADES.some((g) => gradeSelection.has(g));

  const designationActive = (plpOnly ? 1 : 0) + (coLocationOnly ? 1 : 0);

  return (
    <>
      {/* Eligibility facets first (the tool's purpose): designation, then the
          facility-use and Title I tests that drive co-location and SoH siting. */}
      <FacetSection
        title="Designation"
        icon={<StarIcon size={15} />}
        info="Persistently low-performing schools and co-location candidates."
        activeCount={designationActive}
        onClear={designationActive ? () => { setPlpOnly(false); setCoLocationOnly(false); } : undefined}
      >
        <CheckboxRow
          label="Persistently low-performing"
          checked={plpOnly}
          count={counts.plp}
          onToggle={() => setPlpOnly(!plpOnly)}
          swatch={<Dot color="#D32F2F" hollow />}
        />
        <CheckboxRow
          label="Co-location candidate"
          checked={coLocationOnly}
          count={counts.coloc}
          onToggle={() => setCoLocationOnly(!coLocationOnly)}
          swatch={<Dot color="#0D9488" hollow />}
        />
      </FacetSection>

      <FacetDivider />

      {/* Facility use: the statutory tiers as quick presets, plus a CUSTOM % band
          for precise thresholds the tiers cannot express (e.g. "below 55%"). */}
      <FacetSection
        title="Facility use"
        icon={<BuildingIcon size={15} />}
        info="Enrollment against the state's student-station capacity."
        activeCount={facilityUseSelection.size + (utilRangeActive ? 1 : 0)}
        onClear={(facilityUseSelection.size || utilRangeActive) ? () => { clearFacilityUse(); setUtilRange(null, null); } : undefined}
      >
        {FACILITY_USE_TIERS.map((tier) => (
          <CheckboxRow
            key={tier.key}
            label={<Box component="span">{tier.label} <Box component="span" sx={{ color: SHELL_DIM, fontWeight: 400 }}>· {tier.hint}</Box></Box>}
            checked={facilityUseSelection.has(tier.key)}
            count={counts.facility[tier.key] ?? 0}
            onToggle={() => toggleFacilityUse(tier.key)}
            swatch={<Dot color={tier.color} />}
          />
        ))}
        <Box sx={{ mt: 1, pl: 0.25 }}>
          <Typography sx={{ fontSize: 12, color: SHELL_DIM, mb: 0.5 }}>Custom range (% of capacity)</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <TextField
              size="small" type="number" placeholder="Min"
              value={utilMin ?? ""}
              onChange={(e) => { const v = e.target.value; setUtilRange(v === "" ? null : Math.max(0, Number(v)), utilMax); }}
              InputProps={{ endAdornment: <InputAdornment position="end" sx={{ "& p": { fontSize: 12 } }}>%</InputAdornment> }}
              inputProps={{ min: 0, "aria-label": "Minimum utilization percent", style: { fontSize: 13, padding: "6px 8px" } }}
              sx={{ width: 92 }}
            />
            <Typography sx={{ fontSize: 13, color: SHELL_DIM }}>to</Typography>
            <TextField
              size="small" type="number" placeholder="Max"
              value={utilMax ?? ""}
              onChange={(e) => { const v = e.target.value; setUtilRange(utilMin, v === "" ? null : Math.max(0, Number(v))); }}
              InputProps={{ endAdornment: <InputAdornment position="end" sx={{ "& p": { fontSize: 12 } }}>%</InputAdornment> }}
              inputProps={{ min: 0, "aria-label": "Maximum utilization percent", style: { fontSize: 13, padding: "6px 8px" } }}
              sx={{ width: 92 }}
            />
          </Stack>
        </Box>
      </FacetSection>

      <FacetDivider />

      {/* Title I */}
      <FacetSection
        title="Title I"
        icon={<MoneyIcon size={15} />}
        info="Title I eligibility (FL DOE Title I Part A list, 2025-26)."
        activeCount={titleISelection.size}
        onClear={titleISelection.size ? clearTitleI : undefined}
      >
        {TITLE_I_STATES.map((t) => (
          <CheckboxRow key={t} label={titleILabel(t)} checked={titleISelection.has(t)} count={counts.titleI[t] ?? 0} onToggle={() => toggleTitleI(t)} />
        ))}
      </FacetSection>

      <FacetDivider />

      {/* Free/reduced-price lunch: the real student-poverty rate (a range band, so
          an analyst can target the highest-need schools, e.g. "at or above 75%").
          Schools with no reported rate drop out when a bound is set. */}
      <FacetSection
        title="Free/reduced-price lunch"
        icon={<MealIcon size={15} />}
        info="Share of students certified for free or reduced-price meals (FL DOE Fall Survey 2, 2025-26)."
        activeCount={frlRangeActive ? 1 : 0}
        onClear={frlRangeActive ? () => setFrlRange(null, null) : undefined}
      >
        <Box sx={{ pl: 0.25 }}>
          <Typography sx={{ fontSize: 12, color: SHELL_DIM, mb: 0.5 }}>Custom range (% of students)</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <TextField
              size="small" type="number" placeholder="Min"
              value={frlMin ?? ""}
              onChange={(e) => { const v = e.target.value; setFrlRange(v === "" ? null : Math.min(100, Math.max(0, Number(v))), frlMax); }}
              InputProps={{ endAdornment: <InputAdornment position="end" sx={{ "& p": { fontSize: 12 } }}>%</InputAdornment> }}
              inputProps={{ min: 0, max: 100, "aria-label": "Minimum free/reduced-price lunch percent", style: { fontSize: 13, padding: "6px 8px" } }}
              sx={{ width: 92 }}
            />
            <Typography sx={{ fontSize: 13, color: SHELL_DIM }}>to</Typography>
            <TextField
              size="small" type="number" placeholder="Max"
              value={frlMax ?? ""}
              onChange={(e) => { const v = e.target.value; setFrlRange(frlMin, v === "" ? null : Math.min(100, Math.max(0, Number(v)))); }}
              InputProps={{ endAdornment: <InputAdornment position="end" sx={{ "& p": { fontSize: 12 } }}>%</InputAdornment> }}
              inputProps={{ min: 0, max: 100, "aria-label": "Maximum free/reduced-price lunch percent", style: { fontSize: 13, padding: "6px 8px" } }}
              sx={{ width: 92 }}
            />
          </Stack>
        </Box>
      </FacetSection>

      <FacetDivider />

      {/* Letter grade */}
      <FacetSection
        title="Letter grade"
        icon={<ReportIcon size={15} />}
        info="Florida DOE A-F school grade."
        activeCount={gradeSelection.size}
        onClear={gradeSelection.size ? clearGrades : undefined}
      >
        {RATING_GRADES.filter((g) => presentGrades.has(g)).map((g) => {
          const st = resolveGradeStyle(g);
          return (
            <CheckboxRow
              key={g}
              label={st.description}
              checked={gradeSelection.has(g)}
              count={counts.grade[g] ?? 0}
              onToggle={() => toggleGrade(g)}
              swatch={<GradeSwatch grade={g} />}
            />
          );
        })}
        {otherGradesPresent && (
          <CheckboxRow
            label="Not rated"
            checked={otherGradesAllOn}
            count={otherGradeCount}
            onToggle={() => {
              const anyOn = OTHER_GRADES.some((g) => gradeSelection.has(g));
              OTHER_GRADES.forEach((g) => { if (presentGrades.has(g)) { if (anyOn && gradeSelection.has(g)) toggleGrade(g); else if (!anyOn) toggleGrade(g); } });
            }}
            swatch={<GradeSwatch grade="NR" />}
          />
        )}
      </FacetSection>

      <FacetDivider />

      {/* School level */}
      <FacetSection title="School level" icon={<EducationIcon size={15} />} activeCount={levelSelection.size} onClear={levelSelection.size ? clearLevels : undefined}>
        {presentLevels.map((l) => (
          <CheckboxRow key={l} label={l} checked={levelSelection.has(l)} count={counts.level[l] ?? 0} onToggle={() => toggleLevel(l)} />
        ))}
      </FacetSection>

      <FacetDivider />

      {/* School type */}
      <FacetSection title="School type" icon={<CategoriesIcon size={15} />} activeCount={typeSelection.size} onClear={typeSelection.size ? clearTypes : undefined}>
        {presentTypes.map((t) => (
          <CheckboxRow key={t} label={schoolTypeLabel(t)} checked={typeSelection.size === 0 || typeSelection.has(t)} count={counts.type[t] ?? 0} onToggle={() => toggleType(t)} />
        ))}
      </FacetSection>

      <FacetDivider />

      {/* District picker behind a disclosure (too many options for checkboxes) */}
      <DistrictFacet />
    </>
  );
}

// The board / legislative district picker: a large, hierarchical facet, so it
// keeps a segmented kind selector + a searchable dropdown, disclosed on demand.
function DistrictFacet() {
  const { schoolDistricts } = useData();
  const districtFilter = useStore((s) => s.districtFilter);
  const setDistrictFilter = useStore((s) => s.setDistrictFilter);
  const [districtKind, setDistrictKind] = useState<DistrictKind>(districtFilter?.kind ?? "board");
  const [open, setOpen] = useState(Boolean(districtFilter));
  const districtOptions = schoolDistricts.options[districtKind];
  const districtValue = districtFilter && districtFilter.kind === districtKind ? districtFilter.value : "";

  return (
    <Box sx={{ px: 2.5, py: 1.75 }}>
      <Button
        fullWidth
        onClick={() => setOpen((v) => !v)}
        sx={{ justifyContent: "flex-start", textTransform: "none", fontWeight: 600, fontSize: 13, color: SHELL_ON, px: 0.25, py: 0.25, letterSpacing: 0, gap: 0.75, "& .MuiButton-startIcon": { m: 0 } }}
        startIcon={<Box sx={{ color: SHELL_DIM, display: "flex" }}><MapBoundaryIcon size={15} /></Box>}
      >
        <Box component="span" sx={{ flex: 1, textAlign: "left" }}>Board &amp; legislative districts{districtFilter ? " (1)" : ""}</Box>
        {open ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}
      </Button>
      <Collapse in={open}>
        <Box sx={{ pt: 1 }}>
          <ToggleButtonGroup
            exclusive size="small" value={districtKind}
            onChange={(_, v: DistrictKind | null) => { if (v) { setDistrictKind(v); if (districtFilter && districtFilter.kind !== v) setDistrictFilter(null); } }}
            sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5, width: "100%", mb: 1 }}
          >
            {DISTRICT_KINDS.map((k) => (
              <ToggleButton key={k.kind} value={k.kind}
                sx={{ border: `1px solid ${SHELL_HAIRLINE} !important`, borderRadius: "0 !important", py: 0.5, fontSize: 11, fontWeight: 600, textTransform: "none", color: SHELL_DIM, "&.Mui-selected": { bgcolor: alpha(TEAL, 0.14), color: ACCENT_TEXT } }}
              >
                {k.short}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {districtOptions.length === 0 ? (
            <Typography sx={{ fontSize: 11, color: SHELL_DIM, fontStyle: "italic" }}>
              No {DISTRICT_KINDS.find((k) => k.kind === districtKind)?.label.toLowerCase()} district data for the loaded schools.
            </Typography>
          ) : (
            <Select
              fullWidth size="small" displayEmpty value={districtValue}
              onChange={(e) => { const v = e.target.value as string; setDistrictFilter(v ? { kind: districtKind, value: v } : null); }}
              sx={{ fontSize: 13, ".MuiSelect-select": { py: 0.85 } }}
              MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
            >
              <MenuItem value=""><em>All districts</em></MenuItem>
              {districtOptions.map((o) => (
                <MenuItem key={o.value} value={o.value} sx={{ fontSize: 13 }}>
                  {o.label} <Box component="span" sx={{ color: SHELL_DIM, ml: 0.5 }}>({o.count})</Box>
                </MenuItem>
              ))}
            </Select>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Map layers (unchanged: display overlays, grouped)
// ---------------------------------------------------------------------------
function MapLayersSection() {
  const activeLayerIds = useStore((s) => s.activeLayerIds);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const data = useData();

  const dataReady = (l: MapLayerDef) => {
    if (!l.needs) return true;
    return (data as unknown as Record<string, unknown>)[l.needs] != null;
  };

  return (
    <Box sx={{ mt: 1 }}>
      {mapLayersByGroup().map(({ group, layers }) => (
        <Box key={group} sx={{ mb: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.25, color: SHELL_DIM }}>
            {LAYER_GROUP_ICON[group]}
            <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "none", letterSpacing: 0.16 }}>{group}</Typography>
          </Stack>
          <Stack>
            {layers.map((l) => {
              const on = activeLayerIds.has(l.id);
              const ready = dataReady(l);
              return (
                <Tooltip key={l.id} title={ready ? l.description : `${l.description} (data unavailable in this build)`} placement="right">
                  <Box sx={{ opacity: ready ? 1 : 0.5 }}>
                    <CheckboxRow
                      label={l.label}
                      checked={on && ready}
                      onToggle={() => { if (ready) toggleLayer(l.id); }}
                      swatch={<Swatch def={l} />}
                    />
                  </Box>
                </Tooltip>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Box>
  );
}

function Swatch({ def }: { def: MapLayerDef }) {
  const { kind, color } = def.swatch;
  if (kind === "dot") return <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: color, flex: "none" }} />;
  if (kind === "outline") return <Box sx={{ width: 12, height: 12, borderRadius: 0.5, border: `2px solid ${color}`, flex: "none" }} />;
  return <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: alpha(color, 0.85), flex: "none" }} />;
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

// One checkbox facet row: the whole row is the toggle; the checkbox is a visual
// affordance; an optional leading swatch and a right-aligned result count.
function CheckboxRow({ label, checked, count, onToggle, swatch }: {
  label: React.ReactNode; checked: boolean; count?: number; onToggle: () => void; swatch?: React.ReactNode;
}) {
  return (
    <Box
      component="button"
      onClick={onToggle}
      aria-pressed={checked}
      sx={{
        appearance: "none", font: "inherit", textAlign: "left", width: "100%", border: "none",
        bgcolor: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 0.25,
        px: 0.25, py: 0.15, borderRadius: 1, color: SHELL_ON,
        "&:hover": { bgcolor: alpha(SHELL_ON, 0.04) },
        "&:focus-visible": { outline: `2px solid ${TEAL}`, outlineOffset: -2 },
      }}
    >
      <Checkbox size="small" checked={checked} tabIndex={-1} disableRipple sx={{ py: 0.35, color: SHELL_DIM, "&.Mui-checked": { color: TEAL } }} />
      {swatch}
      <Typography component="span" sx={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: checked ? 600 : 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ml: swatch ? 0.75 : 0.25 }}>
        {label}
      </Typography>
      {count != null && (
        <Typography component="span" sx={{ fontSize: 12, color: SHELL_DIM, fontVariantNumeric: "tabular-nums", pl: 0.75, flex: "none" }}>
          {count.toLocaleString("en-US")}
        </Typography>
      )}
    </Box>
  );
}

function Dot({ color, hollow }: { color: string; hollow?: boolean }) {
  return <Box sx={{ width: 9, height: 9, borderRadius: "50%", flex: "none", border: hollow ? `2px solid ${color}` : "none", bgcolor: hollow ? alpha(color, 0.15) : color }} />;
}

function GradeSwatch({ grade }: { grade: Grade }) {
  const st = resolveGradeStyle(grade);
  return (
    <Box sx={{
      width: 20, height: 20, borderRadius: 0.5, flex: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 800,
      bgcolor: rgbaToCss(st.fill), color: rgbaToCss(st.letterColor),
      border: `1.25px ${st.dashed ? "dashed" : "solid"} ${rgbaToCss(st.stroke)}`,
    }}>{st.letter}</Box>
  );
}

// A collapsible filter facet. The header row toggles the body open/closed so the
// analyst can fold facets they are done with and keep the drawer scannable; an
// active facet stays visibly counted in its header even when collapsed. Defaults
// to open. `onClear` and the info tooltip are independent of the toggle.
function FacetSection({ title, icon, info, activeCount, onClear, clearLabel, children, defaultOpen = true }: {
  title: string; icon?: React.ReactNode; info?: string; activeCount?: number; onClear?: () => void; clearLabel?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ px: 2.5, py: 1.75 }}>
      <FilterLabel title={title} icon={icon} info={info} activeCount={activeCount} onClear={onClear} clearLabel={clearLabel} open={open} onToggle={() => setOpen((v) => !v)} />
      <Collapse in={open} timeout={200}>
        <Stack sx={{ mt: 0.5 }}>{children}</Stack>
      </Collapse>
    </Box>
  );
}

function FacetDivider() {
  return <Divider sx={{ borderColor: alpha(SHELL_ON, 0.06), mx: 2.5 }} />;
}

// A section header for a filter facet. Hierarchy comes from weight + color (a
// SHELL_ON 600 title over SHELL_ON 400 rows), not font-size games; the leading
// icon aids scanning. See 07_CONTENT_STYLE.md.
function FilterLabel({ title, icon, onClear, activeCount, info, clearLabel = "Clear", open, onToggle }: {
  title: string; icon?: React.ReactNode; onClear?: () => void; activeCount?: number; info?: string; clearLabel?: string; open?: boolean; onToggle?: () => void;
}) {
  const collapsible = Boolean(onToggle);
  const head = (
    <>
      {collapsible && (
        <Box sx={{ color: SHELL_DIM, display: "flex", flex: "none", mr: -0.25 }}>
          {open ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}
        </Box>
      )}
      {icon && <Box sx={{ color: SHELL_DIM, display: "flex", flex: "none" }}>{icon}</Box>}
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: SHELL_ON, letterSpacing: 0 }}>
        {title}
      </Typography>
    </>
  );
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
        {collapsible ? (
          <Box component="button" type="button" onClick={onToggle} aria-expanded={open}
            sx={{ appearance: "none", font: "inherit", border: "none", bgcolor: "transparent", p: 0, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, color: SHELL_ON,
              "&:focus-visible": { outline: `2px solid ${TEAL}`, outlineOffset: 2 } }}>
            {head}
          </Box>
        ) : head}
        {info && (
          <Tooltip title={info} placement="right">
            <Box sx={{ color: SHELL_DIM, display: "flex", cursor: "help" }}><Icon.Info size={13} /></Box>
          </Tooltip>
        )}
        {activeCount ? <Chip label={activeCount} size="small" sx={{ height: 16, fontSize: 11, fontWeight: 600, bgcolor: alpha(TEAL, 0.14), color: ACCENT_TEXT, "& .MuiChip-label": { px: 0.75 } }} /> : null}
      </Stack>
      {onClear && (
        <Button size="small" onClick={onClear} sx={{ color: TEAL, minWidth: 0, p: 0, fontSize: 12, textTransform: "none", fontWeight: 600, flex: "none" }}>
          {clearLabel}
        </Button>
      )}
    </Stack>
  );
}

function SectionHeader({ title, activeCount, onReset }: { title: string; activeCount?: number; onReset?: () => void }) {
  return (
    <Box sx={{ mb: 0.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ color: SHELL_DIM, display: "flex" }}><Icon.Layers size={15} /></Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: SHELL_ON, letterSpacing: 0 }}>
            {title}
          </Typography>
          {/* Count as the same small chip every facet header uses, so the map-layers
              tally reads consistently with Designation, Facility use, etc. */}
          {activeCount ? <Chip label={activeCount} size="small" sx={{ height: 16, fontSize: 11, fontWeight: 600, bgcolor: alpha(TEAL, 0.14), color: ACCENT_TEXT, "& .MuiChip-label": { px: 0.75 } }} /> : null}
        </Stack>
        {onReset && (
          <Button size="small" onClick={onReset} sx={{ color: TEAL, minWidth: 0, p: 0, fontSize: 12, textTransform: "none", fontWeight: 600 }}>
            Reset
          </Button>
        )}
      </Stack>
    </Box>
  );
}

// A Carbon-style side-nav rail item: icon over a short label, with a left accent
// bar and tinted surface when active.
function RailIcon({ label, icon, onClick, active, badge, expanded }: { label: string; icon: React.ReactNode; onClick: () => void; active?: boolean; badge?: number; expanded?: boolean }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      aria-expanded={expanded}
      sx={{
        position: "relative", appearance: "none", font: "inherit", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 0.4,
        width: "100%", py: 1.1, border: "none",
        color: active ? ACCENT : SHELL_DIM,
        bgcolor: active ? alpha(ACCENT, 0.1) : "transparent",
        "&::before": active
          ? { content: '""', position: "absolute", left: 0, top: 0, bottom: 0, width: 3, bgcolor: ACCENT }
          : {},
        "&:hover": { bgcolor: active ? alpha(ACCENT, 0.14) : alpha(SHELL_ON, 0.06), color: active ? ACCENT : SHELL_ON },
        "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: -2 },
      }}
    >
      <Badge badgeContent={badge && badge > 0 ? badge : 0} color="primary" overlap="circular"
        sx={{ "& .MuiBadge-badge": { fontSize: 9, height: 14, minWidth: 14, display: badge && badge > 0 ? "flex" : "none" } }}>
        {icon}
      </Badge>
      <Typography sx={{ fontSize: 10, fontWeight: active ? 600 : 400, lineHeight: 1.1, letterSpacing: 0 }}>
        {label}
      </Typography>
    </Box>
  );
}
