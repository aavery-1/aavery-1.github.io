// The school table for the List view, the tool's analytical surface. Reads the
// same useFilteredSchools source of truth as the map, so the rows always match
// what the map draws; the scope prop chooses all filtered schools or just those
// in the current map view. Sortable columns, ONE keyword search (name or MSID;
// structured facets are the left filter drawer, keeping keyword search and
// faceted filtering separate per search-UX guidance), decision flags (PLP,
// co-location), and per-row actions (Show on map, Add to shortlist). The school
// name is the row's primary button (opens the inspector); the whole row is also
// clickable for the mouse. When the selection changes elsewhere (a pin click),
// the matching row scrolls into view and highlights. No em dashes in this file.
//
// Terminology: "shortlist" (Bookmark) is used everywhere for the pin-to-compare
// set, matching the map tray and the inspector; the old "compare" wording/icon
// was retired here for consistency.

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  IconButton, Search, Select, SelectItem, SkeletonText, Tag,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@carbon/react";
import { Search as SearchIcon, Location as MyLocationIcon, Bookmark as BookmarkIcon, BookmarkFilled as BookmarkFilledIcon, ArrowUp as ArrowUpIcon, ArrowDown as ArrowDownIcon, Filter as FilterIcon } from "@carbon/icons-react";
import { useData } from "../data/DataContext";
import { useStore, utilizationStyle, emptyPermanentSeats, MAX_COMPARE, type UtilKey } from "../store";
import { panMapTo } from "../map/mapController";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { useActiveFilters } from "../status/useActiveFilters";
import { incomeVsCounty } from "../data/countyIncome";
import { FilterChip } from "../ui/FilterChip";
import { schoolTypeLabel, titleILabel, levelLabel, type SchoolFeature } from "../data/types";
import "./SchoolTable.carbon.css";


type Order = "asc" | "desc";
type SortKey = "name" | "siting" | "plpNear" | "titleI" | "frl" | "incomeDelta" | "enrollment" | "capacity" | "emptySeats" | "utilization";

interface Row {
  feature: SchoolFeature;
  msid: string;
  name: string;
  type: string;
  county: string;
  level: string;
  grade: string;
  titleI: string;
  frl: number | null; // free/reduced-price lunch rate (0-1), null when not reported
  incomeDelta: number | null;  // 5-mile median household income vs county median, as a fraction (-0.18)
  incomeNearby: number | null; // the 5-mile median itself, for the second line
  enrollment: number | null;
  capacity: number | null;   // total student stations (FISH, portables included), the statute's count
  permanentCapacity: number | null; // permanent stations only, shown beneath the total
  emptySeats: number | null; // empty permanent seats: permanent stations minus headcount enrollment; null when either is missing
  utilization: number | null;
  utilLabel: string | null;   // statutory tier word ("Meets facility test" ...)
  utilKey: UtilKey;
  meta: string;               // "District · Middle (6-8) · Broward"
  isPlp: boolean;
  isCoLocation: boolean;
  inSiting: boolean;          // School of Hope may open here (siting area + Title I)
  siting: number;             // sort rank: 2 co-location candidate, 1 siting area, 0 neither
  plpNear: number;            // persistently low-performing schools within 5 miles
}

function compareRows(a: Row, b: Row, key: SortKey, order: Order): number {
  const dir = order === "asc" ? 1 : -1;
  // Siting status ties break on room (most empty seats first), so the top of the
  // default view is the best-supplied co-location candidates.
  if (key === "siting" && a.siting === b.siting) return ((b.emptySeats ?? -1) - (a.emptySeats ?? -1));
  const av = a[key];
  const bv = b[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
  return String(av).localeCompare(String(bv)) * dir;
}

// `scope` chooses the row set: "all" is every school passing the active filters;
// "inView" is only those inside the current map bounds (the set the map's
// "schools in view" dock hands off), so the List view can show exactly what was
// on screen without duplicating the map's browser.
export function SchoolTable({ dense = false, scope = "all" }: { dense?: boolean; scope?: "all" | "inView" }) {
  const { schools, schoolDemographics } = useData();
  const fs = useFilteredSchools();
  const ctx = fs.ctx;
  const features = scope === "inView" ? fs.inViewFeatures : fs.features;
  const selectedMsid = useStore((s) => s.selectedSchoolMsid);
  const selectSchool = useStore((s) => s.selectSchool);
  const setViewMode = useStore((s) => s.setViewMode);
  const comparePinned = useStore((s) => s.comparePinnedMsids);
  const toggleComparePin = useStore((s) => s.toggleComparePin);
  const setShortlistOpen = useStore((s) => s.setShortlistOpen);
  const setPanelCollapsed = useStore((s) => s.setPanelCollapsed);
  const setMobileRailOpen = useStore((s) => s.setMobileRailOpen);
  // The compound facet filters (county, grade, type, Title I, level, utilization,
  // designation) live in the left drawer; surface them here so the List is not a
  // dead end. Opening works on both desktop (expand the rail panel) and phone
  // (open the drawer). Active facets show as removable chips below the header.
  const activeFilters = useActiveFilters();
  const openFilters = () => { setPanelCollapsed(false); setMobileRailOpen(true); };

  const [orderBy, setOrderBy] = useState<SortKey>("siting");
  const [order, setOrder] = useState<Order>("desc");
  const [query, setQuery] = useState("");

  // Choose the column set from the table's own measured width, not the window, so
  // the list stays uncramped when the inspector or a narrow window shrinks the
  // space it has. Below ~860px we drop the wide-only columns.
  const rootRef = useRef<HTMLDivElement>(null);
  const [availWidth, setAvailWidth] = useState<number>(dense ? 700 : 1200);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setAvailWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Width tiers so the table fits its container without horizontal scroll: full
  // columns on a wide list, drop the low-priority ones as space tightens, and
  // fall back to the five essentials when an inspector squeezes it.
  // Fixed columns total 1008px at full width; School needs ~260px of its own, so
  // columns drop right-to-left in priority order as the table narrows.
  const compact = availWidth < 1270;     // drop F/R lunch / Income vs county / Title I (-364)
  const ultraCompact = availWidth < 1120; // also drop Stations + Enrollment (-232)
  const tiny = availWidth < 860;          // also drop Nearby PLP (-112)
  // Phone tier: the 280px name column plus utilization + actions overflows a
  // ~375px screen, cutting off the utilization bar and hiding the row actions.
  // Here the name column goes flexible (absorbs the remainder) and utilization +
  // actions tighten, so the three essentials fit without horizontal scroll.
  // Phone tier: a multi-column table cannot stay legible on a ~375px screen (names
  // truncate to a few letters and the row bleeds off the right), so below 560px the
  // table collapses to a single-column CARD list: grade + full wrapping name +
  // MSID/flags + a facts block (utilization, county/level/type, Title I) + the row
  // actions. Column headers are hidden and replaced by a compact sort control.
  const phone = availWidth < 560;
  const columns = COLUMNS.filter((c) => {
    if (phone) return c.key === "name" || c.key === "actions";
    if (c.tier === "full") return !compact;
    if (c.tier === "mid") return !ultraCompact;
    if (c.tier === "low") return !tiny;
    return true;
  });
  // Every column but School has a fixed width; School has none, so it alone
  // absorbs the leftover space and the others sit exactly over their data.
  const colWidth = (c: (typeof COLUMNS)[number]): number | undefined => (c.key === "name" ? undefined : c.width);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features
      // Keyword search finds a specific school by its identity (name or MSID).
      // Structured dimensions (county, grade, level, type, Title I, facility use)
      // are the left filter drawer's job, so this stays a single, unscoped box
      // (leading products keep keyword search and faceted filtering separate).
      .filter((f) => {
        if (!q) return true;
        const p = f.properties;
        return p.name.toLowerCase().includes(q) || p.msid.toLowerCase().includes(q);
      })
      .map((f) => {
        const p = f.properties;
        // The STATUTORY rate and tier, the same figure the school card, the map
        // legend, and the filter use (utilizationStyle), so no surface disagrees.
        const us = utilizationStyle(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
        const util = us.pct != null ? us.pct / 100 : null;
        const isCo = ctx.coLocationMsids.has(p.msid);
        const inSiting = ctx.sohEligibleMsids.has(p.msid);
        return {
          feature: f,
          msid: p.msid,
          name: p.name,
          type: p.type,
          county: p.county,
          level: levelLabel(p),
          grade: p.current_grade,
          titleI: p.title_i_schoolwide ? "Schoolwide" : titleILabel(p.title_i),
          frl: p.frl_rate ?? null,
          ...(() => {
            const iv = incomeVsCounty(schoolDemographics?.schools[p.msid], p.county);
            return { incomeDelta: iv?.delta ?? null, incomeNearby: iv?.nearby ?? null };
          })(),
          enrollment: p.enrollment,
          capacity: p.capacity,
          permanentCapacity: p.permanent_capacity != null && p.permanent_capacity > 0 ? p.permanent_capacity : null,
          emptySeats: emptyPermanentSeats(p.enrollment, p.permanent_capacity, p.capacity).seats,
          utilization: util,
          utilLabel: us.key === "unknown" ? null : us.label,
          utilKey: us.key,
          meta: [schoolTypeLabel(p.type), levelLabel(p), p.county].filter(Boolean).join(" · "),
          isPlp: ctx.plp.has(p.msid),
          isCoLocation: isCo,
          inSiting,
          siting: isCo ? 2 : inSiting ? 1 : 0,
          plpNear: ctx.nearbyPlps.get(p.msid)?.length ?? 0,
        };
      });
  }, [features, ctx, query, schoolDemographics]);

  const sorted = useMemo(() => [...rows].sort((a, b) => compareRows(a, b, orderBy, order)), [rows, orderBy, order]);

  // Text columns default to A->Z, numeric to high->low, so a fresh sort lands the
  // "most" first. Shared by the column headers and the phone sort control.
  const applySort = (key: SortKey) => {
    setOrderBy(key);
    setOrder(key === "name" || key === "titleI" ? "asc" : "desc");
  };
  const handleSort = (key: SortKey) => {
    if (orderBy === key) setOrder(order === "asc" ? "desc" : "asc");
    else applySort(key);
  };

  // The table body is virtualized: with no filters active this list holds every
  // school (1,100+), and rendering all of them as real DOM rows made sorting and
  // scrolling block the main thread for multiple seconds (measured: several
  // long tasks over 1.5s each on a full, unfiltered sort). Only the rows in and
  // just around the visible viewport are ever mounted; the two spacer rows below
  // keep the scrollbar and row positions correct for the rest.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => (dense ? 44 : phone ? 188 : 56),
    overscan: 12,
  });

  // When the selection changes (often from a pin click on the map), bring the
  // matching row into view so the two surfaces stay in sync. The row may not be
  // mounted (it can be scrolled out of the virtualized window), so this scrolls
  // by index through the virtualizer rather than calling scrollIntoView on a ref.
  useEffect(() => {
    if (!selectedMsid) return;
    const index = sorted.findIndex((r) => r.msid === selectedMsid);
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMsid]);

  const openSchool = (r: Row) => {
    const [lng, lat] = r.feature.geometry.coordinates as [number, number];
    selectSchool(r.msid);
    panMapTo({ lat, lng });
  };

  // Jump to the map centered on this school. Switches to Map view first, since
  // the row action is invisible while the list is covering the map.
  const showOnMap = (e: React.MouseEvent, r: Row) => {
    e.stopPropagation();
    const [lng, lat] = r.feature.geometry.coordinates as [number, number];
    selectSchool(r.msid);
    setViewMode("map");
    panMapTo({ lat, lng }, 15);
  };

  // The pin action never uses the native disabled attribute, so its tooltip can
  // still explain why when the shortlist is full.
  const pinLabel = (pinned: boolean) =>
    pinned ? "Remove from shortlist" : comparePinned.length >= MAX_COMPARE ? `Shortlist is full (max ${MAX_COMPARE})` : "Add to shortlist";
  const pinFull = (pinned: boolean) => !pinned && comparePinned.length >= MAX_COMPARE;
  const rowActions = (r: Row, pinned: boolean, touch: boolean) => (
    <>
      <IconButton
        kind="ghost"
        size={touch ? "lg" : "xs"}
        align="top"
        label="Show on map"
        aria-label={`Show ${r.name} on the map`}
        className="tbl-action"
        onClick={(e: React.MouseEvent) => showOnMap(e, r)}
      >
        <MyLocationIcon size={16} />
      </IconButton>
      <IconButton
        kind="ghost"
        size={touch ? "lg" : "xs"}
        align="top"
        label={pinLabel(pinned)}
        aria-label={pinned ? `Remove ${r.name} from your shortlist` : `Add ${r.name} to your shortlist`}
        aria-pressed={pinned}
        aria-disabled={pinFull(pinned) || undefined}
        className={`tbl-action${pinned ? " tbl-action--on" : ""}${pinFull(pinned) ? " tbl-action--off" : ""}`}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (!pinFull(pinned)) toggleComparePin(r.msid); }}
      >
        {pinned ? <BookmarkFilledIcon size={16} /> : <BookmarkIcon size={16} />}
      </IconButton>
    </>
  );

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div ref={rootRef} className="tbl-root">
      {/* Header: count, filters + shortlist entry points, search box */}
      <div className={`tbl-header${dense ? " tbl-header--dense" : ""}`}>
        <div>
          <div className={dense ? "tbl-count tbl-count--dense" : "tbl-count"}>
            {schools == null ? <SkeletonText width="120px" className="tbl-count__skeleton" /> : `${sorted.length.toLocaleString("en-US")} ${sorted.length === 1 ? "school" : "schools"}`}
          </div>
          {!dense && schools == null && <div className="tbl-caption">Loading schools...</div>}
        </div>
        <div className="tbl-header__actions">
          {/* Compound filtering (county, grade, type, Title I, utilization, ...) lives
              in the left drawer; this opens it and shows how many are active. */}
          <button
            type="button"
            className={`tbl-btn${activeFilters.length > 0 ? " tbl-btn--primary" : ""}`}
            onClick={openFilters}
          >
            <FilterIcon size={16} className="tbl-btn__icon" />
            Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
          </button>
          {/* Reach the shortlist from the list (it otherwise lives only on the map),
              so pinned sites are never a dead end. */}
          {comparePinned.length > 0 && (
            <button
              type="button"
              className="tbl-btn"
              onClick={() => { setViewMode("map"); setShortlistOpen(true); }}
            >
              <BookmarkIcon size={16} className="tbl-btn__icon" />
              Shortlist ({comparePinned.length})
            </button>
          )}
          {/* One keyword box (name or MSID); structured filters live in the left
              drawer. Clearable, with a visible label per search-UX guidance. */}
          <Search
            size="md"
            className={`tbl-search${dense ? " tbl-search--dense" : ""}`}
            labelText="Search schools by name or MSID"
            placeholder="Search by name or MSID"
            closeButtonLabelText="Clear search"
            value={query}
            onChange={(e) => setQuery(typeof e === "string" ? e : e.target.value)}
            onClear={() => setQuery("")}
          />
        </div>
      </div>

      {/* Applied filters, visible on the List so the current compound query is never
          hidden in the drawer. Each chip removes its own facet; "Clear all" resets. */}
      {activeFilters.length > 0 && (
        <div className={`tbl-chips${dense ? " tbl-chips--dense" : ""}`}>
          {activeFilters.map((f) => (
            <FilterChip key={f.key} label={f.label} onClear={f.onClear} />
          ))}
          <button type="button" className="tbl-textbtn tbl-chips__clear" onClick={() => useStore.getState().clearAllFilters()}>
            Clear all
          </button>
        </div>
      )}

      {/* Phone: card mode has no sortable column headers, so surface sorting here. */}
      {phone && schools != null && (
        <div className="tbl-phone-sort">
          <span className="tbl-phone-sort__label">Sort</span>
          <Select
            id="tbl-phone-sort"
            size="md"
            labelText="Sort schools by"
            hideLabel
            className="tbl-phone-sort__select"
            value={orderBy}
            onChange={(e) => applySort(e.target.value as SortKey)}
          >
            <SelectItem value="siting" text="Siting status" />
            <SelectItem value="emptySeats" text="Empty seats" />
            <SelectItem value="utilization" text="Utilization" />
            <SelectItem value="plpNear" text="PLP within 5 mi" />
            <SelectItem value="capacity" text="Student stations" />
            <SelectItem value="enrollment" text="Enrollment" />
            <SelectItem value="frl" text="F/R lunch" />
            <SelectItem value="incomeDelta" text="Income vs county" />
            <SelectItem value="titleI" text="Title I" />
            <SelectItem value="name" text="Name" />
          </Select>
          <IconButton
            kind="ghost"
            size="sm"
            align="left"
            label={order === "asc" ? "Ascending" : "Descending"}
            aria-label={`Sort direction ${order === "asc" ? "ascending" : "descending"}, toggle`}
            onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
          >
            {order === "asc" ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />}
          </IconButton>
        </div>
      )}

      {/* The scroll container the virtualizer measures. The header row sticks to
          its top (Carbon Table primitives; widths come from the colgroup). */}
      <div ref={containerRef} className="tbl-scroll">
        <Table size={dense ? "sm" : "md"} className={`tbl${phone ? " tbl--phone" : ""}`}>
          <colgroup>
            {columns.map((c) => <col key={c.key} style={{ width: colWidth(c) }} />)}
          </colgroup>
          <TableHead>
            {!phone && (
              <TableRow>
                {columns.map((c) =>
                  c.key === "actions" ? (
                    <TableHeader key={c.key} className="tbl-th tbl-th--num">{c.label}</TableHeader>
                  ) : (
                    <TableHeader
                      key={c.key}
                      className={`tbl-th${c.numeric ? " tbl-th--num" : ""}`}
                      title={c.help}
                      isSortable
                      isSortHeader={orderBy === c.key}
                      sortDirection={orderBy === c.key ? (order === "asc" ? "ASC" : "DESC") : "NONE"}
                      onClick={() => handleSort(c.key as SortKey)}
                    >
                      {c.label}
                    </TableHeader>
                  ),
                )}
              </TableRow>
            )}
          </TableHead>
          <TableBody>
            {schools == null &&
              Array.from({ length: dense ? 6 : 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.numeric ? "tbl-td--num" : undefined}>
                      <div className={c.numeric ? "tbl-skel tbl-skel--num" : "tbl-skel"}>
                        <SkeletonText width={c.key === "name" ? "70%" : "50%"} />
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {schools != null && sorted.length > 0 && virtualItems.length > 0 && (
              <tr aria-hidden className="tbl-spacer" style={{ height: virtualItems[0].start }}>
                <td colSpan={columns.length} />
              </tr>
            )}
            {schools != null && virtualItems.map((virtualRow) => {
              const r = sorted[virtualRow.index];
              const gs = resolveGradeStyle(r.grade);
              const selected = r.msid === selectedMsid;
              const pinned = comparePinned.includes(r.msid);
              return (
                <TableRow
                  key={r.msid}
                  data-index={virtualRow.index}
                  ref={(el: HTMLTableRowElement | null) => rowVirtualizer.measureElement(el)}
                  isSelected={selected}
                  className={`tbl-row${phone ? " tbl-row--card" : ""}${selected ? " tbl-row--selected" : ""}`}
                  onClick={() => openSchool(r)}
                >
                  {phone ? (
                    /* Phone: the entire row is a single distinct CARD. Header line
                       (grade + full name + actions), a sub line (MSID + flags), then
                       a labelled facts block. Full-width via colSpan; the card's own
                       border and the cell padding separate it from its neighbours. */
                    <TableCell colSpan={columns.length} className="school-card-cell">
                      <div className={`school-card${selected ? " school-card--selected" : ""}`}>
                        <div className="school-card__head">
                          <span
                            className="school-card__grade"
                            title={gs.description}
                            style={{ background: rgbaToCss(gs.fill), color: rgbaToCss(gs.letterColor), borderColor: rgbaToCss(gs.stroke), borderStyle: gs.dashed ? "dashed" : "solid" }}
                          >
                            {gs.letter}
                          </span>
                          <div className="school-card__namewrap">
                            <button
                              type="button"
                              className="school-card__name"
                              title={r.name}
                              aria-label={`Open details for ${r.name}`}
                              onClick={(e) => { e.stopPropagation(); openSchool(r); }}
                            >
                              {r.name}
                            </button>
                            <div className="school-card__meta">{r.meta}</div>
                          </div>
                          <div className="school-card__actions">{rowActions(r, pinned, true)}</div>
                        </div>
                        <div className="school-card__flags"><SitingCell r={r} /></div>
                        <div className="school-card__facts">
                          <div className="school-card__fact">
                            <span className="school-card__fact-label">Utilization</span>
                            <span className="school-card__fact-value"><UtilCell r={r} /></span>
                          </div>
                          <div className="school-card__fact">
                            <span className="school-card__fact-label">Empty seats</span>
                            <span className="school-card__fact-value"><EmptySeatsCell value={r.emptySeats} /></span>
                          </div>
                          <div className="school-card__fact">
                            <span className="school-card__fact-label">Student stations</span>
                            <span className="school-card__fact-value"><StationsCell total={r.capacity} permanent={r.permanentCapacity} /></span>
                          </div>
                          <div className="school-card__fact">
                            <span className="school-card__fact-label">Nearby PLP</span>
                            <span className="school-card__fact-value"><PlpNearCell n={r.plpNear} /></span>
                          </div>
                          <div className="school-card__fact">
                            <span className="school-card__fact-label">F/R lunch</span>
                            <span className="school-card__fact-value"><FrlCell rate={r.frl} /></span>
                          </div>
                          <div className="school-card__fact">
                            <span className="school-card__fact-label">Income vs county</span>
                            <span className="school-card__fact-value"><IncomeCell delta={r.incomeDelta} nearby={r.incomeNearby} /></span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  ) : (
                  <>
                  {/* School: grade + name, then ONE muted line with type, level,
                      and county (three columns' worth of context, read in passing). */}
                  <TableCell>
                    <div className="tbl-school">
                      <span
                        className="tbl-grade"
                        title={gs.description}
                        style={{ background: rgbaToCss(gs.fill), color: rgbaToCss(gs.letterColor), borderColor: rgbaToCss(gs.stroke), borderStyle: gs.dashed ? "dashed" : "solid" }}
                      >
                        {gs.letter}
                      </span>
                      <div className="tbl-school__text">
                        <button
                          type="button"
                          className="tbl-school__name"
                          title={`${r.name} (${r.msid})`}
                          aria-label={`Open details for ${r.name}`}
                          onClick={(e) => { e.stopPropagation(); openSchool(r); }}
                        >
                          {r.name}
                        </button>
                        <span className="tbl-school__meta">{r.meta}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><SitingCell r={r} /></TableCell>
                  {!tiny && <TableCell className="tbl-td--num"><PlpNearCell n={r.plpNear} /></TableCell>}
                  <TableCell className="tbl-td--num"><UtilCell r={r} /></TableCell>
                  <TableCell className="tbl-td--num"><EmptySeatsCell value={r.emptySeats} /></TableCell>
                  {!ultraCompact && <TableCell className="tbl-td--num"><StationsCell total={r.capacity} permanent={r.permanentCapacity} /></TableCell>}
                  {!ultraCompact && (
                    <TableCell className="tbl-td--num">
                      <span className="tbl-num">{r.enrollment != null ? r.enrollment.toLocaleString("en-US") : <span className="tbl-na">n/a</span>}</span>
                    </TableCell>
                  )}
                  {!compact && <TableCell className="tbl-td--num"><FrlCell rate={r.frl} /></TableCell>}
                  {!compact && <TableCell className="tbl-td--num"><IncomeCell delta={r.incomeDelta} nearby={r.incomeNearby} /></TableCell>}
                  {!compact && <TableCell><TitleICell value={r.titleI} /></TableCell>}
                  <TableCell className="tbl-td--num tbl-td--actions">
                    <div className="tbl-actions">{rowActions(r, pinned, false)}</div>
                  </TableCell>
                  </>
                  )}
                </TableRow>
              );
            })}
            {schools != null && sorted.length > 0 && virtualItems.length > 0 && (
              <tr aria-hidden className="tbl-spacer" style={{ height: rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end }}>
                <td colSpan={columns.length} />
              </tr>
            )}
            {schools != null && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="tbl-empty-cell">
                  <div className="tbl-empty">
                    <div className="tbl-empty__icon">
                      <SearchIcon size={20} />
                    </div>
                    <div>
                      <div className="tbl-empty__title">
                        {query.trim() ? `No schools match "${query.trim()}"` : "No schools match the current filters"}
                      </div>
                      <div className="tbl-caption">
                        {query.trim() ? "Try a different name or MSID, or clear the search." : "Try clearing a filter or widening the county scope."}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="tbl-textbtn"
                      onClick={() => (query.trim() ? setQuery("") : useStore.getState().clearAllFilters())}
                    >
                      {query.trim() ? "Clear search" : "Clear all filters"}
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Siting status as Carbon tags, strongest first: a co-location candidate (the
// answer this tool exists for), else "May open here" (in a siting area and
// Title I), plus "PLP" when the school is itself persistently low-performing.
function SitingCell({ r }: { r: Row }) {
  if (!r.isCoLocation && !r.inSiting && !r.isPlp) return <span className="tbl-na">Not a siting area</span>;
  return (
    <span className="tbl-tags">
      {r.isCoLocation
        ? <Tag type="teal" size="sm" title="Co-location candidate: a district building that meets the facility test (75% or less, or 400+ surplus stations) inside a School of Hope siting area. Building age is not checked.">Co-location candidate</Tag>
        : r.inSiting ? <Tag type="green" size="sm" title="Inside a School of Hope siting area and Title I eligible.">May open here</Tag> : null}
      {r.isPlp && <Tag type="red" size="sm" title="Persistently low-performing (F.S. 1002.333).">PLP</Tag>}
    </span>
  );
}

function PlpNearCell({ n }: { n: number }) {
  return <span className={n > 0 ? "tbl-num" : "tbl-num tbl-na"}>{n}</span>;
}

// Title I: plain text; eligible schools in primary text, the rest muted.
function TitleICell({ value }: { value: string }) {
  const eligible = value === "Schoolwide" || value === "Yes";
  return <span className={eligible ? "tbl-text" : "tbl-text tbl-na"}>{value}</span>;
}

function FrlCell({ rate }: { rate: number | null }) {
  return rate == null ? <span className="tbl-na">n/a</span> : <span className="tbl-num">{Math.round(rate * 100)}%</span>;
}

// Neighborhood income vs the county: the signed gap as the headline (a minus
// sign, never color alone, carries the direction), the 5-mile median beneath.
function IncomeCell({ delta, nearby }: { delta: number | null; nearby: number | null }) {
  if (delta == null || nearby == null) return <span className="tbl-na">n/a</span>;
  const pct = Math.round(delta * 100);
  return (
    <span className="tbl-util">
      <span className="tbl-num">{pct > 0 ? `+${pct}%` : pct < 0 ? `\u2212${Math.abs(pct)}%` : "0%"}</span>
      <span className="tbl-util__tier">${Math.round(nearby / 1000)}k nearby</span>
    </span>
  );
}

// Empty permanent seats: permanent stations minus headcount, floored at 0.
function EmptySeatsCell({ value }: { value: number | null }) {
  return value == null ? <span className="tbl-na">n/a</span> : <span className="tbl-num">{value.toLocaleString("en-US")}</span>;
}

// Total student stations (the statute's count, portables included) as the
// headline, with the permanent-only count beneath when the building has
// portables, so Stations, Enrollment, and Empty seats reconcile on the row.
function StationsCell({ total, permanent }: { total: number | null; permanent: number | null }) {
  if (total == null) return <span className="tbl-na">n/a</span>;
  return (
    <span className="tbl-util">
      <span className="tbl-num">{total.toLocaleString("en-US")}</span>
      {permanent != null && permanent !== total && <span className="tbl-util__tier">{permanent.toLocaleString("en-US")} permanent</span>}
    </span>
  );
}

// Statutory utilization: the rate, with its tier word beneath (both right-
// aligned to the column edge, so the number column reads as one clean edge).
function UtilCell({ r }: { r: Row }) {
  if (r.utilization == null) return <span className="tbl-na">n/a</span>;
  return (
    <span className="tbl-util">
      <span className="tbl-num">{Math.round(r.utilization * 100)}%</span>
      {r.utilLabel && <span className={`tbl-util__tier tbl-util__tier--${r.utilKey}`}>{r.utilLabel}</span>}
    </span>
  );
}

// Column set, in the order a siting decision is made: who (School), can a
// School of Hope go here (Siting, PLP nearby), is there room (Utilization,
// Empty seats, Stations, Enrollment), who it serves (F/R lunch, % Black, Title I).
// Tiers drop the right-hand columns first as the table narrows. Every column
// except School has a fixed width; School absorbs the rest.
const COLUMNS: { key: SortKey | "actions"; label: string; numeric?: boolean; tier?: "full" | "mid" | "low"; width?: number; help?: string }[] = [
  { key: "name", label: "School" },
  { key: "siting", label: "Siting", width: 176, help: "Co-location candidate, or in a School of Hope siting area (\"May open here\"); PLP marks a persistently low-performing school." },
  { key: "plpNear", label: "Nearby PLP", numeric: true, tier: "low", width: 112, help: "Persistently low-performing schools within 5 miles, same county (FL DOE 2025-26 list)." },
  { key: "utilization", label: "Utilization", numeric: true, width: 148, help: "Facility Utilization Rate, the statute's measure (funded FTE / all student stations), with its tier: Meets facility test (75% or less, or 400+ surplus), Not fully used, Fully used (90%+)." },
  { key: "emptySeats", label: "Empty seats", numeric: true, width: 112, help: "Empty permanent seats: permanent student stations minus current enrollment. Portables are not counted." },
  { key: "capacity", label: "Stations", numeric: true, tier: "mid", width: 120, help: "Total student stations from the district's FISH report, portables included (the statute's count). The permanent-only figure shows beneath when the building has portables; Empty seats uses that one." },
  { key: "enrollment", label: "Enrollment", numeric: true, tier: "mid", width: 112, help: "FL DOE membership enrollment (Broward SY2026-27 is the Tenth Day count)." },
  { key: "frl", label: "F/R lunch", numeric: true, tier: "full", width: 104, help: "Share of students on free or reduced-price meals (FL DOE Fall Survey 2, 2025-26)." },
  { key: "incomeDelta", label: "Income vs county", numeric: true, tier: "full", width: 148, help: "Median household income within 5 miles of the school, compared with its county's median (Census ACS 2019-2023; county medians: Miami-Dade $68,694, Broward $74,534, Orange $77,011). Negative means a lower-income area." },
  { key: "titleI", label: "Title I", tier: "full", width: 112, help: "Title I eligibility (FL DOE Title I Part A list, 2025-26)." },
  { key: "actions", label: "", numeric: true, width: 80 },
];
