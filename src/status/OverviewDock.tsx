// The "schools in view" bottom sheet: the map's results surface, in the pattern
// people already know from Redfin, Zillow, and Google Maps. A grabber handle and
// a count-forward header ("1,136 schools in view") peek at the bottom of the map;
// pulling it up reveals a scannable list of those schools (grade, name, district,
// facility-usage donut) that flies to and selects a school on tap, plus a single
// "Open in List" that hands the exact on-screen set to the full List table. Its
// job is glance-and-jump; sorting, search, compare and export live in List, so
// the sheet never becomes a spreadsheet.
//
// Responsive: a centered, capped-width sheet on desktop (clearing the inspector
// and the corner map controls); a full-width sheet flush to the bottom on phones.
// Every value derives from the SAME viewport-limited slice the map draws
// (useFilteredSchools inViewFeatures), so the sheet and map never disagree.

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Box, Paper, Typography, Stack, Collapse, Button, TextField, InputAdornment, useMediaQuery, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ChevronDown, ChevronUp, ArrowRight as ArrowForwardIcon, Search as SearchIcon, Close as CloseIcon } from "../ui/icons";
import { useStore, utilizationStyle, isUnderutilizedFacility, UTIL_COLORS } from "../store";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { schoolTypeLabel } from "../data/types";
import { SHELL_ON, SHELL_DIM, SHELL_MUTED, SHELL_HAIRLINE, TEAL, RADIUS } from "../muiTheme";
import type { SchoolFeature } from "../data/types";

const SLATE = "#334155";
const TRACK = "#E2E8F0";
const PLP_RED = "#D32F2F";
const CO_LOC_TEAL = "#0D9488"; // matches the teal co-location dot on the map
const COL_LABEL = { fontSize: 11, fontWeight: 600, letterSpacing: "0.01em", textTransform: "none" as const, color: SHELL_DIM };

// Small facility-usage donut: a ring filled to the facility utilization rate
// (COFTE / student stations when reported, else enrollment / capacity), with the
// rate in the center and the ring tinted by the utilization tier (under / in use
// / full) from the shared utilizationStyle helper. Dashed empty ring when
// capacity is unreported.
function UsageDonut({ enrollment, capacity, cofte, surplus }: { enrollment: number | null; capacity: number | null; cofte?: number | null; surplus?: number | null }) {
  const size = 34, stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const u = utilizationStyle(enrollment, capacity, cofte ?? null, surplus ?? null);
  const pct = u.pct;
  const known = pct != null;
  const frac = known ? Math.max(0, Math.min(1, pct / 100)) : 0;
  const basisLabel = u.basis === "cofte" ? "COFTE / student stations" : "enrollment / capacity";
  return (
    <Box
      sx={{ position: "relative", width: size, height: size, flex: "none" }}
      title={known ? `${u.label}: ${pct}% utilized (${basisLabel})` : "No reported capacity"}
      aria-label={known ? `${u.label}, ${pct} percent utilized` : "Facility utilization not reported"}
    >
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} strokeDasharray={known ? undefined : "2.5 3"} />
        {known && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={u.color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${circ * frac} ${circ}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 300ms ease" }}
          />
        )}
      </svg>
      <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: pct != null && pct >= 100 ? 8.5 : 9.5, fontWeight: 800, color: known ? u.color : SHELL_MUTED, fontVariantNumeric: "tabular-nums" }}>
        {pct != null ? pct : "–"}
      </Box>
    </Box>
  );
}

export function OverviewDock() {
  const { ready, inViewFeatures, inViewTotal, inViewPlp, inViewUnderutilized, inViewCoLocation, ctx } = useFilteredSchools();
  const selectedMsid = useStore((s) => s.selectedSchoolMsid);
  const selectSchool = useStore((s) => s.selectSchool);
  const setViewMode = useStore((s) => s.setViewMode);
  const setListScope = useStore((s) => s.setListScope);
  // The ribbon counts double as filters: clicking one isolates that set across
  // the whole view (map + list + dock), reading the same store flags the filter
  // panel uses, so the two can never disagree.
  const plpOnly = useStore((s) => s.plpOnly);
  const coLocationOnly = useStore((s) => s.coLocationOnly);
  const facilityUseSelection = useStore((s) => s.facilityUseSelection);
  const setPlpOnly = useStore((s) => s.setPlpOnly);
  const setCoLocationOnly = useStore((s) => s.setCoLocationOnly);
  const toggleFacilityUse = useStore((s) => s.toggleFacilityUse);
  const underusedActive = facilityUseSelection.has("under");
  const [query, setQuery] = useState("");
  const theme = useTheme();
  const isLarge = useMediaQuery(theme.breakpoints.up("lg"));
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  // Collapsed to the peek by default so the map stays clear; the list pulls up on
  // demand with a smooth animation.
  const [open, setOpen] = useState(false);

  // Schools in view, PLP first, then by descending usage so the most-relevant
  // rows are at the top of the list.
  const rows = useMemo(() => {
    const usage = (f: SchoolFeature) => {
      const { enrollment, capacity } = f.properties;
      return enrollment != null && capacity != null && capacity > 0 ? enrollment / capacity : -1;
    };
    const q = query.trim().toLowerCase();
    const matched = q
      ? inViewFeatures.filter((f) => f.properties.name.toLowerCase().includes(q) || f.properties.msid.toLowerCase().includes(q))
      : inViewFeatures;
    return [...matched].sort((a, b) => {
      const ap = ctx.plp.has(a.properties.msid) ? 1 : 0;
      const bp = ctx.plp.has(b.properties.msid) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return usage(b) - usage(a);
    });
  }, [inViewFeatures, ctx, query]);

  // Virtualized: at full zoom-out "in view" can be every school (1,100+), and
  // this list (with a scannable icon, two text lines, and an SVG usage donut
  // per row) noticeably hitched the main thread on expand when every row
  // mounted as a real element. Only rows in/near the visible scroll window
  // mount; the container below is sized to the full virtual height so the
  // scrollbar and row positions stay correct for the rest.
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 58,
    overscan: 8,
  });

  if (!ready) return null;
  // When a school is selected on a smaller-than-lg screen the inspector claims the
  // bottom, so the sheet stands down (large screens fit both).
  if (selectedMsid && !isLarge) return null;

  const focus = (f: SchoolFeature) => {
    // Selecting drives MapView's fly-to effect, which smoothly pans + zooms the
    // map to the school. Keeping the animation in one place avoids double moves.
    selectSchool(f.properties.msid);
  };

  // Hand the exact on-screen set off to the full List table: scope it to the map
  // view, then switch. The bridge from spatial browsing to tabular analysis.
  const openInList = () => {
    setListScope("inView");
    setViewMode("list");
  };

  // "empty" means nothing is in view at all; a search that matches nothing is a
  // different state (handled inside the list), so it must not collapse the panel.
  const empty = inViewTotal === 0;
  const noMatches = rows.length === 0;

  return (
    <Box
      sx={{
        position: "absolute", zIndex: 8, pointerEvents: "none",
        // The dock stays on the SAME bottom baseline as the scale/coordinate
        // readout (bottom-left) and the zoom controls (bottom-right), and never
        // covers them: it is a positioned band inset past the readout on the left
        // and the controls on the right, with a compact card centred inside. The
        // card is narrow (a stacked count + three equal stats), so it fits that
        // clear middle space at every width. Below lg the readout sits close to
        // screen centre, so the left inset must clear it; at lg the map is wide
        // enough for a near-centred card to clear both, so the insets shrink.
        display: "flex", justifyContent: "center",
        bottom: isMobile ? 22 : 28,
        left: isMobile ? 0 : { sm: 284, lg: 24 },
        right: isMobile ? 0 : { sm: 68, lg: 24 },
        // Animate the position so crossing a breakpoint glides instead of jumping.
        transition: "left 220ms cubic-bezier(0.4,0,0.2,1), right 220ms cubic-bezier(0.4,0,0.2,1), bottom 220ms cubic-bezier(0.4,0,0.2,1)",
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          pointerEvents: "auto", overflow: "hidden", display: "flex", flexDirection: "column",
          bgcolor: alpha("#ffffff", 0.97), backdropFilter: "saturate(140%) blur(8px)",
          border: `1px solid ${SHELL_HAIRLINE}`,
          borderRadius: 0, flex: "0 1 auto",
          boxShadow: "0 2px 24px rgba(15,23,42,0.14)",
          // Animate width so collapse/expand and breakpoint changes glide.
          transition: "width 240ms cubic-bezier(0.4,0,0.2,1)",
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          // Compact when collapsed (a narrow stacked card); wider when expanded so
          // the list has room. Capped to the band width so it never overruns the
          // corner controls it is centred between.
          width: isMobile
            ? "100%"
            : open
              ? { sm: "min(520px, 100%)", lg: "min(760px, 100%)" }
              : "min(300px, 100%)",
        }}
      >
        {/* Collapsed peek: a compact stacked card. The count is the pull-up
            toggle at the top; below it the three filter stats stack as equal,
            aligned full-width rows (same size, numbers right-aligned to a shared
            column so the labels line up). Stacking keeps the card narrow so it
            sits in the clear space beside the scale/coordinate readout. */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, px: 2, py: 1.5 }}>
          <Box
            component="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Collapse schools in view" : "Expand schools in view"}
            disabled={empty}
            sx={{
              appearance: "none", font: "inherit", textAlign: "left", width: "100%",
              bgcolor: "transparent", border: "none", borderRadius: 0, p: 0.5, mx: -0.5, mt: -0.5,
              cursor: empty ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 0.75,
              "&:focus-visible": { outline: `2px solid ${TEAL}`, outlineOffset: 1 },
            }}
          >
            {!empty && (
              <Box aria-hidden sx={{ display: "flex", color: SHELL_DIM, flex: "none" }}>
                {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </Box>
            )}
            <Typography component="span" sx={{ fontSize: 17, fontWeight: 700, color: SHELL_ON, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {inViewTotal.toLocaleString("en-US")}
            </Typography>
            <Typography component="span" sx={{ fontSize: 13, color: SHELL_DIM, whiteSpace: "nowrap" }}>
              school{inViewTotal === 1 ? "" : "s"} in view
            </Typography>
          </Box>

          {/* Filter stats: each isolates its set across the whole view. Separate
              buttons, never nested in the toggle above. Equal, aligned rows. */}
          {!empty && (
            <Stack spacing={0.75} sx={{ width: "100%" }}>
              <FilterStat label="PLP" value={inViewPlp} color={PLP_RED} active={plpOnly}
                onClick={() => { const v = !plpOnly; setPlpOnly(v); if (v) setOpen(true); }}
                title="Persistently low-performing schools (F.S. 1002.333). Click to show only these." />
              <FilterStat label="Underused" value={inViewUnderutilized} color={SLATE} active={underusedActive}
                onClick={() => { const willActivate = !underusedActive; toggleFacilityUse("under"); if (willActivate) setOpen(true); }}
                title="Facilities under the 75% / 400-station threshold, all types. Click to show only these." />
              <FilterStat label="Co-location" value={inViewCoLocation} color={CO_LOC_TEAL} active={coLocationOnly}
                onClick={() => { const v = !coLocationOnly; setCoLocationOnly(v); if (v) setOpen(true); }}
                title="Co-location candidates: underused district facilities in a School of Hope siting area. Click to show only these." />
            </Stack>
          )}
        </Box>

        <Collapse in={open && !empty} timeout={260}>
          <Box sx={{ borderTop: `1px solid ${SHELL_HAIRLINE}` }}>
            {/* Search within the in-view set. */}
            <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${SHELL_HAIRLINE}` }}>
              <TextField
                fullWidth size="small" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search schools in view by name or MSID"
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon size={16} /></InputAdornment>,
                  endAdornment: query ? (
                    <InputAdornment position="end">
                      <Box component="button" aria-label="Clear search" onClick={() => setQuery("")} sx={{ appearance: "none", border: "none", bgcolor: "transparent", cursor: "pointer", color: SHELL_DIM, display: "flex", p: 0.25 }}>
                        <CloseIcon size={14} />
                      </Box>
                    </InputAdornment>
                  ) : undefined,
                }}
                sx={{ "& .MuiInputBase-root": { fontSize: 13 } }}
              />
            </Box>
            {/* Column labels. Facility use is shown per row as a usage donut, and
                only the underused schools carry an explicit label, so no separate
                color key is needed. */}
            <Box sx={{ px: 3, pt: 1.5, pb: 1.25, borderBottom: `1px solid ${SHELL_HAIRLINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography sx={COL_LABEL}>{query ? `School (${rows.length.toLocaleString("en-US")})` : "School"}</Typography>
              <Typography
                sx={{ ...COL_LABEL, cursor: "help" }}
                title="Facility use = enrollment vs. FISH student stations. Underused = utilization at or below 75% OR 400+ surplus stations (the co-location threshold), per FL DOE Rule 6A-1.0998271."
              >
                Facility use
              </Typography>
            </Box>
            <Box ref={listContainerRef} sx={{ maxHeight: isMobile ? "46vh" : "38vh", overflowY: "auto", px: 1.5, py: 1 }}>
              {noMatches && (
                <Typography sx={{ px: 1.5, py: 2, fontSize: 13, color: SHELL_DIM, textAlign: "center" }}>
                  No schools in view match &quot;{query}&quot;.
                </Typography>
              )}
              <Box sx={{ position: "relative", height: rowVirtualizer.getTotalSize(), width: "100%" }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const f = rows[virtualRow.index];
                  const p = f.properties;
                  const gs = resolveGradeStyle(p.current_grade);
                  const isPlp = ctx.plp.has(p.msid);
                  const underused = isUnderutilizedFacility(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
                  return (
                    <Stack
                      key={p.msid} direction="row" alignItems="center" spacing={1.5}
                      data-index={virtualRow.index}
                      ref={(el) => rowVirtualizer.measureElement(el)}
                      onClick={() => focus(f)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Focus ${p.name} on the map`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          focus(f);
                        }
                      }}
                      sx={{
                        position: "absolute", top: 0, left: 0, width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        px: 1.5, py: 1, borderRadius: 0, cursor: "pointer",
                        bgcolor: p.msid === selectedMsid ? alpha("#1976D2", 0.1) : "transparent",
                        transition: "background-color 120ms ease",
                        "&:hover": { bgcolor: p.msid === selectedMsid ? alpha("#1976D2", 0.14) : alpha(SHELL_ON, 0.04) },
                        "&:focus-visible": { outline: `2px solid #1976D2`, outlineOffset: -2 },
                      }}
                    >
                      <Box sx={{
                        width: 24, height: 24, borderRadius: RADIUS.sm, flex: "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10.5, fontWeight: 800,
                        bgcolor: rgbaToCss(gs.fill), color: rgbaToCss(gs.letterColor),
                        border: `1.25px ${gs.dashed ? "dashed" : "solid"} ${rgbaToCss(gs.stroke)}`,
                      }}>{gs.letter}</Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: SHELL_ON, lineHeight: 1.25 }}>{p.name}</Typography>
                        <Typography noWrap sx={{ fontSize: 11.5, color: SHELL_DIM, lineHeight: 1.25 }}>
                          {p.county}, {schoolTypeLabel(p.type)}
                          {isPlp ? <>, <Box component="span" sx={{ color: PLP_RED, fontWeight: 700 }}>PLP</Box></> : null}
                          {underused ? (
                            <>
                              , <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4 }}>
                                <Box component="span" sx={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", bgcolor: UTIL_COLORS.under, flex: "none" }} />
                                <Box component="span" sx={{ fontWeight: 700 }}>Underused</Box>
                              </Box>
                            </>
                          ) : null}
                        </Typography>
                      </Box>
                      <UsageDonut enrollment={p.enrollment} capacity={p.capacity} cofte={p.cofte} surplus={p.fish_surplus} />
                    </Stack>
                  );
                })}
              </Box>
            </Box>
            {/* Bridge to the full analytical table. */}
            <Box sx={{ borderTop: `1px solid ${SHELL_HAIRLINE}`, p: 1.5 }}>
              <Button
                fullWidth
                onClick={openInList}
                endIcon={<ArrowForwardIcon size={16} />}
                sx={{ textTransform: "none", fontWeight: 600, color: TEAL, py: 1.25, borderRadius: 0, justifyContent: "space-between", px: 1.5, "&:hover": { bgcolor: alpha(TEAL, 0.08) } }}
              >
                Open {inViewTotal.toLocaleString("en-US")} in the list to sort, compare, and export
              </Button>
            </Box>
          </Box>
        </Collapse>
      </Paper>
    </Box>
  );
}

// A ribbon stat that doubles as a filter toggle. Active = the whole view is
// isolated to this set; a small x signals "click to clear". aria-pressed makes
// the toggle state available to assistive tech.
function FilterStat({ label, value, color, active, onClick, title }: { label: string; value: number; color: string; active: boolean; onClick: () => void; title?: string }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      sx={{
        appearance: "none", font: "inherit", cursor: "pointer", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 0.75, width: "100%",
        px: 1, py: 0.6, borderRadius: RADIUS.sm,
        border: `1px solid ${active ? alpha(color, 0.5) : SHELL_HAIRLINE}`,
        bgcolor: active ? alpha(color, 0.12) : "transparent",
        "&:hover": { bgcolor: active ? alpha(color, 0.18) : alpha(SHELL_ON, 0.04) },
        "&:focus-visible": { outline: `2px solid ${color}`, outlineOffset: 1 },
      }}
    >
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flex: "none" }} />
      {/* Numbers share a fixed, right-aligned column so the labels line up down
          the stack regardless of digit count. */}
      <Typography component="span" sx={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1, minWidth: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value.toLocaleString("en-US")}
      </Typography>
      <Typography component="span" sx={{ fontSize: 12.5, color: SHELL_DIM, fontWeight: active ? 600 : 400 }}>{label}</Typography>
      {active && <CloseIcon size={12} style={{ color: SHELL_DIM, marginLeft: "auto" }} />}
    </Box>
  );
}
