// The school table for the List view, the tool's analytical surface. Reads the
// same useFilteredSchools source of truth as the map, so the rows always match
// what the map draws; the scope prop chooses all filtered schools or just those
// in the current map view. Sortable columns, a "search by"
// field selector, decision flags (PLP, SoH-eligible), and per-row actions
// (zoom-to, compare). Clicking a row selects the school (opens the inspector)
// and pans the map; when the selection changes elsewhere (a pin click), the
// matching row scrolls into view and highlights. No em dashes in this file.

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, Chip, Typography, TextField, InputAdornment, Stack, Skeleton,
  Select, MenuItem, IconButton, Tooltip, Button,
} from "@mui/material";
import { Search as SearchIcon, Location as MyLocationIcon, Compare as CompareArrowsIcon } from "@carbon/icons-react";
import { alpha } from "@mui/material/styles";
import { useData } from "../data/DataContext";
import { useStore, utilizationBucket, MAX_COMPARE } from "../store";
import { panMapTo } from "../map/mapController";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { ACCENT_TEXT } from "../muiTheme";
import { schoolTypeLabel, titleILabel, type SchoolFeature } from "../data/types";

const RED_STRONG = "#B71C1C";  // PLP
const CO_LOC_BLUE = "#1D4ED8";  // co-location target
const TITLE_I_PURPLE = "#7C3AED"; // economic-disadvantage proxy (Title I)

type Order = "asc" | "desc";
type SortKey = "name" | "type" | "county" | "level" | "titleI" | "enrollment" | "capacity" | "utilization";
type SearchField = "name" | "county" | "grade" | "type";

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

  const [orderBy, setOrderBy] = useState<SortKey>("utilization");
  const [order, setOrder] = useState<Order>("desc");
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("name");

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
  const phone = availWidth < 560;
  const columns = COLUMNS.filter((c) => {
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
      .filter((f) => {
        if (!q) return true;
        const p = f.properties;
        switch (searchField) {
          case "county": return p.county.toLowerCase().includes(q);
          case "grade": return p.current_grade.toLowerCase().includes(q);
          case "type": return schoolTypeLabel(p.type).toLowerCase().includes(q) || p.type.toLowerCase().includes(q);
          default: return p.name.toLowerCase().includes(q) || p.msid.toLowerCase().includes(q);
        }
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
  }, [features, ctx, query, searchField]);

  const sorted = useMemo(() => [...rows].sort((a, b) => compareRows(a, b, orderBy, order)), [rows, orderBy, order]);

  const handleSort = (key: SortKey) => {
    if (orderBy === key) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setOrderBy(key);
      setOrder(key === "name" || key === "type" || key === "county" || key === "level" || key === "titleI" ? "asc" : "desc");
    }
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
    estimateSize: () => (dense ? 44 : 56),
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
          {!dense && (
            <Stack spacing={0}>
              <Typography variant="caption" color="text.secondary">
                {schools == null ? "Loading schools..." : `Sorted by ${LABEL[orderBy]}, ${order === "asc" ? "ascending" : "descending"}`}
              </Typography>
              {schools != null && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  Enrollment: NCES CCD 2023-24. Capacity: FL DOE FISH. Grades: FL DOE. Hover a column header for details.
                </Typography>
              )}
            </Stack>
          )}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: "1 1 auto", minWidth: 0, justifyContent: "flex-end", flexWrap: "wrap", rowGap: 1 }}>
          <Select
            size="small"
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as SearchField)}
            sx={{ fontSize: 13, minWidth: 118, flex: "0 0 auto", bgcolor: "background.paper" }}
            aria-label="Search by field"
          >
            <MenuItem value="name" sx={{ fontSize: 13 }}>Name / MSID</MenuItem>
            <MenuItem value="county" sx={{ fontSize: 13 }}>County</MenuItem>
            <MenuItem value="grade" sx={{ fontSize: 13 }}>Grade</MenuItem>
            <MenuItem value="type" sx={{ fontSize: 13 }}>Type</MenuItem>
          </Select>
          <TextField
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={SEARCH_PLACEHOLDER[searchField]}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon size={16} /></InputAdornment> }}
            sx={{ flex: "1 1 160px", minWidth: 130, maxWidth: dense ? 240 : 280 }}
          />
        </Stack>
      </Box>

      <TableContainer ref={containerRef} component={Paper} elevation={0} square sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <Table stickyHeader size="small" sx={{ tableLayout: "fixed", width: "100%", "& .MuiTableCell-root": { px: 1.25 } }}>
          <TableHead>
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
                  hover
                  selected={selected}
                  onClick={() => openSchool(r)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open details for ${r.name}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openSchool(r);
                    }
                  }}
                  sx={{
                    cursor: "pointer",
                    "&.Mui-selected": { bgcolor: alpha("#2563EB", 0.08) },
                    "&.Mui-selected:hover": { bgcolor: alpha("#2563EB", 0.14) },
                    "&:focus-visible": { outline: `2px solid ${ACCENT_TEXT}`, outlineOffset: -2 },
                  }}
                >
                  {/* School: grade badge + name + MSID + decision flags, one column */}
                  <TableCell>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <Box
                        title={gs.description}
                        sx={{
                          width: 30, height: 30, borderRadius: 1, flex: "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12.5, fontWeight: 800,
                          bgcolor: rgbaToCss(gs.fill), color: rgbaToCss(gs.letterColor),
                          border: `1.25px ${gs.dashed ? "dashed" : "solid"} ${rgbaToCss(gs.stroke)}`,
                        }}
                      >
                        {gs.letter}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" title={r.name} sx={{ fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25, flexWrap: "wrap", rowGap: 0.25 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono)" }}>{r.msid}</Typography>
                          {r.isPlp && <FlagChip label="PLP" color={RED_STRONG} title="Persistently low-performing (F.S. 1002.333). A hope operator may open to serve this school's students." />}
                          {r.isCoLocation && <FlagChip label="Co-loc" color={CO_LOC_BLUE} title="Co-location candidate: an underused district building (utilization at or below 75%, or 400+ surplus stations) in a School of Hope siting area. Rent-free co-location is possible under Rule 6A-1.0998271; the rule's exclusion of buildings under 4 years old is not checked here." />}
                        </Stack>
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
                  <TableCell align="right">
                    <UtilizationCell util={r.utilization} bucket={r.bucket} dense={compact} />
                  </TableCell>
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
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Tooltip title="Show on map" placement="top">
                      <IconButton size="small" onClick={(e) => showOnMap(e, r)} aria-label={`Show ${r.name} on map`}>
                        <MyLocationIcon size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={pinned ? "Remove from compare" : comparePinned.length >= MAX_COMPARE ? `Compare holds up to ${MAX_COMPARE} sites` : "Add to compare"} placement="top">
                      <span>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); toggleComparePin(r.msid); }}
                          disabled={!pinned && comparePinned.length >= MAX_COMPARE}
                          aria-label={pinned ? `Remove ${r.name} from compare` : `Add ${r.name} to compare`}
                          sx={{ color: pinned ? ACCENT_TEXT : undefined }}
                        >
                          <CompareArrowsIcon size={16} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
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
                      onClick={() => (query.trim() ? setQuery("") : useStore.getState().resetAll())}
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

function UtilizationCell({ util, bucket, dense }: { util: number | null; bucket: Row["bucket"]; dense: boolean }) {
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
    <Stack direction="row" alignItems="center" spacing={1} justifyContent="flex-end">
      <Box sx={{ width: dense ? 56 : 88, height: 6, bgcolor: "action.hover", borderRadius: 3, overflow: "hidden", flex: "none" }}>
        <Box sx={{ width: `${fillPct}%`, height: "100%", bgcolor: color, borderRadius: 3 }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 700, color, fontVariantNumeric: "tabular-nums", minWidth: 46, textAlign: "right" }}>
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
  { key: "titleI", label: "Title I", tier: "mid", width: 108, help: "Federal Title I eligibility (NCES CCD), the available proxy for economic disadvantage. Schoolwide programs serve 40%+ low-income enrollment. A per-school free / reduced-price-lunch rate is a planned data addition." },
  { key: "utilization", label: "Utilization", numeric: true, width: 148, help: "Enrollment ÷ capacity (FISH student stations), so it reconciles with the Enrollment and Capacity columns. A school's inspector shows the statutory COFTE-based Facility Utilization Rate, with its own disclosure." },
  { key: "enrollment", label: "Enroll.", numeric: true, tier: "mid", width: 82, help: "Membership enrollment (NCES CCD, 2023-24)." },
  { key: "capacity", label: "Capacity", numeric: true, tier: "full", width: 84, help: "Permanent FISH student stations (FL DOE)." },
  { key: "actions", label: "", numeric: true, width: 86 },
];

const LABEL: Record<SortKey, string> = {
  name: "school name",
  type: "type",
  county: "county",
  level: "level",
  titleI: "Title I",
  enrollment: "enrollment",
  capacity: "capacity",
  utilization: "utilization",
};

const SEARCH_PLACEHOLDER: Record<SearchField, string> = {
  name: "Search name or MSID",
  county: "Search county",
  grade: "Search grade (A, B, ...)",
  type: "Search type",
};
