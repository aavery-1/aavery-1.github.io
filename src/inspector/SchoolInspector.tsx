// Right-column inspector for a selected school. A bordered surface with a header
// (identity at a glance), a scrollable body of MECE sections, and a footer with
// the primary actions.
//
// Real IBM Carbon: plain elements styled by SchoolInspector.carbon.css (g10
// tokens) plus @carbon/react Button / IconButton / Tag; NO MUI. Data encodings
// (grade fills, the utilization tier color, the trend delta color) are set inline
// from the shared source of truth so the panel never disagrees with the map/list.
//
// Unlike the map overlays, the inspector's location and community facts are
// ALWAYS shown: a school has a board district, legislative districts, an income
// context, and an opportunity-zone status regardless of which map layers happen
// to be toggled on. Those come straight from the spatial indexes (loaded eagerly
// in DataContext), so toggling a layer never blanks a fact the analyst needs.
//
// Sections, in decision order: verdict first, then key indicators, enrollment &
// capacity, academic performance, location & districts, community context.
// No em dashes in this file.

import { useState, useRef, useEffect, useCallback } from "react";
import { Button, IconButton, Tag } from "@carbon/react";
import { Close as CloseIcon, Bookmark as BookmarkIcon, BookmarkFilled as BookmarkFilledIcon, Location as PlaceIcon, CheckmarkFilled as CheckCircleIcon, Misuse as CancelIcon, Filter as FilterIcon, Help as HelpIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from "@carbon/icons-react";
import { useData } from "../data/DataContext";
import { useStore, MAX_COMPARE, utilizationStyle } from "../store";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { GradeTimeline } from "./GradeTimeline";
import {
  incomeAtPoint, boardDistrictAtPoint, opportunityZoneAtPoint,
  legislativeDistrictsAtPoint,
} from "../data/derive/contextReads";
import { ExportButton } from "../tools/ExportButton";
import { evaluateSitingArea, isCoLocationTarget, isDistrictOperated } from "../data/derive/filters";
import { evaluatePlp, plpMsids } from "../data/derive/plp";
import { distanceMiles, type LngLat } from "../geo/measure";
import { titleILabel } from "../data/types";
import type { LegislativeProps, Representative } from "../data/types";
import "./SchoolInspector.carbon.css";

// Local color constants (Carbon roles / brand), so the inspector needs no MUI.
const NAVY = "#001e62";     // KIPP navy, interactive / chart line
const GREEN = "#24a148";    // Carbon green 50, eligible / growth
const RED = "#da1e28";      // Carbon red 60, decline
const DIM = "#525252";      // text-secondary, chart labels
const HAIRLINE = "#e0e0e0"; // border-subtle, gridlines
const CAPACITY = "#ef6c00"; // capacity reference line (amber)
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

function GradeBadge({ grade }: { grade: string }) {
  const s = resolveGradeStyle(grade);
  return (
    <span
      className="insp-grade"
      style={{
        background: rgbaToCss(s.fill),
        color: rgbaToCss(s.letterColor),
        border: `1.5px ${s.dashed ? "dashed" : "solid"} ${rgbaToCss(s.stroke)}`,
      }}
      aria-label={s.description}
    >
      {s.letter}
    </span>
  );
}

// A "nice" round number near x (1/2/5 x 10^n), used to place chart gridlines on
// readable intervals. `round` snaps to the nearest nice number; otherwise it
// rounds up. Standard axis-ticks helper (Heckbert).
function niceNum(x: number, round: boolean): number {
  if (!(x > 0)) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  const nf = round
    ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10)
    : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
  return nf * Math.pow(10, exp);
}

// Enrollment trend: real annual membership plotted against building capacity.
// Y-axis runs from 0 to the facility capacity (or the peak enrollment if that is
// higher), so the reader sees enrollment relative to how much room the building
// has. A dashed capacity line makes the ceiling explicit.
function EnrollmentTrend({ history, capacity }: { history: Array<{ year: string; enrollment: number }>; capacity: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  // The plot pane scrolls under the pinned axes, but with no scrollbar: two arrow
  // buttons page it instead. `nav` tracks whether each direction has more to show.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState({ canLeft: false, canRight: false });
  const updateNav = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const canLeft = el.scrollLeft > 1;
    const canRight = el.scrollLeft < max - 1;
    setNav((prev) => (prev.canLeft === canLeft && prev.canRight === canRight ? prev : { canLeft, canRight }));
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = 0;
    updateNav();
    window.addEventListener("resize", updateNav);
    return () => window.removeEventListener("resize", updateNav);
  }, [history, updateNav]);
  if (history.length < 2) {
    return <p className="insp-trend__empty">Not enough enrollment history to chart.</p>;
  }

  // Geometry for a PINNED-axis chart: the Y axis (values + "Students") and the X
  // title stay fixed while only the plot (line, area, points) and the year labels
  // scroll horizontally. Two SVGs of equal height share one vertical scale so
  // their rows line up: a fixed AXISW-wide y-axis, and a data-width plot that
  // scrolls inside .insp-chart__scroll.
  const AXISW = 52;          // fixed y-axis column width
  const xInset = 4;          // tiny inset so the end points aren't clipped (no visible gap at the axis)
  const perYear = 42;        // comfortable horizontal spacing per school year
  const padT = 12, plotH = 116, xLabelH = 24;
  const Hsvg = padT + plotH + xLabelH;
  const plotSpan = Math.max(200, (history.length - 1) * perYear);
  const dataW = plotSpan + xInset * 2;
  const vals = history.map((d) => d.enrollment);
  const maxEnroll = Math.max(...vals);
  // Y domain: a fixed 0 baseline (never truncated, since this is a count and a
  // cut baseline would distort the visual) up to a "nice" rounded ceiling at or above
  // both the capacity line and the peak enrollment. Gridlines then land on
  // readable intervals (0 / 500 / 1,000) instead of arbitrary values.
  const rawMax = Math.max(capacity ?? 0, maxEnroll, 1);
  const step = niceNum(rawMax / 2, true) || 1;
  const yMax = Math.max(step, Math.ceil(rawMax / step) * step);
  const x = (i: number) => xInset + (history.length === 1 ? plotSpan / 2 : (i / (history.length - 1)) * plotSpan);
  const y = (v: number) => padT + (1 - v / yMax) * plotH;

  const pts = history.map((d, i) => `${x(i).toFixed(1)},${y(d.enrollment).toFixed(1)}`);
  const area = `${x(0).toFixed(1)},${padT + plotH} ${pts.join(" ")} ${x(history.length - 1).toFixed(1)},${padT + plotH}`;
  const first = history[0], last = history[history.length - 1];
  // School-year labels follow the house convention: the SHORT axis form is the
  // END year with an "SY" prefix ("2020-2021" -> "SY21"); the FULL form keeps both
  // years ("2020-2021" -> "SY2020-2021"). Odd formats fall back raw.
  const yrTick = (s: string) => {
    const m = s.match(/^(\d{4})-(\d{4})$/);
    return m ? `SY${m[2].slice(2)}` : s;
  };
  const syFull = (s: string) => (/^\d{4}-\d{4}$/.test(s) ? `SY${s}` : s);
  // Thin the x-axis year labels only when they would crowd (a long history).
  // Every year keeps its point and hover target; we drop some text labels,
  // always keeping the first and last, so the axis stays legible either way.
  const labelStride = history.length > 12 ? 2 : 1;
  const showYearLabel = (i: number) => i === 0 || i === history.length - 1 || i % labelStride === 0;
  const active = hover;
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + step / 2; v += step) yTicks.push(v);
  const scrollByYears = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * perYear * 4, behavior: "smooth" });
  };
  const showNav = nav.canLeft || nav.canRight;

  return (
    <div className="insp-trend">
      <div className="insp-trend__head">
        <p className="insp-trend__title">Enrollment over time</p>
        {showNav && (
          <div className="insp-trend__nav">
            <IconButton label="Earlier years" kind="ghost" size="sm" disabled={!nav.canLeft} onClick={() => scrollByYears(-1)}>
              <ChevronLeftIcon size={16} />
            </IconButton>
            <IconButton label="Later years" kind="ghost" size="sm" disabled={!nav.canRight} onClick={() => scrollByYears(1)}>
              <ChevronRightIcon size={16} />
            </IconButton>
          </div>
        )}
      </div>
      <div className="insp-trend__legend">
        <Legend swatch={NAVY} label="Enrollment" />
        {capacity != null && <Legend swatch={CAPACITY} dashed label={`Capacity (${capacity.toLocaleString("en-US")})`} />}
      </div>
      <div className="insp-trend__chart">
        {/* FIXED y axis: value labels + the bold navy "Students" title. Same
            height and vertical scale as the plot, so their rows line up. */}
        <svg className="insp-chart__yaxis" viewBox={`0 0 ${AXISW} ${Hsvg}`} width={AXISW} height={Hsvg} aria-hidden="true">
          {yTicks.map((v) => (
            <text key={v} x={AXISW - 8} y={y(v) + 3} textAnchor="end" fontSize={9} fill={DIM} style={{ fontVariantNumeric: "tabular-nums" }}>
              {v.toLocaleString("en-US")}
            </text>
          ))}
          <line x1={AXISW - 0.5} x2={AXISW - 0.5} y1={padT} y2={padT + plotH} stroke={HAIRLINE} strokeWidth={0.75} />
          <text transform={`translate(13 ${padT + plotH / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fontWeight={700} letterSpacing={1} fill={NAVY}>Students</text>
        </svg>
        {/* SCROLLING plot: gridlines, capacity line, area + line, points, and the
            year labels. Only this pane scrolls horizontally. */}
        <div className="insp-chart__scroll" ref={scrollRef} onScroll={updateNav}>
          <svg
            className="insp-chart__plot"
            viewBox={`0 0 ${dataW} ${Hsvg}`}
            width={dataW}
            height={Hsvg}
            role="img"
            aria-label={`Enrollment from ${first.enrollment} students in ${syFull(first.year)} to ${last.enrollment} in ${syFull(last.year)}, against a capacity of ${capacity ?? "unknown"}.`}
            onMouseLeave={() => setHover(null)}
          >
            {/* horizontal gridlines (span the full plot; identical at any scroll) */}
            {yTicks.map((v) => (
              <line key={v} x1={0} x2={dataW} y1={y(v)} y2={y(v)} stroke={HAIRLINE} strokeWidth={0.75} />
            ))}
            {/* capacity reference line */}
            {capacity != null && capacity <= yMax && (
              <line x1={0} x2={dataW} y1={y(capacity)} y2={y(capacity)} stroke={CAPACITY} strokeWidth={1.5} strokeDasharray="5 3" />
            )}
            {/* area + line */}
            <polygon points={area} fill={tint(NAVY, 12)} />
            <polyline points={pts.join(" ")} fill="none" stroke={NAVY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* x ticks: compact two-digit year label, thinned only if crowded. The
                first/last labels anchor inward so they never clip at the edges now
                that the points sit right against the axis. */}
            {history.map((d, i) => (
              showYearLabel(i) ? (
                <text key={d.year} x={i === 0 ? 2 : i === history.length - 1 ? dataW - 2 : x(i)} y={padT + plotH + 16} textAnchor={i === 0 ? "start" : i === history.length - 1 ? "end" : "middle"} fontSize={9.5} fill={DIM} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {yrTick(d.year)}
                </text>
              ) : null
            ))}
            {/* points + hover targets */}
            {history.map((d, i) => (
              <g key={d.year}>
                <circle cx={x(i)} cy={y(d.enrollment)} r={i === active ? 4 : 2.5} fill={i === active ? NAVY : "#FFFFFF"} stroke={NAVY} strokeWidth={1.5} />
                <rect x={x(i) - plotSpan / (history.length * 2)} y={padT} width={plotSpan / history.length} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} style={{ cursor: "pointer" }} />
              </g>
            ))}
            {/* Hover tooltip: a Carbon inverse popover (gray-80 surface, white /
                gray-30 text) with a caret to the point and real padding. It flips
                above or below so it never clips, and clamps within the plot. The
                % line stays neutral so it never implies a utilization tier that
                disagrees with the tier chip above (utilizationStyle owns that). */}
            {active != null && (() => {
              const d = history[active];
              const cx = x(active);
              const py = y(d.enrollment);
              const pct = capacity ? Math.round((d.enrollment / capacity) * 100) : null;
              const boxW = 152, boxH = pct != null ? 62 : 44;
              const caretH = 6, gap = 3;
              const placeAbove = py - gap - caretH - boxH >= padT;
              const by = placeAbove ? py - gap - caretH - boxH : py + gap + caretH;
              const bx = Math.max(2, Math.min(dataW - boxW - 2, cx - boxW / 2));
              const caretX = Math.max(bx + 12, Math.min(bx + boxW - 12, cx));
              const caret = placeAbove
                ? `${caretX - 6},${by + boxH} ${caretX + 6},${by + boxH} ${caretX},${by + boxH + caretH}`
                : `${caretX - 6},${by} ${caretX + 6},${by} ${caretX},${by - caretH}`;
              return (
                <g>
                  <line x1={cx} x2={cx} y1={padT} y2={padT + plotH} stroke={tint(NAVY, 45)} strokeWidth={1} />
                  <polygon points={caret} fill="#393939" />
                  <rect x={bx} y={by} width={boxW} height={boxH} rx={2} fill="#393939" />
                  <text x={bx + 12} y={by + 20} fontSize={12.5} fontWeight={600} fill="#ffffff">{syFull(d.year)}</text>
                  <text x={bx + 12} y={by + 37} fontSize={11} fill="#c6c6c6" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {d.enrollment.toLocaleString("en-US")} enrolled
                  </text>
                  {pct != null && (
                    <text x={bx + 12} y={by + 53} fontSize={11} fontWeight={600} fill="#ffffff" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {pct}% of capacity
                    </text>
                  )}
                </g>
              );
            })()}
          </svg>
        </div>
      </div>
      {/* FIXED x-axis title, centered under the scrolling plot (right of the y axis). */}
      <div className="insp-chart__xtitle" style={{ marginLeft: AXISW }}>School year</div>
      {(() => {
        // Two KPI tiles side by side in a recessed inlay (Carbon layer-02): the
        // current count, and the net change against the first year on record.
        // The percentage is the headline of the change tile (the arrow + color
        // carry direction), with the absolute count and baseline year beneath.
        const delta = last.enrollment - first.enrollment;
        const pctChange = first.enrollment ? Math.round((delta / first.enrollment) * 100) : 0;
        const trendColor = delta > 0 ? GREEN : delta < 0 ? RED : DIM;
        const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
        const word = delta > 0 ? "more" : delta < 0 ? "fewer" : "change";
        return (
          <div className="insp-stats">
            <div className="insp-stat">
              <div className="insp-stat__label">Latest enrollment</div>
              <div className="insp-stat__value">{last.enrollment.toLocaleString("en-US")}</div>
              <div className="insp-stat__sub">{syFull(last.year)}</div>
            </div>
            <div className="insp-stat">
              <div className="insp-stat__label">Net change</div>
              <div className="insp-stat__value" style={{ color: trendColor }}>
                <span className="insp-stat__arrow">{arrow}</span>{Math.abs(pctChange)}%
              </div>
              <div className="insp-stat__sub">
                {delta === 0 ? `No change since ${syFull(first.year)}` : `${Math.abs(delta).toLocaleString("en-US")} ${word} since ${syFull(first.year)}`}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return (
    <span className="insp-legend">
      <span className="insp-legend__swatch" style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${swatch}` }} />
      <span className="insp-legend__label">{label}</span>
    </span>
  );
}

function Kv({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="insp-kv">
      <div className="insp-kv__label">{label}</div>
      <div className={`insp-kv__value${mono ? " insp-kv__value--mono" : ""}`}>{value}</div>
    </div>
  );
}

// Like Kv, but the value is a button that filters the whole view to this district
// when a filter key is available. Turns a read-only fact into the logical next
// click (drill from a school into its district).
function DistrictKv({ label, text, onFilter }: { label: string; text: string; onFilter?: () => void }) {
  return (
    <div className="insp-kv">
      <div className="insp-kv__label">{label}</div>
      {onFilter ? (
        <button type="button" className="insp-district-btn" onClick={onFilter} title="Filter the map and list to this district">
          {text}
          <FilterIcon size={12} />
        </button>
      ) : (
        <div className="insp-kv__value">{text}</div>
      )}
    </div>
  );
}

// One compact indicator row: the label and its verdict on a single line. The
// audience knows the Schools of Hope statute, so a Yes/No (or a neutral "Unknown"
// for a tri-state fact like Title I) is the whole answer; the reasoning lives in
// the data elsewhere in the panel.
function IndRow({ label, yes, unknown }: { label: string; yes: boolean; unknown?: boolean }) {
  return (
    <div className="insp-indrow">
      <span className="insp-indrow__label">{label}</span>
      <span className={`insp-indrow__verdict${!unknown && yes ? " insp-indrow__verdict--yes" : ""}`}>
        {unknown
          ? <HelpIcon size={16} style={{ color: DIM }} />
          : yes ? <CheckCircleIcon size={16} style={{ color: GREEN }} /> : <CancelIcon size={16} style={{ color: DIM }} />}
        {unknown ? "Unknown" : yes ? "Yes" : "No"}
      </span>
    </div>
  );
}

function repLabel(r: Representative | undefined): string {
  if (!r) return "";
  return `${r.name}${r.party ? ` (${r.party[0]})` : ""}`;
}

export function SchoolInspector({ compact = false }: { compact?: boolean } = {}) {
  const data = useData();
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  const selectSchool = useStore((s) => s.selectSchool);
  const comparePinnedMsids = useStore((s) => s.comparePinnedMsids);
  const toggleComparePin = useStore((s) => s.toggleComparePin);
  const setViewMode = useStore((s) => s.setViewMode);
  const setShortlistOpen = useStore((s) => s.setShortlistOpen);
  const setDistrictFilter = useStore((s) => s.setDistrictFilter);

  if (!selectedSchoolMsid || !data.schools) return null;
  const school = data.schools.features.find((f) => f.properties.msid === selectedSchoolMsid);
  if (!school) return null;
  const p = school.properties;
  const here: LngLat = school.geometry.coordinates as LngLat;
  // Exact district-filter keys for this school (same source the filter uses), so
  // the district rows below can drill the whole view into a district.
  const districtTags = data.schoolDistricts.tagOf(p.msid);
  // Outcomes are keyed by the reporting MSID: multi-campus charters like KIPP
  // Miami report grade and enrollment history under one shared MSID, so every
  // campus resolves its timelines through report_msid (defaults to its own msid).
  const reportMsid = p.report_msid ?? p.msid;
  const history = data.grades?.schools[reportMsid] ?? [];
  const formulaChangeYears = data.grades?.formula_change_years ?? [];
  const enrollHistory = data.enrollment?.schools[reportMsid] ?? [];
  const pinned = comparePinnedMsids.includes(p.msid);
  const canPin = pinned || comparePinnedMsids.length < MAX_COMPARE;

  // Districts + representatives (always available via the eagerly-built indexes).
  const legDistricts = legislativeDistrictsAtPoint(data.legislativeIndex, here);
  const byChamber = (c: LegislativeProps["chamber"]) => legDistricts.find((d) => d.chamber === c);
  const cd = byChamber("CD");
  const sldu = byChamber("SLDU");
  const sldl = byChamber("SLDL");
  const cdRep = cd ? data.reps?.congressional[`CD-${cd.district_number}`] : undefined;
  const sldlRep = sldl ? data.reps?.state_legislative[`SLDL-${sldl.district_number}`] : undefined;
  const slduRep = sldu ? data.reps?.state_legislative[`SLDU-${sldu.district_number}`] : undefined;
  const boardHere = boardDistrictAtPoint(data.boardIndex, here);
  const boardLabel = boardHere
    ? `District ${boardHere.district_number} (${boardHere.county})${boardHere.member_name ? `, ${boardHere.member_name}` : ""}`
    : p.board_district ? `District ${p.board_district}` : "Not mapped for this location";

  // Community facts (always available).
  const income = incomeAtPoint(data.incomeIndex, here);
  const oz = opportunityZoneAtPoint(data.ozIndex, here);
  const inOZ = Boolean(oz?.designated);

  // PLP + SoH eligibility.
  const officialAnchors = data.plp ? new Set(Object.keys(data.plp.schools)) : null;
  const isOfficialPlp = officialAnchors ? officialAnchors.has(p.msid) : false;
  const plpEval = isOfficialPlp
    ? { isPlp: true, reason: `Designated by the Florida Department of Education as a Persistently Low-Performing school for ${data.plp?.designated_year ?? "the latest year"}.`, belowCInLast5: 0, recent2: [] as string[] }
    : evaluatePlp(history);
  const anchors = officialAnchors ?? plpMsids(data.grades);
  const anchorsWithin: Array<{ msid: string; name: string; miles: number }> = [];
  if (data.schools && anchors.size) {
    for (const other of data.schools.features) {
      if (!anchors.has(other.properties.msid) || other.properties.msid === p.msid) continue;
      // Same-district (county) requirement: a School of Hope must be in the same
      // district as the Notice of Intent, filed where the PLP was identified
      // (Rule 6A-1.0998271(3)). Florida districts are coterminous with counties,
      // so an anchor in another county does not expand this school's siting area.
      // Keeps this in step with buildFilterContext in filters.ts.
      if (other.properties.county !== p.county) continue;
      const d = distanceMiles(here, other.geometry.coordinates as LngLat);
      if (d <= 5) anchorsWithin.push({ msid: other.properties.msid, name: other.properties.name, miles: d });
    }
  }
  anchorsWithin.sort((a, b) => a.miles - b.miles);
  // Same siting rule the map/list flag uses, so the two never disagree: a School
  // of Hope may open in a PLP school's area, within 5 miles of one, or in a
  // Florida Opportunity Zone, and the school must be Title I eligible (a
  // definitive "no" disqualifies; "unknown" does not). See evaluateSitingArea.
  const siting = evaluateSitingArea({
    isPlpAnchor: plpEval.isPlp,
    nearbyPlpCount: anchorsWithin.length,
    inOpportunityZone: inOZ,
    titleI: p.title_i,
  });
  const titleIDisqualifies = siting.titleIBlocked;
  const inSitingArea = siting.inSitingArea;
  const sohEligible = siting.eligible;

  // Utilization + co-location. Color communicates the legal facility-use tier
  // (Underused <=75% or 400+ surplus stations; Fully used >=90%), from the single
  // shared utilizationStyle helper so the map dock and inspector always agree.
  const util = utilizationStyle(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
  const utilPct = util.pct;
  const utilColor = util.color;
  // Co-location eligibility follows Rule 6A-1.0998271(5)(e): a district facility
  // is usable by a hope operator when its utilization is <=75% OR it has a
  // surplus of >=400 student stations. "District facility" = any district-run
  // school (every type except charter and virtual). The surplus is the FISH
  // "available capacity" (stations - COFTE) when reported.
  const districtOperated = isDistrictOperated(p.type);
  // Shared predicate so the inspector verdict matches the map/list flag and filter.
  // Co-location requires BOTH an underused district facility AND that the site is
  // in a School of Hope siting area (5-mi of a PLP school or an Opportunity Zone).
  const coLocationEligible = isCoLocationTarget(school, inSitingArea);

  // District-operated schools carry a lower-cased operator string in the data
  // ("Miami-dade"); use the properly-cased county instead so the subtitle reads
  // cleanly. Non-district schools keep their real operator name (e.g. "KIPP Miami").
  const operatorName = districtOperated ? `${p.county} County` : (p.operator ?? `${p.county} County`);
  const operatorLine = [p.type === "Traditional" ? "District school" : p.type, operatorName, p.level]
    .filter(Boolean).join(", ");

  // CSV export.
  const exportRows: Array<[string, string]> = [
    ["MSID", p.msid], ["Name", p.name], ["Level", p.level], ["Type", p.type],
    ["Operator", p.operator ?? ""], ["County", p.county],
    ["Board district", boardLabel],
    ["Congressional district", cd ? `${cd.district_number} ${repLabel(cdRep)}` : ""],
    ["State House district", sldl ? sldl.district_number : ""],
    ["State Senate district", sldu ? sldu.district_number : ""],
    ["Current grade", `${p.current_grade} (${p.current_grade_year})`],
    ["Title I eligible", titleILabel(p.title_i)],
    ["Co-location candidate", coLocationEligible ? "yes" : "no"],
    ["PLP", plpEval.isPlp ? "yes" : "no"],
    ["In School of Hope siting area", sohEligible ? "yes" : "no"],
    ["Enrollment", p.enrollment != null ? String(p.enrollment) : "unknown"],
    ["Capacity", p.capacity != null ? String(p.capacity) : "unknown"],
    ["Median household income", income?.median_household_income != null ? String(income.median_household_income) : ""],
    ["In opportunity zone", inOZ ? "yes" : "no"],
    ["Address", p.address],
    ["Longitude", String(school.geometry.coordinates[0])],
    ["Latitude", String(school.geometry.coordinates[1])],
  ];

  return (
    <aside className={`insp ${compact ? "insp--compact" : "insp--full"}`} aria-label={`Inspector for ${p.name}`}>
      {/* Header */}
      <div className="insp-head">
        <div className="insp-head__row">
          <GradeBadge grade={p.current_grade} />
          <div className="insp-head__id">
            <div className="insp-title">{p.name}</div>
            <div className="insp-sub">{operatorLine}</div>
          </div>
          <IconButton label="Close inspector" kind="ghost" size="sm" className="insp-close" onClick={() => selectSchool(null)}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
        {(plpEval.isPlp || coLocationEligible) && (
          <div className="insp-tags">
            {plpEval.isPlp && <Tag type="red" size="md">PLP</Tag>}
            {coLocationEligible && <Tag size="md" className="insp-tag-coloc">Co-location candidate</Tag>}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="insp-body">
        {/* 1. THE VERDICT FIRST. A site scout opens the inspector to learn one
            thing: can a School of Hope open here? Lead with that answer, per the
            content guide's altitude rule, before identity or districts. */}
        <div className={`insp-verdict${sohEligible ? " insp-verdict--eligible" : ""}`}>
          <div className="insp-verdict__head">
            {sohEligible
              ? <CheckCircleIcon size={18} style={{ color: GREEN, flex: "none" }} />
              : <CancelIcon size={18} style={{ color: DIM, flex: "none" }} />}
            <span className="insp-verdict__title" style={{ color: sohEligible ? GREEN : undefined }}>
              {sohEligible ? "A School of Hope may open here" : "Not a location for a new School of Hope"}
            </span>
          </div>
          <div className="insp-verdict__text">
            {plpEval.isPlp
              ? "Persistently low-performing, so a School of Hope may open within 5 miles."
              : anchorsWithin.length > 0
                ? <>Within 5 miles of {anchorsWithin.length} persistently low-performing school{anchorsWithin.length === 1 ? "" : "s"}, the nearest being{" "}
                    <button type="button" className="insp-link" onClick={() => selectSchool(anchorsWithin[0].msid)}>{anchorsWithin[0].name}</button> ({anchorsWithin[0].miles.toFixed(1)} mi).</>
                : inOZ
                  ? "Inside an Opportunity Zone, which counts as a siting area."
                  : "No persistently low-performing school within 5 miles, and not in an Opportunity Zone."}
          </div>
          {titleIDisqualifies && (
            <div className="insp-verdict__note">Not Title I eligible, so it does not qualify even inside a siting area.</div>
          )}
          {!inSitingArea && (
            <div className="insp-verdict__caveat">Attendance-zone boundaries aren't loaded, so a school just outside 5 miles but inside a PLP school's zone could still qualify.</div>
          )}
          {(sohEligible || inSitingArea) && (
            <div className="insp-verdict__cite">F.S. 1002.333</div>
          )}
        </div>

        <hr className="insp-divider" />

        {/* 2. KEY INDICATORS: the verdicts that drive the decision, nothing else. */}
        <p className="insp-label">Key indicators</p>
        <div className="insp-inds">
          <IndRow label="Co-location candidate" yes={coLocationEligible} />
          <IndRow label="Persistently low-performing (PLP)" yes={plpEval.isPlp} />
          <IndRow label="In an Opportunity Zone" yes={inOZ} />
          <IndRow label="Title I eligible" yes={p.title_i === "yes"} unknown={p.title_i === "unknown"} />
        </div>

        <hr className="insp-divider" />

        {/* 3. ENROLLMENT & CAPACITY */}
        <p className="insp-label">Enrollment &amp; capacity</p>
        <div className="insp-util-head">
          <div className="insp-util-head__left">
            <span className="insp-subhead" style={{ margin: 0 }}>Building utilization</span>
            {utilPct != null && (
              <span className="insp-util-tier" style={{ background: tint(utilColor, 14), color: utilColor }}>{util.label}</span>
            )}
          </div>
          <span className="insp-util-pct" style={{ color: utilColor }}>{utilPct != null ? `${Math.round(utilPct)}%` : "n/a"}</span>
        </div>
        {utilPct != null ? (
          <>
            <div className="insp-bar">
              <div className="insp-bar__fill" style={{ width: `${Math.min(100, utilPct)}%`, background: utilColor }} />
            </div>
            <p className="insp-note">
              {p.enrollment?.toLocaleString("en-US")} enrolled of {p.capacity?.toLocaleString("en-US")} capacity{p.enrollment_year ? ` (SY${p.enrollment_year})` : ""}
            </p>
          </>
        ) : (
          <p className="insp-note">Enrollment or capacity not reported.</p>
        )}
        <EnrollmentTrend history={enrollHistory} capacity={p.capacity} />

        <hr className="insp-divider" />

        {/* Academic performance */}
        <p className="insp-label">Academic performance</p>
        <p className="insp-subhead">Historic letter grades</p>
        <GradeTimeline history={history} formulaChangeYears={formulaChangeYears} />

        <hr className="insp-divider" />

        {/* 4. LOCATION & DISTRICTS: identity and representation, below the siting
            decision the analyst came for. Each district row drills the whole view. */}
        <p className="insp-label">Location &amp; districts</p>
        <Kv label="Address" value={
          <span className="insp-kv__addr">
            <PlaceIcon size={14} style={{ color: DIM, marginTop: 2, flex: "none" }} />
            <span>{p.address}</span>
          </span>
        } />
        <Kv label="MSID" value={p.msid} mono />
        <DistrictKv label="School board district" text={boardLabel} onFilter={districtTags?.board ? () => setDistrictFilter({ kind: "board", value: districtTags.board! }) : undefined} />
        <DistrictKv label="Congressional district" text={cd ? `District ${cd.district_number}${cdRep ? `, ${repLabel(cdRep)}` : ""}` : "Not mapped for this location"} onFilter={districtTags?.CD ? () => setDistrictFilter({ kind: "CD", value: districtTags.CD! }) : undefined} />
        <DistrictKv label="State House district" text={sldl ? `District ${sldl.district_number}${sldlRep ? `, ${repLabel(sldlRep)}` : " (representative not in dataset)"}` : "Not mapped for this location"} onFilter={districtTags?.SLDL ? () => setDistrictFilter({ kind: "SLDL", value: districtTags.SLDL! }) : undefined} />
        <DistrictKv label="State Senate district" text={sldu ? `District ${sldu.district_number}${slduRep ? `, ${repLabel(slduRep)}` : " (senator not in dataset)"}` : "Not mapped for this location"} onFilter={districtTags?.SLDU ? () => setDistrictFilter({ kind: "SLDU", value: districtTags.SLDU! }) : undefined} />
      </div>

      {/* Footer: stacked full-width Carbon actions. Primary (pin) on top; Export
          below; a jump to the shortlist last (it closes this panel so the tray
          takes focus). */}
      <div className="insp-footer">
        <Button
          kind={pinned ? "primary" : "tertiary"}
          size="md"
          disabled={!canPin}
          title={!canPin ? `The shortlist holds up to ${MAX_COMPARE} sites` : undefined}
          renderIcon={pinned ? BookmarkFilledIcon : BookmarkIcon}
          onClick={() => toggleComparePin(p.msid)}
        >
          {pinned ? "On your shortlist" : "Add to shortlist"}
        </Button>
        <div>
          <ExportButton filenameBase={`school_${p.msid}`} headers={["Field", "Value"]} rows={exportRows} label="Export" />
        </div>
        {comparePinnedMsids.length >= 1 && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={BookmarkIcon}
            onClick={() => { setViewMode("map"); setShortlistOpen(true); selectSchool(null); }}
          >
            Open shortlist ({comparePinnedMsids.length} site{comparePinnedMsids.length === 1 ? "" : "s"})
          </Button>
        )}
      </div>
    </aside>
  );
}
