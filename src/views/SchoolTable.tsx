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
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, Chip, Typography, TextField, InputAdornment, Stack, Skeleton,
  IconButton, Tooltip, Button, Select, MenuItem,
} from "@mui/material";
import { Search as SearchIcon, Location as MyLocationIcon, Bookmark as BookmarkIcon, BookmarkFilled as BookmarkFilledIcon, Close as CloseIcon, ArrowUp as ArrowUpIcon, ArrowDown as ArrowDownIcon, Filter as FilterIcon } from "@carbon/icons-react";
import { alpha } from "@mui/material/styles";
import { useData } from "../data/DataContext";
import { useStore, utilizationBucket, MAX_COMPARE } from "../store";
import { panMapTo } from "../map/mapController";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { useActiveFilters } from "../status/useActiveFilters";
import { ACCENT_TEXT, TEAL } from "../muiTheme";
import { schoolTypeLabel, titleILabel, type SchoolFeature } from "../data/types";
import "./SchoolTable.carbon.css";

const RED_STRONG = "#B71C1C";  // PLP
const CO_LOC_BLUE = "#1D4ED8";  // co-location target
const TITLE_I_PURPLE = "#7C3AED"; // economic-disadvantage proxy (Title I)

type Order = "asc" | "desc";
type SortKey = "name" | "type" | "county" | "level" | "titleI" | "enrollment" | "capacity" | "utilization";

interface Row {
  feature: SchoolFeature;
  msid: string;
  name: string;
  type: string;
  county: string;
  level: string;
  grade: string;
  titleI: string;
  enrollment: number | null;
  capacity: number | null;
  utilization: number | null;
  bucket: "over" | "target" | "under" | "unknown";
  isPlp: boolean;
  isCoLocation: boolean;
}

function compareRows(a: Row, b: Row, key: SortKey, order: Order): number {
  const dir = order === "asc" ? 1 : -1;
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
  const { schools } = useData();
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

  const [orderBy, setOrderBy] = useState<SortKey>("utilization");
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
  const compact = availWidth < 980;      // drop Type / Level / Capacity
  const ultraCompact = availWidth < 780; // also drop County / Enrollment
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
    return true;
  });
  const colWidth = (c: (typeof COLUMNS)[number]): number | undefined => {
    if (!phone) return c.width;
    if (c.key === "name") return undefined;      // flexible: absorb remaining width
    if (c.key === "utilization") return 118;
    if (c.key === "actions") return 76;
    return c.width;
  };

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
        const util = p.enrollment != null && p.capacity != null && p.capacity > 0 ? p.enrollment / p.capacity : null;
        return {
          feature: f,
          msid: p.msid,
          name: p.name,
          type: p.type,
          county: p.county,
          level: p.level,
          grade: p.current_grade,
          titleI: p.title_i_schoolwide ? "Schoolwide" : titleILabel(p.title_i),
          enrollment: p.enrollment,
          capacity: p.capacity,
          utilization: util,
          bucket: utilizationBucket(p.enrollment, p.capacity),
          isPlp: ctx.plp.has(p.msid),
          isCoLocation: ctx.coLocationMsids.has(p.msid),
        };
      });
  }, [features, ctx, query]);

  const sorted = useMemo(() => [...rows].sort((a, b) => compareRows(a, b, orderBy, order)), [rows, orderBy, order]);

  // Text columns default to A->Z, numeric to high->low, so a fresh sort lands the
  // "most" first. Shared by the column headers and the phone sort control.
  const applySort = (key: SortKey) => {
    setOrderBy(key);
    setOrder(key === "name" || key === "type" || key === "county" || key === "level" || key === "titleI" ? "asc" : "desc");
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

  return (
    <Box ref={rootRef} sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.default", minHeight: 0, minWidth: 0 }}>
      {/* Header: count, search-by field selector, search box */}
      <Box
        sx={{
          px: dense ? 2 : 2.5, py: dense ? 1.25 : 1.75, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 2, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper",
          flexWrap: "wrap", rowGap: 1,
        }}
      >
        <Box>
          <Typography variant={dense ? "subtitle2" : "h6"} sx={{ fontWeight: 700 }}>
            {schools == null ? <Skeleton width={120} /> : `${sorted.length.toLocaleString("en-US")} ${sorted.length === 1 ? "school" : "schools"}`}
          </Typography>
          {!dense && schools == null && (
            <Typography variant="caption" color="text.secondary">
              Loading schools...
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flex: "1 1 auto", minWidth: 0, justifyContent: "flex-end", flexWrap: "wrap", rowGap: 1 }}>
          {/* Compound filtering (county, grade, type, Title I, utilization, ...) lives
              in the left drawer; this opens it and shows how many are active. */}
          <Button
            size="small"
            variant={activeFilters.length > 0 ? "contained" : "outlined"}
            disableElevation
            startIcon={<FilterIcon size={16} />}
            onClick={openFilters}
            sx={{ textTransform: "none", fontWeight: 600, flex: "0 0 auto", whiteSpace: "nowrap" }}
          >
            Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
          </Button>
          {/* Reach the shortlist from the list (it otherwise lives only on the map),
              so pinned sites are never a dead end. */}
          {comparePinned.length > 0 && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<BookmarkIcon size={16} />}
              onClick={() => { setViewMode("map"); setShortlistOpen(true); }}
              sx={{ textTransform: "none", fontWeight: 600, flex: "0 0 auto", whiteSpace: "nowrap" }}
            >
              Shortlist ({comparePinned.length})
            </Button>
          )}
          {/* One keyword box (name or MSID); structured filters live in the left
              drawer. Clearable, with a visible label per search-UX guidance. */}
          <TextField
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or MSID"
            inputProps={{ "aria-label": "Search schools by name or MSID" }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon size={16} /></InputAdornment>,
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setQuery("")} edge="end">
                    <CloseIcon size={14} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
            sx={{ flex: "1 1 220px", minWidth: 160, maxWidth: dense ? 260 : 320 }}
          />
        </Stack>
      </Box>

      {/* Applied filters, visible on the List so the current compound query is never
          hidden in the drawer. Each chip removes its own facet; "Clear all" resets. */}
      {activeFilters.length > 0 && (
        <Box sx={{ px: dense ? 2 : 2.5, py: 1, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", rowGap: 0.75, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          {activeFilters.map((f) => (
            <Chip
              key={f.key}
              size="small"
              label={f.label}
              onDelete={f.onClear}
              deleteIcon={<Box component="span" sx={{ fontSize: 14, lineHeight: 1, pr: 0.25 }}>×</Box>}
              sx={{
                height: 24, fontSize: 12, fontWeight: 600, maxWidth: "100%",
                color: ACCENT_TEXT, bgcolor: alpha(TEAL, 0.1), border: `1px solid ${alpha(TEAL, 0.3)}`,
                "& .MuiChip-label": { px: 1 },
                "& .MuiChip-deleteIcon": { color: "inherit", opacity: 0.7, "&:hover": { opacity: 1 } },
              }}
            />
          ))}
          <Button size="small" onClick={() => useStore.getState().clearAllFilters()} sx={{ textTransform: "none", fontWeight: 600, minWidth: 0, px: 1, ml: 0.5 }}>
            Clear all
          </Button>
        </Box>
      )}

      {/* Phone: card mode has no sortable column headers, so surface sorting here. */}
      {phone && schools != null && (
        <Box sx={{ px: 2, py: 1, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", flex: "0 0 auto" }}>Sort</Typography>
          <Select
            size="small"
            value={orderBy}
            onChange={(e) => applySort(e.target.value as SortKey)}
            aria-label="Sort schools by"
            sx={{ flex: 1, fontSize: 13, bgcolor: "background.paper" }}
          >
            <MenuItem value="utilization" sx={{ fontSize: 13 }}>Utilization</MenuItem>
            <MenuItem value="name" sx={{ fontSize: 13 }}>Name</MenuItem>
            <MenuItem value="county" sx={{ fontSize: 13 }}>County</MenuItem>
            <MenuItem value="titleI" sx={{ fontSize: 13 }}>Title I</MenuItem>
            <MenuItem value="enrollment" sx={{ fontSize: 13 }}>Enrollment</MenuItem>
            <MenuItem value="capacity" sx={{ fontSize: 13 }}>Capacity</MenuItem>
            <MenuItem value="level" sx={{ fontSize: 13 }}>Level</MenuItem>
            <MenuItem value="type" sx={{ fontSize: 13 }}>Type</MenuItem>
          </Select>
          <Tooltip title={order === "asc" ? "Ascending" : "Descending"}>
            <IconButton size="small" onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))} aria-label={`Sort direction ${order === "asc" ? "ascending" : "descending"}, toggle`}>
              {order === "asc" ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <TableContainer ref={containerRef} component={Paper} elevation={0} square sx={{ flex: 1, overflow: "auto", overflowX: "hidden", minHeight: 0 }}>
        <Table stickyHeader size="small" sx={{ tableLayout: "fixed", width: "100%", "& .MuiTableCell-root": { px: 1.25 } }}>
          <TableHead>
            {!phone && (
              <TableRow>
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    align={c.numeric ? "right" : "left"}
                    title={c.help}
                    sortDirection={c.key !== "actions" && c.key !== "flags" && orderBy === c.key ? order : false}
                    sx={{ width: colWidth(c), fontWeight: 700, fontSize: 12, textTransform: "none", letterSpacing: 0.16, color: "text.secondary", bgcolor: "background.paper", py: 1.25, whiteSpace: "nowrap", cursor: c.help ? "help" : undefined }}
                  >
                    {c.key === "actions" || c.key === "flags" ? (
                      c.label
                    ) : (
                      <TableSortLabel
                        active={orderBy === c.key}
                        direction={orderBy === c.key ? order : "asc"}
                        onClick={() => handleSort(c.key as SortKey)}
                      >
                        {c.label}
                      </TableSortLabel>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableHead>
          <TableBody>
            {schools == null &&
              Array.from({ length: dense ? 6 : 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key} align={c.numeric ? "right" : "left"}>
                      <Skeleton variant="text" width={c.key === "name" ? "70%" : "50%"} sx={{ ml: c.numeric ? "auto" : 0 }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {schools != null && sorted.length > 0 && rowVirtualizer.getVirtualItems().length > 0 && (
              <TableRow aria-hidden style={{ height: rowVirtualizer.getVirtualItems()[0].start }}>
                <TableCell colSpan={columns.length} sx={{ p: 0, border: 0 }} />
              </TableRow>
            )}
            {schools != null && rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const r = sorted[virtualRow.index];
              const gs = resolveGradeStyle(r.grade);
              const selected = r.msid === selectedMsid;
              const pinned = comparePinned.includes(r.msid);
              return (
                <TableRow
                  key={r.msid}
                  data-index={virtualRow.index}
                  ref={(el) => rowVirtualizer.measureElement(el)}
                  hover={!phone}
                  selected={selected}
                  onClick={() => openSchool(r)}
                  sx={{
                    cursor: "pointer",
                    // On phone the card carries its own selected treatment, so the
                    // row itself stays transparent (a tinted row behind the card,
                    // showing through the gap, looked broken).
                    ...(phone
                      ? { "&.Mui-selected": { bgcolor: "transparent" }, "&:hover": { bgcolor: "transparent" } }
                      : {
                          "&.Mui-selected": { bgcolor: alpha("#2563EB", 0.08) },
                          "&.Mui-selected:hover": { bgcolor: alpha("#2563EB", 0.14) },
                        }),
                  }}
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
                            <div className="school-card__meta">
                              {[r.county, r.level, schoolTypeLabel(r.type)].filter(Boolean).join(" · ")}
                              <span className="school-card__msid">{r.msid}</span>
                            </div>
                          </div>
                          <div className="school-card__actions">
                            <Tooltip title="Show on map" placement="top">
                              <IconButton size="medium" onClick={(e) => showOnMap(e, r)} aria-label={`Show ${r.name} on the map`} sx={{ p: "14px" }}>
                                <MyLocationIcon size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={pinned ? "Remove from shortlist" : comparePinned.length >= MAX_COMPARE ? `Shortlist is full (max ${MAX_COMPARE})` : "Add to shortlist"} placement="top">
                              <span>
                                <IconButton
                                  size="medium"
                                  onClick={(e) => { e.stopPropagation(); toggleComparePin(r.msid); }}
                                  disabled={!pinned && comparePinned.length >= MAX_COMPARE}
                                  aria-label={pinned ? `Remove ${r.name} from your shortlist` : `Add ${r.name} to your shortlist`}
                                  aria-pressed={pinned}
                                  sx={{ p: "14px", color: pinned ? ACCENT_TEXT : undefined }}
                                >
                                  {pinned ? <BookmarkFilledIcon size={16} /> : <BookmarkIcon size={16} />}
                                </IconButton>
                              </span>
                            </Tooltip>
                          </div>
                        </div>
                        {(r.isPlp || r.isCoLocation) && (
                          <div className="school-card__flags">
                            {r.isPlp && <FlagChip label="PLP" color={RED_STRONG} title="Persistently low-performing (F.S. 1002.333). A hope operator may open to serve this school's students." />}
                            {r.isCoLocation && <FlagChip label="Co-loc" color={CO_LOC_BLUE} title="Co-location candidate: an underused district building in a School of Hope siting area. The building-age rule is checked in a school's details." />}
                          </div>
                        )}
                        <div className="school-card__facts">
                          <div className="school-card__fact">
                            <span className="school-card__fact-label">Utilization</span>
                            <span className="school-card__fact-value"><UtilizationCell util={r.utilization} bucket={r.bucket} dense={false} fill /></span>
                          </div>
                          <div className="school-card__fact">
                            <span className="school-card__fact-label">Title I</span>
                            <span className="school-card__fact-value"><TitleICell value={r.titleI} /></span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  ) : (
                  <>
                  {/* School: grade badge + name + MSID + decision flags. */}
                  <TableCell sx={{ verticalAlign: undefined, py: undefined }}>
                    <Stack direction="row" spacing={1.25} alignItems={phone ? "flex-start" : "center"}>
                      <Box
                        title={gs.description}
                        sx={{
                          width: 30, height: 30, borderRadius: 1, flex: "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, fontWeight: 800,
                          bgcolor: rgbaToCss(gs.fill), color: rgbaToCss(gs.letterColor),
                          border: `1.25px ${gs.dashed ? "dashed" : "solid"} ${rgbaToCss(gs.stroke)}`,
                        }}
                      >
                        {gs.letter}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        {/* The name is the row's primary control: a real button, so
                            keyboard users tab name -> show-on-map -> shortlist per
                            row (no interactive controls nested inside a button row).
                            On phone it wraps to two lines instead of truncating. */}
                        <Box
                          component="button"
                          type="button"
                          title={r.name}
                          aria-label={`Open details for ${r.name}`}
                          onClick={(e) => { e.stopPropagation(); openSchool(r); }}
                          sx={{
                            appearance: "none", border: "none", background: "none", p: 0, m: 0, font: "inherit",
                            width: "100%", minWidth: 0, textAlign: "left", cursor: "pointer",
                            fontWeight: 600, lineHeight: 1.3, color: "text.primary", overflow: "hidden",
                            ...(phone
                              ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", whiteSpace: "normal" }
                              : { display: "block", whiteSpace: "nowrap", textOverflow: "ellipsis" }),
                            "&:hover": { textDecoration: "underline" },
                            "&:focus-visible": { outline: `2px solid ${ACCENT_TEXT}`, outlineOffset: 2, borderRadius: 1 },
                          }}
                        >
                          {r.name}
                        </Box>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25, flexWrap: "wrap", rowGap: 0.25 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono)" }}>{r.msid}</Typography>
                          {r.isPlp && <FlagChip label="PLP" color={RED_STRONG} title="Persistently low-performing (F.S. 1002.333). A hope operator may open to serve this school's students." />}
                          {r.isCoLocation && <FlagChip label="Co-loc" color={CO_LOC_BLUE} title="Co-location candidate: an underused district building (utilization at or below 75%, or 400+ surplus stations) in a School of Hope siting area. Rent-free co-location is possible under Rule 6A-1.0998271; the rule's exclusion of buildings under 4 years old is not checked here." />}
                        </Stack>
                        {phone && (
                          <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ flex: "0 0 auto", width: 62 }}>Utilization</Typography>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <UtilizationCell util={r.utilization} bucket={r.bucket} dense={false} fill />
                              </Box>
                            </Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ flex: "0 0 auto", width: 62 }}>Title I</Typography>
                              <TitleICell value={r.titleI} />
                            </Box>
                            <Typography variant="caption" color="text.secondary">{[r.county, r.level, schoolTypeLabel(r.type)].filter(Boolean).join(" · ")}</Typography>
                          </Box>
                        )}
                      </Box>
                    </Stack>
                  </TableCell>
                  {!ultraCompact && (
                    <TableCell><Typography variant="body2" noWrap>{r.county}</Typography></TableCell>
                  )}
                  {!compact && (
                    <TableCell><Typography variant="body2" color="text.secondary" noWrap>{r.level}</Typography></TableCell>
                  )}
                  {!compact && (
                    <TableCell><Typography variant="body2" noWrap>{schoolTypeLabel(r.type)}</Typography></TableCell>
                  )}
                  {!ultraCompact && (
                    <TableCell><TitleICell value={r.titleI} /></TableCell>
                  )}
                  {!phone && (
                    <TableCell align="right">
                      <UtilizationCell util={r.utilization} bucket={r.bucket} dense={compact} />
                    </TableCell>
                  )}
                  {!ultraCompact && (
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {r.enrollment != null ? r.enrollment.toLocaleString("en-US") : "-"}
                      </Typography>
                    </TableCell>
                  )}
                  {!compact && (
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {r.capacity != null ? r.capacity.toLocaleString("en-US") : "-"}
                      </Typography>
                    </TableCell>
                  )}
                  {/* On phone the actions stack and use a 44px touch target (Fluent
                      minimum); on desktop they stay compact inline icons. */}
                  <TableCell align="right" sx={{ whiteSpace: "nowrap", verticalAlign: phone ? "top" : undefined, py: phone ? 1.25 : undefined }}>
                    <Stack direction={phone ? "column" : "row"} spacing={phone ? 0.5 : 0} alignItems="center" sx={{ float: phone ? "right" : undefined }}>
                      <Tooltip title="Show on map" placement="top">
                        <IconButton size={phone ? "medium" : "small"} onClick={(e) => showOnMap(e, r)} aria-label={`Show ${r.name} on the map`} sx={{ p: phone ? "14px" : undefined }}>
                          <MyLocationIcon size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={pinned ? "Remove from shortlist" : comparePinned.length >= MAX_COMPARE ? `Shortlist is full (max ${MAX_COMPARE})` : "Add to shortlist"} placement="top">
                        <span>
                          <IconButton
                            size={phone ? "medium" : "small"}
                            onClick={(e) => { e.stopPropagation(); toggleComparePin(r.msid); }}
                            disabled={!pinned && comparePinned.length >= MAX_COMPARE}
                            aria-label={pinned ? `Remove ${r.name} from your shortlist` : `Add ${r.name} to your shortlist`}
                            aria-pressed={pinned}
                            sx={{ p: phone ? "14px" : undefined, color: pinned ? ACCENT_TEXT : undefined }}
                          >
                            {pinned ? <BookmarkFilledIcon size={16} /> : <BookmarkIcon size={16} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  </>
                  )}
                </TableRow>
              );
            })}
            {schools != null && sorted.length > 0 && rowVirtualizer.getVirtualItems().length > 0 && (
              <TableRow aria-hidden style={{ height: rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end }}>
                <TableCell colSpan={columns.length} sx={{ p: 0, border: 0 }} />
              </TableRow>
            )}
            {schools != null && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} sx={{ textAlign: "center", py: 8 }}>
                  <Stack alignItems="center" spacing={1.5}>
                    <Box sx={{ width: 44, height: 44, borderRadius: "50%", bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <SearchIcon size={20} style={{ color: "var(--text-secondary)" }} />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
                        {query.trim() ? `No schools match "${query.trim()}"` : "No schools match the current filters"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {query.trim() ? "Try a different name or MSID, or clear the search." : "Try clearing a filter or widening the county scope."}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      onClick={() => (query.trim() ? setQuery("") : useStore.getState().clearAllFilters())}
                      sx={{ textTransform: "none", fontWeight: 600 }}
                    >
                      {query.trim() ? "Clear search" : "Clear all filters"}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function FlagChip({ label, color, title }: { label: string; color: string; title?: string }) {
  const chip = (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
        bgcolor: alpha(color, 0.12), color, border: `1px solid ${alpha(color, 0.35)}`,
        "& .MuiChip-label": { px: 0.75 },
        cursor: title ? "help" : "default",
      }}
    />
  );
  return title ? <Tooltip title={title} placement="top" arrow>{chip}</Tooltip> : chip;
}

// Title I is the available economic-disadvantage proxy (a true free/reduced-price
// rate is a planned data addition). A filled dot marks an eligible school so the
// column scans quickly; "No"/"Unknown" stay muted.
function TitleICell({ value }: { value: string }) {
  const eligible = value === "Schoolwide" || value === "Yes";
  return (
    <Stack direction="row" spacing={0.6} alignItems="center">
      <Box sx={{ width: 7, height: 7, borderRadius: "50%", flex: "none", bgcolor: eligible ? TITLE_I_PURPLE : "transparent", border: eligible ? "none" : "1px solid", borderColor: "divider" }} />
      <Typography variant="body2" color={eligible ? "text.primary" : "text.secondary"} noWrap>{value}</Typography>
    </Stack>
  );
}

// `fill` (phone card) makes the bar flex to fill its container instead of a fixed
// right-aligned width, so it never overflows a tight row and collides with a label.
function UtilizationCell({ util, bucket, dense, fill }: { util: number | null; bucket: Row["bucket"]; dense: boolean; fill?: boolean }) {
  if (util == null) return <Typography variant="body2" color="text.secondary">n/a</Typography>;
  const pct = Math.round(util * 100);
  const mark = bucket === "over" ? "▲" : bucket === "under" ? "▼" : "";
  const color = "#334155";
  // The track represents 100% of capacity; the fill is the exact utilization
  // fraction, capped at a full track (over-capacity is flagged by the ▲ mark and
  // the % label). A hair of width is kept for a non-zero rate so it stays visible,
  // but never enough to overstate a low utilization. Enrollment and capacity have
  // their own columns, so this cell shows just the rate and its bar.
  const fillPct = util > 0 ? Math.max(2, Math.min(100, util * 100)) : 0;
  return (
    <Stack direction="row" alignItems="center" spacing={1} justifyContent={fill ? "flex-start" : "flex-end"} sx={fill ? { width: "100%" } : undefined}>
      <Box sx={{ width: fill ? "auto" : dense ? 56 : 88, flex: fill ? 1 : "none", minWidth: fill ? 40 : undefined, height: 6, bgcolor: "action.hover", borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ width: `${fillPct}%`, height: "100%", bgcolor: color, borderRadius: 3 }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 700, color, fontVariantNumeric: "tabular-nums", minWidth: 46, textAlign: "right", flex: "0 0 auto" }}>
        {mark ? `${mark} ` : ""}{pct}%
      </Typography>
    </Stack>
  );
}

// Column priority tiers. "full" columns show only on a wide table; "mid" columns
// drop when the table is squeezed (inspector open); the rest always
// show. Keeps the essentials (name, grade, flags, utilization, actions) visible
// at every width without horizontal scroll.
// `width` feeds a fixed table layout so columns fill the container exactly and
// never force horizontal scroll; the name column has no width and absorbs the
// remainder, truncating with an ellipsis.
const COLUMNS: { key: SortKey | "flags" | "actions"; label: string; numeric?: boolean; tier?: "full" | "mid"; width?: number; help?: string }[] = [
  { key: "name", label: "School", width: 280 },
  { key: "county", label: "County", tier: "mid", width: 100 },
  { key: "level", label: "Level", tier: "full", width: 90 },
  { key: "type", label: "Type", tier: "full", width: 92 },
  { key: "titleI", label: "Title I", tier: "mid", width: 108, help: "Federal Title I eligibility (NCES CCD)." },
  { key: "utilization", label: "Utilization", numeric: true, width: 148, help: "Enrollment ÷ capacity (FISH student stations). The inspector shows the statutory COFTE-based rate." },
  { key: "enrollment", label: "Enroll.", numeric: true, tier: "mid", width: 82, help: "Survey 2 membership enrollment (FL DOE), with its year." },
  { key: "capacity", label: "Capacity", numeric: true, tier: "full", width: 84, help: "Permanent FISH student stations (FL DOE)." },
  { key: "actions", label: "", numeric: true, width: 86 },
];
