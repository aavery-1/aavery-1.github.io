// The "schools in view" results surface, in the pattern people know from Redfin,
// Zillow, and Google/Apple Maps. Its job is glance-and-jump; sorting, search,
// compare and export live in List, so it never becomes a spreadsheet. Every value
// derives from the SAME viewport-limited slice the map draws (useFilteredSchools
// inViewFeatures), so the sheet and map never disagree.
//
// Strictly Carbon: plain elements styled by OverviewDock.css with --cds tokens (no
// MUI). Two responsive forms, one source of truth for the content:
//   - Desktop/tablet: a centered, capped-width floating card; a count-forward peek
//     expands into the list on demand.
//   - Phone: a floating DRAGGABLE sheet with three snap points (peek / half /
//     full), a grabber handle, and the PLP / Underused / Co-location filters as a
//     horizontal chip row. The grabber is the only drag surface so it never fights
//     the list's own scroll. No em dashes in this file.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search as CarbonSearch } from "@carbon/react";
import { ChevronDown, ChevronUp, ArrowRight as ArrowForwardIcon, Close as CloseIcon } from "@carbon/icons-react";
import { useStore, utilizationStyle, isUnderutilizedFacility, UTIL_COLORS } from "../store";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { schoolTypeLabel } from "../data/types";
import { usePhone, useMediaQuery } from "../ui/useMediaQuery";
import type { SchoolFeature } from "../data/types";
import "./OverviewDock.css";

const SLATE = "#334155";
const TRACK = "#E2E8F0";
const MUTED = "#94A3B8";
const PLP_RED = "#D32F2F";
const CO_LOC_TEAL = "#0D9488"; // matches the teal co-location dot on the map

// Phone sheet detents, as a fraction of the map area height (peek is a fixed px).
const PEEK_PX = 96;
const HALF_FRAC = 0.55;
const FULL_FRAC = 0.92;

// Small facility-usage donut: a ring filled to the utilization rate, tinted by the
// utilization tier, with the rate in the center. Dashed empty ring when capacity is
// unreported.
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
    <div
      className="dock-donut"
      style={{ width: size, height: size }}
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
      <span className="dock-donut__pct" style={{ fontSize: pct != null && pct >= 100 ? 8.5 : 9.5, color: known ? u.color : MUTED }}>
        {pct != null ? pct : "–"}
      </span>
    </div>
  );
}

export function OverviewDock() {
  const { ready, inViewFeatures, inViewTotal, inViewPlp, inViewUnderutilized, inViewCoLocation, ctx } = useFilteredSchools();
  const selectedMsid = useStore((s) => s.selectedSchoolMsid);
  const selectSchool = useStore((s) => s.selectSchool);
  const setViewMode = useStore((s) => s.setViewMode);
  // The shortlist tray claims the same bottom band; when it is open the "schools
  // in view" peek stands down, the way it already does for the inspector.
  const shortlistOpen = useStore((s) => s.shortlistOpen);
  const setListScope = useStore((s) => s.setListScope);
  // The ribbon counts double as filters: clicking one isolates that set across the
  // whole view (map + list + dock), reading the same store flags the filter panel
  // uses, so the two can never disagree.
  const plpOnly = useStore((s) => s.plpOnly);
  const coLocationOnly = useStore((s) => s.coLocationOnly);
  const facilityUseSelection = useStore((s) => s.facilityUseSelection);
  const setPlpOnly = useStore((s) => s.setPlpOnly);
  const setCoLocationOnly = useStore((s) => s.setCoLocationOnly);
  const toggleFacilityUse = useStore((s) => s.toggleFacilityUse);
  const underusedActive = facilityUseSelection.has("under");
  const [query, setQuery] = useState("");
  const isLarge = useMediaQuery("(min-width: 1200px)");
  const isMobile = usePhone();
  // Desktop: collapsed to the peek by default so the map stays clear.
  const [open, setOpen] = useState(false);

  // Phone sheet state: snap index (0 peek / 1 half / 2 full) and a transient drag
  // height in px. The map area height is tracked so the fractional detents stay
  // correct across rotation / resize.
  const [snap, setSnap] = useState<0 | 1 | 2>(0);
  const [dragH, setDragH] = useState<number | null>(null);
  const [areaH, setAreaH] = useState<number>(() => (typeof window !== "undefined" ? window.innerHeight - 48 : 640));
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean; curH: number } | null>(null);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const onResize = () => setAreaH(window.innerHeight - 48);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const detents = useMemo(
    () => [PEEK_PX, Math.round(areaH * HALF_FRAC), Math.round(areaH * FULL_FRAC)] as const,
    [areaH],
  );

  // Schools in view, PLP first, then by descending usage so the most-relevant rows
  // are at the top of the list.
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

  // Virtualized: at full zoom-out "in view" can be every school (1,100+); only rows
  // in/near the visible scroll window mount, and the container below is sized to the
  // full virtual height so the scrollbar and row positions stay correct.
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
  // The shortlist tray owns the bottom band when open (including its empty state).
  if (shortlistOpen) return null;

  const focus = (f: SchoolFeature) => selectSchool(f.properties.msid);

  // Hand the exact on-screen set off to the full List table.
  const openInList = () => {
    setListScope("inView");
    setViewMode("list");
  };

  // "empty" means nothing is in view at all; a search that matches nothing is a
  // different state (handled inside the list), so it must not collapse the panel.
  const empty = inViewTotal === 0;
  const noMatches = rows.length === 0;

  // --- Shared content pieces (identical in both responsive forms) ---------------

  const searchField = (
    <CarbonSearch
      size="lg"
      className="dock-search"
      labelText="Search schools in view"
      placeholder="Search schools in view by name or MSID"
      value={query}
      onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
      onClear={() => setQuery("")}
    />
  );

  const colLabels = (
    <div className="dock-colhead">
      <span className="dock-colhead__label">{query ? `School (${rows.length.toLocaleString("en-US")})` : "School"}</span>
      <span
        className="dock-colhead__label dock-colhead__label--help"
        title="Facility use compares enrollment to FISH student stations (permanent capacity). Underused means 75% or below, or 400+ surplus stations, the co-location threshold. Rule 6A-1.0998271."
      >
        Facility use
      </span>
    </div>
  );

  // The virtualized rows (position:absolute inside a full-height spacer). Shared
  // between the desktop scroll box and the phone sheet body.
  const virtualRows = (
    <div className="dock-rows" style={{ height: rowVirtualizer.getTotalSize() }}>
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const f = rows[virtualRow.index];
        const p = f.properties;
        const gs = resolveGradeStyle(p.current_grade);
        const isPlp = ctx.plp.has(p.msid);
        const underused = isUnderutilizedFacility(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
        return (
          <div
            key={p.msid}
            className={`dock-row${p.msid === selectedMsid ? " dock-row--selected" : ""}`}
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
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <span
              className="dock-row__grade"
              style={{
                background: rgbaToCss(gs.fill),
                color: rgbaToCss(gs.letterColor),
                border: `1.25px ${gs.dashed ? "dashed" : "solid"} ${rgbaToCss(gs.stroke)}`,
              }}
            >
              {gs.letter}
            </span>
            <span className="dock-row__text">
              <span className="dock-row__name">{p.name}</span>
              <span className="dock-row__sub">
                {p.county}, {schoolTypeLabel(p.type)}
                {isPlp ? <>, <span style={{ color: PLP_RED, fontWeight: 600 }}>PLP</span></> : null}
                {underused ? <>, <span style={{ fontWeight: 600, color: UTIL_COLORS.under }}>Underused</span></> : null}
              </span>
            </span>
            <UsageDonut enrollment={p.enrollment} capacity={p.capacity} cofte={p.cofte} surplus={p.fish_surplus} />
          </div>
        );
      })}
    </div>
  );

  const noMatchesMsg = noMatches ? (
    <div className="dock-nomatch">No schools in view match &quot;{query}&quot;.</div>
  ) : null;

  const openInListBtn = (
    <button type="button" className="dock-openlist" onClick={openInList}>
      <span>Open {inViewTotal.toLocaleString("en-US")} in the list to sort, compare, and export</span>
      <ArrowForwardIcon size={16} style={{ flex: "none" }} />
    </button>
  );

  const expandBody = (
    <div className="dock-expand">
      <div className="dock-searchwrap">{searchField}</div>
      {colLabels}
      <div className="dock-list" ref={listContainerRef}>
        {noMatchesMsg}
        {virtualRows}
      </div>
      {openInListBtn}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Phone: draggable bottom sheet with peek / half / full detents.
  // ---------------------------------------------------------------------------
  if (isMobile) {
    const height = dragH != null ? dragH : detents[snap];
    const expanded = height > PEEK_PX + 8;
    const showBody = height > PEEK_PX + 40;

    const endDrag = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      // A tap (no drag) is a binary expand/collapse, matching the two-state
      // chevron: collapse from any expanded detent, else expand to half. The full
      // detent stays reachable by dragging or the Arrow keys.
      if (!d.moved) {
        setSnap((s) => (s === 0 ? 1 : 0));
        setDragH(null);
        return;
      }
      const h = d.curH;
      let best: 0 | 1 | 2 = 0;
      let bestDist = Infinity;
      detents.forEach((t, i) => {
        const dist = Math.abs(t - h);
        if (dist < bestDist) { bestDist = dist; best = i as 0 | 1 | 2; }
      });
      setSnap(best);
      setDragH(null);
    };

    const onPointerDown = (e: React.PointerEvent) => {
      try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* no-op */ }
      dragRef.current = { startY: e.clientY, startH: detents[snap], moved: false, curH: detents[snap] };
      setDragH(detents[snap]);
    };
    const onPointerMove = (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = d.startY - e.clientY;
      if (Math.abs(dy) > 4) d.moved = true;
      const h = Math.min(detents[2], Math.max(PEEK_PX, d.startH + dy));
      d.curH = h;
      setDragH(h);
    };

    // Activating a filter from the peek reveals the results it produced.
    const revealOnFilter = () => { if (snap === 0) setSnap(1); };

    return (
      <div className="dock-mobile" style={{ display: empty ? "none" : "block" }}>
        <div
          className="dock-sheet"
          style={{ height, transition: dragH != null || reduceMotion ? "none" : "height 300ms cubic-bezier(0.32,0.72,0,1)" }}
        >
          {/* Grabber: the only drag surface, so it never fights the list scroll. */}
          <div
            className="dock-grabber"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="button"
            tabIndex={0}
            aria-label={expanded ? "Collapse schools in view" : "Expand schools in view"}
            aria-expanded={expanded}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSnap((s) => (s === 0 ? 1 : 0)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSnap((s) => Math.min(2, s + 1) as 0 | 1 | 2); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setSnap((s) => Math.max(0, s - 1) as 0 | 1 | 2); }
            }}
          >
            <div className="dock-grabber__bar" aria-hidden />
            <div className="dock-head">
              <span className="dock-count">{inViewTotal.toLocaleString("en-US")}</span>
              <span className="dock-count-label">school{inViewTotal === 1 ? "" : "s"} in view</span>
              <span className="dock-head__chevron" aria-hidden>{expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</span>
            </div>
          </div>

          {/* Quick-filter chips. The "all filters" entry is NOT repeated here: the
              map already carries a Filters button (MapQuickActions), so a second one
              in the sheet would be redundant. */}
          <div className="dock-filterrow">
            <FilterStat compact label="PLP" value={inViewPlp} color={PLP_RED} active={plpOnly}
              onClick={() => { setPlpOnly(!plpOnly); revealOnFilter(); }}
              title="Persistently low-performing schools (F.S. 1002.333). Tap to show only these." />
            <FilterStat compact label="Underused" value={inViewUnderutilized} color={SLATE} active={underusedActive}
              onClick={() => { toggleFacilityUse("under"); revealOnFilter(); }}
              title="Facilities under the 75% / 400-station threshold. Tap to show only these." />
            <FilterStat compact label="Co-location" value={inViewCoLocation} color={CO_LOC_TEAL} active={coLocationOnly}
              onClick={() => { setCoLocationOnly(!coLocationOnly); revealOnFilter(); }}
              title="Co-location candidates: underused district facilities in a siting area. Tap to show only these." />
          </div>

          {/* Body: mounted only once the sheet is meaningfully open. */}
          {showBody && expandBody}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Desktop / tablet: a compact bar tucked into the bottom-right corner beside the
  // map controls (same 40px height as a control button, for a uniform corner). The
  // collapsed state is just the count bar; expanding grows the stats + list UPWARD
  // from that bar, so the corner stays snug until the analyst asks for detail.
  // ---------------------------------------------------------------------------
  const statsRow = !empty && (
    <div className="dock-stats-row">
      <FilterStat compact label="PLP" value={inViewPlp} color={PLP_RED} active={plpOnly}
        onClick={() => { setPlpOnly(!plpOnly); }}
        title="Persistently low-performing schools (F.S. 1002.333). Click to show only these." />
      <FilterStat compact label="Underused" value={inViewUnderutilized} color={SLATE} active={underusedActive}
        onClick={() => { toggleFacilityUse("under"); }}
        title="Facilities under the 75% / 400-station threshold, all types. Click to show only these." />
      <FilterStat compact label="Co-location" value={inViewCoLocation} color={CO_LOC_TEAL} active={coLocationOnly}
        onClick={() => { setCoLocationOnly(!coLocationOnly); }}
        title="Co-location candidates: underused district facilities in a School of Hope siting area. Click to show only these." />
    </div>
  );

  // Count header stays at the TOP of the card in both states, so it is anchored
  // when the list expands beneath it. The card is bottom-anchored and grows
  // upward; a grid-rows 0fr->1fr transition animates the expand smoothly without
  // hard-coding the content height.
  return (
    <div className="dock-desktop">
      <div className={`dock-card${open && !empty ? " dock-card--open" : ""}`}>
        <button
          type="button"
          className="dock-bar"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse schools in view" : "Expand schools in view"}
          disabled={empty}
        >
          <span className="dock-bar__group">
            <span className="dock-count">{inViewTotal.toLocaleString("en-US")}</span>
            <span className="dock-count-label">school{inViewTotal === 1 ? "" : "s"} in view</span>
          </span>
          {!empty && (
            <span className="dock-bar__chevron" aria-hidden>{open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</span>
          )}
        </button>
        <div className="dock-expand-anim">
          <div className="dock-expand-anim__inner">
            {!empty && (
              <>
                {statsRow}
                {expandBody}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// A stat that doubles as a filter toggle. Active = the whole view is isolated to
// this set; a small x signals "click to clear". The semantic color rides on the
// --stat-color CSS variable. `compact` is the phone chip; otherwise a full-width
// stacked row for the desktop card.
function FilterStat({ label, value, color, active, onClick, title, compact }: { label: string; value: number; color: string; active: boolean; onClick: () => void; title?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      className={`dock-stat ${compact ? "dock-stat--compact" : "dock-stat--full"}${active ? " dock-stat--active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      title={title}
      style={{ "--stat-color": color } as CSSProperties}
    >
      <span className="dock-stat__dot" />
      <span className="dock-stat__value">{value.toLocaleString("en-US")}</span>
      <span className="dock-stat__label">{label}</span>
      {active && <span className="dock-stat__x" aria-hidden><CloseIcon size={12} /></span>}
    </button>
  );
}
