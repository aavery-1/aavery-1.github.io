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
//
// Real Carbon: ComboBox, Toggle, Select, Tooltip, IconButton and DismissibleTag
// from @carbon/react; everything else is plain elements styled in
// LeftRail.carbon.css with Carbon tokens. No em dashes in this file.

import { ComboBox, IconButton, Select, SelectItem, TextInput, Toggle, Tooltip } from "@carbon/react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  Close as CloseIcon, Location as LocationIcon, Star as StarIcon,
  Building as BuildingIcon, Money as MoneyIcon, Categories as CategoriesIcon,
  Education as EducationIcon, Report as ReportIcon, MapBoundary as MapBoundaryIcon,
  ZoomIn as ZoomToIcon, Filter as FilterFunnelIcon, Reset as ResetIcon,
  Restaurant as MealIcon, View as PickIcon, Add as AddIcon,
} from "@carbon/icons-react";
import { useStore, ALL_COUNTIES, FACILITY_USE_TIERS, utilizationStyle, type FacilityUseKey, type LatLng } from "../store";
import { DEFAULT_ACTIVE_LAYER_IDS } from "../config/mapLayers";
import { COUNTY_BBOX } from "../geo/countyBounds";
import { panMapTo } from "../map/mapController";
import { resolveGradeStyle, rgbaToCss, type Grade } from "../map/gradeEncoding";
import { mapLayersByGroup, type MapLayerDef, type MapLayerGroup } from "../config/mapLayers";
import { tint } from "../ui/tokens";
import { FilterChip } from "../ui/FilterChip";
import { Icon } from "../ui/icons";
import { useData } from "../data/DataContext";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { passesFilters, type SchoolFilterInput } from "../data/derive/filters";
import { useActiveFilters } from "../status/useActiveFilters";
import { AccountMenu } from "./AccountMenu";
import { DISTRICT_KINDS, type DistrictKind } from "../data/derive/districts";
import {
  SCHOOL_LEVELS, SCHOOL_TYPES, TITLE_I_STATES, schoolTypeLabel, titleILabel, levelFacetLabel,
  type CountyName, type SchoolLevel, type SchoolType, type TitleIState, type SchoolFeature,
} from "../data/types";
import "./LeftRail.carbon.css";

// Rail geometry (64px collapsed rail, 340px panel) lives in LeftRail.carbon.css.

// Letter grades exposed as facet rows (four-plus-F, then the non-standard codes
// grouped as "Not rated").
const RATING_GRADES: Grade[] = ["A", "B", "C", "D", "F"];
const OTHER_GRADES: Grade[] = ["I", "NR", "NG"];

const LAYER_GROUP_ICON: Record<MapLayerGroup, ReactNode> = {
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
      <div ref={layersRef} className={`rail-layers${inDrawer ? " rail-layers--drawer" : ""}`}>
        <SectionHeader
          title="Map layers"
          activeCount={activeLayerCount}
          onReset={activeLayerCount !== DEFAULT_ACTIVE_LAYER_IDS.length || [...activeLayerIds].some((id) => !DEFAULT_ACTIVE_LAYER_IDS.includes(id))
            ? () => useStore.getState().setActiveLayers(DEFAULT_ACTIVE_LAYER_IDS)
            : undefined}
        />
        <MapLayersSection />
      </div>

      {/* In the phone drawer, a sticky primary action doubles as the obvious exit:
          apply-and-return to the map. Filters already apply live, so this simply
          closes the drawer onto the updated results. */}
      {inDrawer && <DrawerDone onDone={onNavigate} />}
    </>
  );

  return (
    <div className="rail">
      {!inDrawer && (
        <nav className="rail-bar" aria-label="Filters and map layers">
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
          <div className="rail-bar__spacer" />
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
            <div className="rail-bar__account">
              <AccountMenu variant="rail" onOpenAttribution={onOpenAttribution} />
            </div>
          )}
        </nav>
      )}

      {/* In the phone drawer the content fills the drawer at 100% width. On the
          desktop rail it is wrapped in a width-animating collapse for the expand
          animation; that collapse must NOT wrap the drawer content, because it
          is sized to the panel's fixed width and would
          overflow the fixed-width drawer. */}
      {inDrawer ? (
        <div className="rail-drawer-body">
          {panelContent}
        </div>
      ) : (
        <div className={`rail-collapse${collapsed ? "" : " rail-collapse--open"}`} aria-hidden={collapsed || undefined}>
          <div className="rail-panel">
            {panelContent}
          </div>
        </div>
      )}
    </div>
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
    <div className="rail-head">
      <div className="rail-head__text">
        <div className="rail-head__title">Filters</div>
        <div className={`rail-head__sub${total === 0 ? " rail-head__sub--empty" : ""}`}>
          {total.toLocaleString("en-US")} school{total === 1 ? "" : "s"}{active.length ? ` · ${active.length} filter${active.length === 1 ? "" : "s"}` : ""}
        </div>
      </div>
      <div className="rail-head__actions">
        <button type="button" className="rail-textbtn" disabled={active.length === 0} onClick={() => useStore.getState().clearAllFilters()}>
          Clear all
        </button>
        {/* One close control: the drawer gets an X, the desktop panel closes from
            the same rail Filters button that opened it (so no redundant chevron). */}
        {(!inDrawer || onClose) && (
          <IconButton
            kind="ghost"
            size="sm"
            align="bottom-end"
            label="Close filters"
            className={`rail-head__close${inDrawer ? " rail-head__close--drawer" : ""}`}
            onClick={inDrawer ? onClose : () => setCollapsed(true)}
          >
            <CloseIcon size={inDrawer ? 20 : 18} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

// Phone drawer footer: a sticky primary action that applies-and-returns. Reads
// the live filtered total so the label previews the result set.
function DrawerDone({ onDone }: { onDone?: () => void }) {
  const { total } = useFilteredSchools();
  return (
    <div className="rail-done">
      <button type="button" className="rail-done__btn" onClick={onDone} disabled={total === 0}>
        Show {total.toLocaleString("en-US")} school{total === 1 ? "" : "s"}
      </button>
    </div>
  );
}

// Applied-filters summary: dismissible chips for every active filter, so the
// current state is visible even when its facet is scrolled off screen.
function AppliedFilters() {
  const filters = useActiveFilters();
  if (filters.length === 0) return null;
  return (
    <div className="rail-applied">
      {filters.map((f) => (
        <FilterChip key={f.key} label={f.label} onClear={f.onClear} geography={f.section === "Geography"} />
      ))}
    </div>
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

function PickSchoolsFacet() {
  const { schools } = useData();
  const pickedMsids = useStore((s) => s.pickedMsids);
  const addPicked = useStore((s) => s.addPicked);
  const removePicked = useStore((s) => s.removePicked);
  const clearPicked = useStore((s) => s.clearPicked);
  const isolatePicked = useStore((s) => s.isolatePicked);
  const setIsolatePicked = useStore((s) => s.setIsolatePicked);
  const selectSchool = useStore((s) => s.selectSchool);
  const setMapView = useStore((s) => s.setMapView);

  const all = useMemo(() => schools?.features ?? [], [schools]);
  const [query, setQuery] = useState("");
  // Carbon's ComboBox writes the chosen school's name into its field; a pick
  // should leave the field empty and focused, ready for the next school. A new
  // key remounts the field clean, and the effect below puts focus back in it.
  const [pickRound, setPickRound] = useState(0);
  const comboRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (pickRound > 0) comboRef.current?.focus();
  }, [pickRound]);
  const options = useMemo(() => matchPickOptions(all, query, pickedMsids), [all, query, pickedMsids]);
  const pickedList = useMemo(() => all.filter((f) => pickedMsids.has(f.properties.msid)), [all, pickedMsids]);
  const count = pickedMsids.size;
  const toggleId = `rail-isolate-${useId().replace(/:/g, "")}`;

  const goTo = (f: SchoolFeature) => {
    const [lng, lat] = f.geometry.coordinates as [number, number];
    selectSchool(f.properties.msid);
    setMapView({ lat, lng }, 15);
    panMapTo({ lat, lng }, 15);
  };

  return (
    <div className="rail-pick">
      <div className="rail-pick__head">
        <div className="rail-row">
          <span className="rail-icon"><PickIcon size={15} /></span>
          <span className="rail-title">Pick schools</span>
          {count ? <CountPill n={count} /> : null}
        </div>
        {count ? (
          <button type="button" className="rail-link" onClick={clearPicked}>Clear</button>
        ) : null}
      </div>

      {/* The isolate toggle: on = map/list/counts show ONLY the picks. Allowed with
          zero picks (that is the "clear the map" state), with a helper line below. */}
      <div className="rail-pick__toggle">
        <label htmlFor={toggleId} className={`rail-pick__toggle-label${isolatePicked ? " rail-pick__toggle-label--on" : ""}`}>
          Show only picked schools
        </label>
        <Toggle
          id={toggleId}
          size="sm"
          hideLabel
          labelText="Show only picked schools"
          toggled={isolatePicked}
          onToggle={(on) => setIsolatePicked(on)}
          className="rail-toggle"
        />
      </div>
      <p className={`rail-pick__help${isolatePicked && count === 0 ? " rail-pick__help--warn" : ""}`}>
        {isolatePicked
          ? (count === 0
              ? "The map is cleared. Add schools below, or click any marker and choose “Add to my map.”"
              : "Showing only your picks. Other filters are paused while this is on.")
          : "Add schools to build a list, then turn this on to show only them."}
      </p>

      <div className="rail-pick__search">
        <span className="rail-pick__search-icon" aria-hidden><AddIcon size={14} /></span>
        <ComboBox<SchoolFeature>
          key={pickRound}
          ref={comboRef}
          id={`${toggleId}-search`}
          size="sm"
          className="rail-pick__combo"
          aria-label="Add a school by name or MSID"
          placeholder="Add a school by name or MSID"
          items={options}
          selectedItem={null}
          shouldFilterItem={() => true}
          onInputChange={(v) => setQuery(v ?? "")}
          onChange={({ selectedItem }) => {
            if (!selectedItem) return;
            addPicked(selectedItem.properties.msid);
            setQuery("");
            setPickRound((n) => n + 1);
          }}
          itemToString={(o) => (o ? o.properties.name : "")}
          itemToElement={(o) =>
            o ? (
              <span className="school-option">
                <span className="school-option__text">
                  <span className="school-option__name">{o.properties.name}</span>
                  <span className="school-option__sub">{o.properties.county}, {o.properties.level}, <span className="mono">{o.properties.msid}</span></span>
                </span>
              </span>
            ) : <span />
          }
        />
      </div>
      {query.trim() && options.length === 0 && <p className="rail-pick__nomatch" role="status">No matches</p>}

      {pickedList.length > 0 && (
        <div className="rail-pick__list">
          {pickedList.map((f) => (
            <div key={f.properties.msid} className="rail-pick__item">
              <button
                type="button"
                className="rail-pick__goto"
                onClick={() => goTo(f)}
                title={`Zoom to ${f.properties.name}`}
              >
                <span className="rail-pick__name">{f.properties.name}</span>
                <span className="rail-pick__sub">{f.properties.county}, {f.properties.level}</span>
              </button>
              <button
                type="button"
                className="rail-roundbtn rail-roundbtn--danger"
                aria-label={`Remove ${f.properties.name}`}
                onClick={() => removePicked(f.properties.msid)}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
      <div className="rail-stack">
        {ALL_COUNTIES.map((c) => (
          <div key={c} className="rail-county">
            <div className="rail-county__row">
              <CheckboxRow
                label={c}
                checked={countySelection.has(c)}
                count={counts[c] ?? 0}
                onToggle={() => toggleCounty(c)}
              />
            </div>
            <IconButton kind="ghost" size="xs" align="left" label={`Zoom to ${c}`} className="rail-zoom" onClick={() => focus(c)}>
              <ZoomToIcon size={15} />
            </IconButton>
          </div>
        ))}
      </div>
      {countySelection.size === 0 && (
        <p className="rail-alert">
          No counties selected, so the map is empty. Pick at least one county.
        </p>
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
            label={<span>{tier.label} <span className="rail-hint">· {tier.hint}</span></span>}
            checked={facilityUseSelection.has(tier.key)}
            count={counts.facility[tier.key] ?? 0}
            onToggle={() => toggleFacilityUse(tier.key)}
            swatch={<Dot color={tier.color} />}
          />
        ))}
        <div className="rail-range rail-range--spaced">
          <div className="rail-range__label">Custom range (% of capacity)</div>
          <div className="rail-range__row">
            <PercentInput
              placeholder="Min"
              label="Minimum utilization percent"
              value={utilMin}
              onChange={(v) => setUtilRange(v == null ? null : Math.max(0, v), utilMax)}
            />
            <span className="rail-range__to">to</span>
            <PercentInput
              placeholder="Max"
              label="Maximum utilization percent"
              value={utilMax}
              onChange={(v) => setUtilRange(utilMin, v == null ? null : Math.max(0, v))}
            />
          </div>
        </div>
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
        <div className="rail-range">
          <div className="rail-range__label">Custom range (% of students)</div>
          <div className="rail-range__row">
            <PercentInput
              placeholder="Min"
              label="Minimum free/reduced-price lunch percent"
              max={100}
              value={frlMin}
              onChange={(v) => setFrlRange(v == null ? null : Math.min(100, Math.max(0, v)), frlMax)}
            />
            <span className="rail-range__to">to</span>
            <PercentInput
              placeholder="Max"
              label="Maximum free/reduced-price lunch percent"
              max={100}
              value={frlMax}
              onChange={(v) => setFrlRange(frlMin, v == null ? null : Math.min(100, Math.max(0, v)))}
            />
          </div>
        </div>
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
          <CheckboxRow key={l} label={levelFacetLabel(l)} checked={levelSelection.has(l)} count={counts.level[l] ?? 0} onToggle={() => toggleLevel(l)} />
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
// keeps a segmented kind selector + a district dropdown, disclosed on demand.
function DistrictFacet() {
  const { schoolDistricts } = useData();
  const districtFilter = useStore((s) => s.districtFilter);
  const setDistrictFilter = useStore((s) => s.setDistrictFilter);
  const [districtKind, setDistrictKind] = useState<DistrictKind>(districtFilter?.kind ?? "board");
  const [open, setOpen] = useState(Boolean(districtFilter));
  const districtOptions = schoolDistricts.options[districtKind];
  const districtValue = districtFilter && districtFilter.kind === districtKind ? districtFilter.value : "";
  const selectId = `rail-district-${useId().replace(/:/g, "")}`;

  const pickKind = (v: DistrictKind) => {
    if (v === districtKind) return; // exclusive: re-clicking the active kind is a no-op
    setDistrictKind(v);
    if (districtFilter && districtFilter.kind !== v) setDistrictFilter(null);
  };

  return (
    <div className="rail-facet">
      <button type="button" className="rail-disclosure" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="rail-icon"><MapBoundaryIcon size={15} /></span>
        <span className="rail-disclosure__label">Board &amp; legislative districts{districtFilter ? " (1)" : ""}</span>
        {open ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}
      </button>
      <Collapsible open={open}>
        <div className="rail-district">
          <div className="rail-seg" role="group" aria-label="District type">
            {DISTRICT_KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                className={`rail-seg__btn${districtKind === k.kind ? " rail-seg__btn--on" : ""}`}
                aria-pressed={districtKind === k.kind}
                onClick={() => pickKind(k.kind)}
              >
                {k.short}
              </button>
            ))}
          </div>
          {districtOptions.length === 0 ? (
            <p className="rail-district__empty">
              No {DISTRICT_KINDS.find((k) => k.kind === districtKind)?.label.toLowerCase()} district data for the loaded schools.
            </p>
          ) : (
            <Select
              id={selectId}
              size="sm"
              hideLabel
              labelText="District"
              className="rail-select"
              value={districtValue}
              onChange={(e) => { const v = e.target.value; setDistrictFilter(v ? { kind: districtKind, value: v } : null); }}
            >
              <SelectItem value="" text="All districts" />
              {districtOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} text={`${o.label} (${o.count})`} />
              ))}
            </Select>
          )}
        </div>
      </Collapsible>
    </div>
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
    <div className="rail-layer-groups">
      {mapLayersByGroup().map(({ group, layers }) => (
        <div key={group} className="rail-layer-group">
          <div className="rail-layer-group__head">
            {LAYER_GROUP_ICON[group]}
            <span className="rail-layer-group__name">{group}</span>
          </div>
          <div className="rail-stack">
            {layers.map((l) => {
              const on = activeLayerIds.has(l.id);
              const ready = dataReady(l);
              return (
                <Tooltip
                  key={l.id}
                  description={ready ? l.description : `${l.description} (data unavailable in this build)`}
                  align="right"
                  autoAlign
                  className="rail-tip-block"
                >
                  <div className={`rail-layer${ready ? "" : " rail-layer--off"}`}>
                    <CheckboxRow
                      label={l.label}
                      checked={on && ready}
                      onToggle={() => { if (ready) toggleLayer(l.id); }}
                      swatch={<Swatch def={l} />}
                    />
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Swatch({ def }: { def: MapLayerDef }) {
  const { kind, color } = def.swatch;
  if (kind === "dot") return <span className="rail-swatch rail-swatch--dot" style={{ background: color }} />;
  if (kind === "outline") return <span className="rail-swatch" style={{ border: `2px solid ${color}` }} />;
  return <span className="rail-swatch" style={{ background: tint(color, 0.85) }} />;
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

// A height-animating disclosure body (the facet and district bodies). Closed, it
// collapses to zero height and leaves the tab order; open, it grows to fit.
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`rail-collapsible${open ? " rail-collapsible--open" : ""}`} aria-hidden={!open || undefined}>
      <div className="rail-collapsible__inner">{children}</div>
    </div>
  );
}

// A small active-count pill beside a facet title.
function CountPill({ n }: { n: number }) {
  return <span className="rail-count">{n}</span>;
}

// A compact number field with a trailing "%" (the custom range bounds). Empty
// means "no bound" (null).
function PercentInput({ value, onChange, placeholder, label, max }: {
  value: number | null; onChange: (v: number | null) => void; placeholder: string; label: string; max?: number;
}) {
  const id = `rail-pct-${useId().replace(/:/g, "")}`;
  return (
    <div className="rail-pct">
      <TextInput
        id={id}
        size="sm"
        type="number"
        hideLabel
        labelText={label}
        placeholder={placeholder}
        min={0}
        max={max}
        value={value ?? ""}
        onChange={(e) => { const v = e.target.value; onChange(v === "" ? null : Number(v)); }}
      />
      <span className="rail-pct__unit" aria-hidden>%</span>
    </div>
  );
}

// One checkbox facet row: the whole row is the toggle; the checkbox is a visual
// affordance; an optional leading swatch and a right-aligned result count.
function CheckboxRow({ label, checked, count, onToggle, swatch }: {
  label: ReactNode; checked: boolean; count?: number; onToggle: () => void; swatch?: ReactNode;
}) {
  return (
    <button type="button" className={`rail-check${checked ? " rail-check--on" : ""}`} onClick={onToggle} aria-pressed={checked}>
      <span className="rail-check__box" aria-hidden />
      {swatch}
      <span className={`rail-check__label${swatch ? " rail-check__label--swatch" : ""}`}>{label}</span>
      {count != null && <span className="rail-check__count">{count.toLocaleString("en-US")}</span>}
    </button>
  );
}

function Dot({ color, hollow }: { color: string; hollow?: boolean }) {
  const style: CSSProperties = hollow
    ? { border: `2px solid ${color}`, background: tint(color, 0.15) }
    : { background: color };
  return <span className="rail-dot" style={style} />;
}

function GradeSwatch({ grade }: { grade: Grade }) {
  const st = resolveGradeStyle(grade);
  return (
    <span
      className="rail-grade"
      style={{
        background: rgbaToCss(st.fill),
        color: rgbaToCss(st.letterColor),
        border: `1.25px ${st.dashed ? "dashed" : "solid"} ${rgbaToCss(st.stroke)}`,
      }}
    >
      {st.letter}
    </span>
  );
}

// A collapsible filter facet. The header row toggles the body open/closed so the
// analyst can fold facets they are done with and keep the drawer scannable; an
// active facet stays visibly counted in its header even when collapsed. Defaults
// to open. `onClear` and the info tooltip are independent of the toggle.
function FacetSection({ title, icon, info, activeCount, onClear, clearLabel, children, defaultOpen = true }: {
  title: string; icon?: ReactNode; info?: string; activeCount?: number; onClear?: () => void; clearLabel?: string; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rail-facet">
      <FilterLabel title={title} icon={icon} info={info} activeCount={activeCount} onClear={onClear} clearLabel={clearLabel} open={open} onToggle={() => setOpen((v) => !v)} />
      <Collapsible open={open}>
        <div className="rail-stack rail-facet__body">{children}</div>
      </Collapsible>
    </div>
  );
}

function FacetDivider() {
  return <hr className="rail-divider" />;
}

// A section header for a filter facet. Hierarchy comes from weight + color (a
// primary-text 600 title over 400/500 rows), not font-size games; the leading
// icon aids scanning. See 07_CONTENT_STYLE.md.
function FilterLabel({ title, icon, onClear, activeCount, info, clearLabel = "Clear", open, onToggle }: {
  title: string; icon?: ReactNode; onClear?: () => void; activeCount?: number; info?: string; clearLabel?: string; open?: boolean; onToggle?: () => void;
}) {
  const collapsible = Boolean(onToggle);
  const head = (
    <>
      {collapsible && (
        <span className="rail-icon rail-chevron">
          {open ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}
        </span>
      )}
      {icon && <span className="rail-icon">{icon}</span>}
      <span className="rail-title">{title}</span>
    </>
  );
  return (
    <div className="rail-label">
      <div className="rail-row">
        {collapsible ? (
          <button type="button" className="rail-label__toggle" onClick={onToggle} aria-expanded={open}>
            {head}
          </button>
        ) : head}
        {info && (
          <Tooltip description={info} align="right" autoAlign>
            <button type="button" className="rail-info" aria-label={`About ${title}`}>
              <Icon.Info size={13} />
            </button>
          </Tooltip>
        )}
        {activeCount ? <CountPill n={activeCount} /> : null}
      </div>
      {onClear && (
        <button type="button" className="rail-link" onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
}

function SectionHeader({ title, activeCount, onReset }: { title: string; activeCount?: number; onReset?: () => void }) {
  return (
    <div className="rail-label rail-label--section">
      <div className="rail-row">
        <span className="rail-icon"><Icon.Layers size={15} /></span>
        <span className="rail-title">{title}</span>
        {/* Count as the same small pill every facet header uses, so the map-layers
            tally reads consistently with Designation, Facility use, etc. */}
        {activeCount ? <CountPill n={activeCount} /> : null}
      </div>
      {onReset && (
        <button type="button" className="rail-link" onClick={onReset}>
          Reset
        </button>
      )}
    </div>
  );
}

// A Carbon-style side-nav rail item: icon over a short label, with a left accent
// bar and tinted surface when active.
function RailIcon({ label, icon, onClick, active, badge, expanded }: { label: string; icon: ReactNode; onClick: () => void; active?: boolean; badge?: number; expanded?: boolean }) {
  return (
    <button
      type="button"
      className={`rail-btn${active ? " rail-btn--active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      aria-expanded={expanded}
    >
      <span className="rail-btn__icon">
        {icon}
        {badge != null && badge > 0 ? <span className="rail-btn__badge" aria-hidden>{badge}</span> : null}
      </span>
      <span className="rail-btn__label">{label}</span>
    </button>
  );
}
