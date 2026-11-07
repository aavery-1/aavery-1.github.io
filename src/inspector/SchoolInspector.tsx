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

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { Accordion, AccordionItem, IconButton, OverflowMenu, OverflowMenuItem, Tag, SkeletonText } from "@carbon/react";
import { Close as CloseIcon, Compare as CompareIcon, Location as PlaceIcon, CheckmarkFilled as CheckCircleIcon, Misuse as CancelIcon, Filter as FilterIcon, Help as HelpIcon, CircleDash as CircleDashIcon, ArrowUp as ArrowUpIcon, ArrowDown as ArrowDownIcon, Launch as LaunchIcon, Document as DocumentIcon } from "@carbon/icons-react";
import { useData } from "../data/DataContext";
import { useStore, MAX_COMPARE, utilizationStyle, availableCapacity, emptyPermanentSeats, SOH_SURPLUS_STATIONS } from "../store";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { GradeTimeline } from "./GradeTimeline";
import {
  incomeAtPoint, boardDistrictAtPoint, opportunityZoneAtPoint,
  legislativeDistrictsAtPoint,
} from "../data/derive/contextReads";
import { evaluateSitingArea, isCoLocationTarget, isDistrictOperated } from "../data/derive/filters";
import { isKippSchool } from "../data/derive/hopeOperators";
import { useSchoolNews, type SchoolNews } from "../news/useSchoolNews";
import { evaluatePlp, plpMsids } from "../data/derive/plp";
import { plpShortYear } from "../data/adapters/plp";
import { districtFromCounty } from "../notice/noticeData";
import { distanceMiles, type LngLat } from "../geo/measure";
import { titleILabel, levelLabel } from "../data/types";
// Lazy so the notice generator (fflate + the two .docx templates) is its own
// chunk, loaded only when an operator opens the dialog, never in the main bundle.
const NoticeDialog = lazy(() => import("../notice/NoticeDialog").then((m) => ({ default: m.NoticeDialog })));
import type { LegislativeProps, Representative, DemographicsRing, SchoolDemographicsEntry, SchoolDemographicsFile, SchoolProps } from "../data/types";
import { DriveTimeMarket, DriveTimeToggle, DriveTimeStatus } from "./DriveTimeMarket";
import { toCsv, downloadCsv, stamp } from "../data/csv";
import { useInspectorSections, type InspectorSection } from "./inspectorSections";
import { useDriveTimes } from "../geo/driveTime";
import "./SchoolInspector.carbon.css";

// Local color constants (Carbon roles / brand), so the inspector needs no MUI.
const NAVY = "#001e62";     // KIPP navy, interactive / chart line
const DIM = "#525252";      // text-secondary, chart labels
const HAIRLINE = "#e0e0e0"; // border-subtle, gridlines
const THRESHOLD = "#525252"; // Carbon gray 70: reference/threshold lines (capacity)
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

// Enrollment trend: annual membership against the building's capacity.
// Carbon data-viz conventions: one series (line + light area, named in the
// legend), the capacity shown as a THRESHOLD (neutral dashed line, labeled on the
// chart), a zero baseline, recessive gridlines, 12px axis text in text-secondary,
// axis titles with units, and a hover tooltip per year. The plot measures its
// container and fits it exactly (the card never scrolls sideways); year labels
// thin out to fit, while every year keeps a point and a hover target.
function EnrollmentTrend({ history, capacity }: { history: Array<{ year: string; enrollment: number }>; capacity: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (history.length < 2) {
    return <p className="insp-trend__empty">Not enough enrollment history to chart.</p>;
  }

  const AXISW = 44;                       // y tick labels
  const padT = 8, plotH = 120, xLabelH = 22, padR = 8;
  const H = padT + plotH + xLabelH;
  const plotW = width - AXISW - padR;
  const vals = history.map((d) => d.enrollment);
  const maxEnroll = Math.max(...vals);
  // Zero baseline (a count; never truncated) up to a "nice" ceiling above both
  // the capacity and the peak, so gridlines land on readable values.
  const rawMax = Math.max(capacity ?? 0, maxEnroll, 1);
  const step = niceNum(rawMax / 2, true) || 1;
  const yMax = Math.max(step, Math.ceil(rawMax / step) * step);
  const x = (i: number) => AXISW + (i / (history.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - v / yMax) * plotH;
  const pts = history.map((d, i) => `${x(i).toFixed(1)},${y(d.enrollment).toFixed(1)}`);
  const area = `${x(0).toFixed(1)},${padT + plotH} ${pts.join(" ")} ${x(history.length - 1).toFixed(1)},${padT + plotH}`;
  const first = history[0], last = history[history.length - 1];
  const yrTick = (s: string) => { const m = s.match(/^(\d{4})-(\d{4})$/); return m ? `SY${m[2].slice(2)}` : s; };
  const syFull = (s: string) => (/^\d{4}-\d{4}$/.test(s) ? `SY${s}` : s);
  // ~40px per 12px "SY21" label; always keep the first and last.
  const stride = Math.max(1, Math.ceil(history.length / Math.max(2, Math.floor(plotW / 40))));
  const showYear = (i: number) => i === 0 || i === history.length - 1 || (i % stride === 0 && history.length - 1 - i >= stride / 2);
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + step / 2; v += step) yTicks.push(v);
  const capY = capacity != null && capacity <= yMax ? y(capacity) : null;

  const delta = last.enrollment - first.enrollment;
  const pctChange = first.enrollment ? Math.round((delta / first.enrollment) * 100) : 0;
  const TrendIcon = delta > 0 ? ArrowUpIcon : delta < 0 ? ArrowDownIcon : null;

  return (
    <div className="insp-trend">
      <p className="insp-subhead insp-subhead--chart">Enrollment over time</p>
      <div className="insp-trend__legend" aria-hidden="true">
        <span className="insp-legend"><span className="insp-legend__swatch insp-legend__swatch--line" />Enrollment</span>
        {capacity != null && <span className="insp-legend"><span className="insp-legend__swatch insp-legend__swatch--threshold" />Capacity</span>}
      </div>
      <div className="insp-trend__chart" ref={boxRef}>
        <svg
          viewBox={`0 0 ${width} ${H}`}
          width={width}
          height={H}
          role="img"
          aria-label={`Enrollment from ${first.enrollment.toLocaleString("en-US")} students in ${syFull(first.year)} to ${last.enrollment.toLocaleString("en-US")} in ${syFull(last.year)}${capacity != null ? `, against a capacity of ${capacity.toLocaleString("en-US")} student stations` : ""}.`}
          onMouseLeave={() => setHover(null)}
        >
          {/* gridlines + y ticks */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={AXISW} x2={AXISW + plotW} y1={y(v)} y2={y(v)} stroke={HAIRLINE} strokeWidth={1} />
              <text x={AXISW - 8} y={y(v) + 4} textAnchor="end" className="insp-chart__tick">{v.toLocaleString("en-US")}</text>
            </g>
          ))}
          {/* capacity threshold, labeled where it sits */}
          {capY != null && (
            <g>
              <line x1={AXISW} x2={AXISW + plotW} y1={capY} y2={capY} stroke={THRESHOLD} strokeWidth={1.5} strokeDasharray="4 4" />
              <text x={AXISW + plotW} y={capY - 6} textAnchor="end" className="insp-chart__threshold">Capacity</text>
            </g>
          )}
          {/* series */}
          <polygon points={area} fill={tint(NAVY, 10)} />
          <polyline points={pts.join(" ")} fill="none" stroke={NAVY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* x labels */}
          {history.map((d, i) => showYear(i) ? (
            <text key={d.year} x={x(i)} y={padT + plotH + 16} textAnchor={i === 0 ? "start" : i === history.length - 1 ? "end" : "middle"} className="insp-chart__tick">
              {yrTick(d.year)}
            </text>
          ) : null)}
          {/* points + generous hover targets */}
          {history.map((d, i) => (
            <g key={d.year}>
              <circle cx={x(i)} cy={y(d.enrollment)} r={i === hover ? 4 : 3} fill={i === hover ? NAVY : "#ffffff"} stroke={NAVY} strokeWidth={1.5} />
              {(() => {
                // Hover target: half a column either side, clamped to the plot so
                // the end targets never widen the chart past its container.
                const half = plotW / (history.length - 1) / 2;
                const left = Math.max(AXISW, x(i) - half), right = Math.min(AXISW + plotW, x(i) + half);
                return <rect x={left} y={padT} width={right - left} height={plotH + xLabelH} fill="transparent" onMouseEnter={() => setHover(i)} />;
              })()}
            </g>
          ))}
          {/* tooltip: Carbon inverse surface, square, flips to stay inside */}
          {hover != null && (() => {
            const d = history[hover];
            const cx = x(hover), py = y(d.enrollment);
            const pct = capacity ? Math.round((d.enrollment / capacity) * 100) : null;
            const boxW = 148, boxH = pct != null ? 60 : 42;
            const above = py - 10 - boxH >= 0;
            const by = above ? py - 10 - boxH : py + 10;
            const bx = Math.max(AXISW, Math.min(AXISW + plotW - boxW, cx - boxW / 2));
            return (
              <g pointerEvents="none">
                <line x1={cx} x2={cx} y1={padT} y2={padT + plotH} stroke="#8d8d8d" strokeWidth={1} />
                <rect x={bx} y={by} width={boxW} height={boxH} fill="#393939" />
                <text x={bx + 12} y={by + 18} className="insp-chart__tip insp-chart__tip--title">{syFull(d.year)}</text>
                <text x={bx + 12} y={by + 34} className="insp-chart__tip">{d.enrollment.toLocaleString("en-US")} enrolled</text>
                {pct != null && <text x={bx + 12} y={by + 50} className="insp-chart__tip">{pct}% of capacity</text>}
              </g>
            );
          })()}
        </svg>
      </div>
      <p className="insp-chart__xtitle">School year</p>
      <p className="insp-trend__change">
        {TrendIcon && <TrendIcon size={16} className={delta > 0 ? "insp-trend__up" : "insp-trend__down"} aria-hidden="true" />}
        <span>
          <strong>{delta === 0 ? "No change" : `${delta > 0 ? "Up" : "Down"} ${Math.abs(pctChange)}%`}</strong>
          {" "}since {syFull(first.year)}{delta !== 0 ? ` (${Math.abs(delta).toLocaleString("en-US")} ${delta > 0 ? "more" : "fewer"} students)` : ""}
        </span>
      </p>
    </div>
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
// One line of the eligibility checklist: status icon first (the eye scans the
// left edge), then the test, then a short muted detail. "unchecked" marks a test
// the tool can't evaluate from its data, so it reads as open, not failed.
type CheckState = "yes" | "no" | "unknown" | "unchecked";
function CheckItem({ state, label, detail }: { state: CheckState; label: string; detail?: string }) {
  const icon = state === "yes" ? <CheckCircleIcon size={16} className="insp-check__icon insp-check__icon--yes" />
    : state === "no" ? <CancelIcon size={16} className="insp-check__icon" />
    : state === "unknown" ? <HelpIcon size={16} className="insp-check__icon" />
    : <CircleDashIcon size={16} className="insp-check__icon" />;
  const sr = state === "yes" ? "Yes" : state === "no" ? "No" : state === "unknown" ? "Unknown" : "Not checked";
  return (
    <li className={`insp-check insp-check--${state}`}>
      {icon}
      <span className="insp-check__body">
        <span className="insp-check__label"><span className="cds--visually-hidden">{sr}: </span>{label}</span>
        {detail && <span className="insp-check__detail">{detail}</span>}
      </span>
    </li>
  );
}

function repLabel(r: Representative | undefined): string {
  if (!r) return "";
  return `${r.name}${r.party ? ` (${r.party[0]})` : ""}`;
}

// Student demographics: the race/ethnicity of the students actually ENROLLED
// (distinct from neighborhood demographics, which is who lives nearby). From FL
// DOE Membership by Race, Survey 2. For KIPP Miami, whose five campuses report to
// FL DOE as one school (13-2332), this is the network figure, labeled as such
// and never split into fabricated per-campus numbers. See parse-fldoe-race.py.
function StudentDemographics({ p }: { p: SchoolProps }) {
  if (p.pct_black == null && p.pct_hispanic == null && p.pct_white == null) return null;
  const network = p.race_scope === "network";
  // One 100% stacked bar (parts of a whole read best along a single line), in
  // Carbon's categorical order: Black = Purple 70, Hispanic = Cyan 50; "Other"
  // (everyone else, White included) is the residual, so it takes neutral gray.
  // Palette validated (CVD and normal-vision separation, chroma, 3:1 contrast).
  // A 2px white gap separates segments; the legend names every segment with its
  // value, so identity never rests on color alone.
  const black = Math.max(0, Math.min(100, p.pct_black ?? 0));
  const hisp = Math.max(0, Math.min(100 - black, p.pct_hispanic ?? 0));
  const other = Math.max(0, 100 - black - hisp);
  const parts = [
    { key: "black", label: "Black", v: black, color: "#6929c4" },
    { key: "hisp", label: "Hispanic", v: hisp, color: "#1192e8" },
    { key: "other", label: "Other", v: other, color: "#8d8d8d" },
  ];
  return (
    <>
      <div
        className="insp-stack"
        role="img"
        aria-label={`Enrolled students: ${parts.map((x) => `${x.label} ${Math.round(x.v)}%`).join(", ")}`}
      >
        {parts.filter((x) => x.v > 0).map((x) => (
          <span key={x.key} className="insp-stack__seg" style={{ flexGrow: x.v, background: x.color }} title={`${x.label}: ${Math.round(x.v)}%`} />
        ))}
      </div>
      <ul className="insp-stack__legend">
        {parts.map((x) => (
          <li key={x.key}>
            <span className="insp-stack__swatch" style={{ background: x.color }} aria-hidden="true" />
            <span className="insp-stack__label">{x.label}</span>
            <span className="insp-stack__val">{Math.round(x.v)}%</span>
          </li>
        ))}
      </ul>
      {p.race_total != null && (
        <p className="insp-race__note" title={network ? "KIPP Miami's campuses report to FL DOE as one school (13-2332)." : "Groups under 10 students are suppressed at the source."}>
          {network ? `KIPP Miami network, ${p.race_total.toLocaleString("en-US")} students` : `${p.race_total.toLocaleString("en-US")} students`} · FL DOE {p.race_year}
        </p>
      )}
    </>
  );
}

// Neighborhood demographics: the population living around this school within
// each radius ring, from the precomputed dasymetric aggregation (2020 Census
// blocks weighting ACS 2019-2023 block-group estimates). Every value is an
// estimate; counts carry an ACS 90% margin of error (shown as a muted second
// line), median income is a household-weighted approximation, and "K-8 age" is
// the ACS 5-14 bracket. Nulls read as an honest "n/a", never a fabricated zero.
const intFmt = (n: number) => n.toLocaleString("en-US");
const moeFmt = (n: number) => `±${n.toLocaleString("en-US")}`;

function DemoCell({ value, moe }: { value: React.ReactNode; moe?: string | null }) {
  return (
    <td className="insp-demo__cell">
      <span className="insp-demo__val">{value}</span>
      {moe ? <span className="insp-demo__moe">{moe}</span> : null}
    </td>
  );
}

function NeighborhoodDemographics({ entry, meta }: { entry: SchoolDemographicsEntry; meta: SchoolDemographicsFile }) {
  const rings = entry.rings;
  const anyPartial = rings.some((r) => r.coverage_pct < 0.995);
  // Row renderers keyed off each ring, in the fixed radius order the file carries.
  const cell = (r: DemographicsRing, render: (r: DemographicsRing) => { value: React.ReactNode; moe?: string | null }) => {
    const { value, moe } = render(r);
    return <DemoCell key={r.r} value={value} moe={moe} />;
  };

  return (
    <div className="insp-demo">
      <div className="insp-demo__scroll">
        <table className="insp-demo__table">
          <thead>
            <tr>
              <th scope="col" className="insp-demo__rowhead"> </th>
              {rings.map((r) => (
                <th key={r.r} scope="col" className="insp-demo__colhead">{r.r} mi</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="insp-demo__rowhead">Population</th>
              {rings.map((r) => cell(r, (x) => ({ value: intFmt(x.total_pop), moe: x.total_pop > 0 ? moeFmt(x.total_pop_moe) : null })))}
            </tr>
            <tr>
              <th scope="row" className="insp-demo__rowhead">K-8 age <span className="insp-demo__hint">(5-14)</span></th>
              {rings.map((r) => cell(r, (x) => ({ value: intFmt(x.k8_pop), moe: x.k8_pop > 0 ? moeFmt(x.k8_pop_moe) : null })))}
            </tr>
            <tr>
              <th scope="row" className="insp-demo__rowhead">Median income</th>
              {rings.map((r) => cell(r, (x) => x.median_income == null
                ? { value: <span className="insp-demo__na">n/a</span>, moe: null }
                : { value: `$${intFmt(x.median_income)}`, moe: x.median_income_moe != null ? moeFmt(x.median_income_moe) : null }))}
            </tr>
            <tr>
              <th scope="row" className="insp-demo__rowhead">% Black</th>
              {rings.map((r) => cell(r, (x) => x.pct_black == null
                ? { value: <span className="insp-demo__na">n/a</span>, moe: null }
                : { value: `${x.pct_black.toFixed(1)}%`, moe: x.pct_black_moe != null ? `±${x.pct_black_moe.toFixed(1)}` : null }))}
            </tr>
            <tr>
              <th scope="row" className="insp-demo__rowhead">% Hispanic</th>
              {rings.map((r) => cell(r, (x) => x.pct_hispanic == null
                ? { value: <span className="insp-demo__na">n/a</span>, moe: null }
                : { value: `${x.pct_hispanic.toFixed(1)}%`, moe: x.pct_hispanic_moe != null ? `±${x.pct_hispanic_moe.toFixed(1)}` : null }))}
            </tr>
          </tbody>
        </table>
      </div>
      {anyPartial && (
        <p className="insp-demo__warn">
          Some rings reach beyond the mapped county data; those totals are partial and understated.
        </p>
      )}
      <p className="insp-demo__foot" title={`Source: ${meta.source}`}>Census ACS 2019-23 estimates; ± is the margin of error.</p>
    </div>
  );
}

export function SchoolInspector({ compact = false, overrideMsid }: { compact?: boolean; overrideMsid?: string } = {}) {
  const data = useData();
  const storeSelectedMsid = useStore((s) => s.selectedSchoolMsid);
  // During the slide-away close the store selection is already null, so an
  // overrideMsid lets the panel keep rendering the school it is animating out.
  const selectedSchoolMsid = overrideMsid ?? storeSelectedMsid;
  // Section state + drive-time entry: called up here, before any early return,
  // so the hook order is identical on every render.
  const openSections = useInspectorSections((s) => s.open);
  const toggleSection = useInspectorSections((s) => s.toggle);
  const driveEntry = useDriveTimes((s) => (selectedSchoolMsid ? s.byMsid[selectedSchoolMsid] : undefined));
  const selectSchool = useStore((s) => s.selectSchool);
  const comparePinnedMsids = useStore((s) => s.comparePinnedMsids);
  const toggleComparePin = useStore((s) => s.toggleComparePin);
  const pickedMsids = useStore((s) => s.pickedMsids);
  const togglePicked = useStore((s) => s.togglePicked);
  const isolatePicked = useStore((s) => s.isolatePicked);
  const setIsolatePicked = useStore((s) => s.setIsolatePicked);
  const setViewMode = useStore((s) => s.setViewMode);
  const setShortlistOpen = useStore((s) => s.setShortlistOpen);
  const setDistrictFilter = useStore((s) => s.setDistrictFilter);

  // "Copy link" shares the current view. The URL hash already carries the selected
  // school, camera, and filters (see useMapPersistence), so the live location IS
  // the shareable deep link; we just surface a one-click copy with brief feedback.
  const [copiedLink, setCopiedLink] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const copyTimer = useRef<number | null>(null);
  useEffect(() => () => { if (copyTimer.current) window.clearTimeout(copyTimer.current); }, []);
  const copyShareLink = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopiedLink(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedLink(false), 1800);
    }).catch(() => {});
  }, []);

  // Resolve the school BEFORE any early return so hooks below (the news feed) are
  // called on every render, per the rules of hooks; a null school idles them.
  const school = (selectedSchoolMsid && data.schools)
    ? data.schools.features.find((f) => f.properties.msid === selectedSchoolMsid) ?? null
    : null;
  const news = useSchoolNews(school ? school.properties.name : null);

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
  const picked = pickedMsids.has(p.msid);

  // KIPP schools (KIPP Miami's campuses) show a reduced inspector: identity,
  // letter grade history, and location and districts only. They are existing
  // Schools of Hope added without facility or enrollment data, so the siting
  // verdict ("can a School of Hope open here") is moot and the capacity /
  // utilization / FRL / demographics sections would be empty. The map tooltip uses
  // the same predicate, so the two agree. See data/derive/hopeOperators.ts.
  const isKipp = isKippSchool(p.name);

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

  // Neighborhood demographics (precomputed per school; null for schools not in
  // the build, e.g. added after the last data refresh).
  const demo = data.schoolDemographics?.schools[p.msid] ?? null;

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
  const plpYear = plpShortYear(data.plp);
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
  // Statutory surplus (stations - COFTE): the figure for the 400-station test.
  // Same numerator basis as the tier above, so the two can never disagree.
  const avail = availableCapacity(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
  // Empty permanent seats (permanent stations - headcount): the ROOM figure, how
  // many students fit beside the host. Shown first; see emptyPermanentSeats.
  const empty = emptyPermanentSeats(p.enrollment, p.permanent_capacity, p.capacity);
  // Free/reduced-price lunch: the real student-poverty rate. Null (suppressed or
  // not in the FL DOE report) reads as "Not reported", never a fake 0.
  const frlPct = p.frl_rate != null ? Math.round(p.frl_rate * 100) : null;
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

  // One-line subtitle: who runs it and what grades. District schools read
  // "District school"; others name their operator (e.g. "Charter · KIPP Miami").
  // The county is on the map and in the Location section, so it is left out here.
  const operatorLine = [
    districtOperated ? "District" : [p.type, p.operator].filter(Boolean).join(" · "),
    levelLabel(p),
  ].filter(Boolean).join(" · ");

  // Municipality: the postal city parsed from the address ("street, city, FL,
  // zip"), normalizing the "Ft." abbreviation. A display-only locator; the
  // authoritative geography stays the address and county.
  const municipality = (() => {
    const parts = p.address.split(",").map((s) => s.trim());
    const fi = parts.findIndex((s) => s.toUpperCase() === "FL");
    const city = fi > 0 ? parts[fi - 1] : parts.length >= 3 ? parts[parts.length - 2] : "";
    return city ? city.replace(/^Ft\.?\s+/i, "Fort ") : "";
  })();

  // Short school-year for the small enrollment-year badge: "2024-2025" -> "2024-25".
  const syShort = (s: string) => (/^\d{4}-\d{4}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(7)}` : s);

  // CSV export.
  const exportRows: Array<[string, string]> = [
    ["MSID", p.msid], ["Name", p.name], ["Level", p.level], ["Grades offered", p.grades_offered ?? ""], ["Type", p.type],
    ["Operator", p.operator ?? ""], ["County", p.county],
    ["Board district", boardLabel],
    ["Congressional district", cd ? `${cd.district_number} ${repLabel(cdRep)}` : ""],
    ["State House district", sldl ? sldl.district_number : ""],
    ["State Senate district", sldu ? sldu.district_number : ""],
    ["Current grade", `${p.current_grade} (${p.current_grade_year})`],
    ["Title I eligible", titleILabel(p.title_i)],
    ["Free/reduced-price lunch rate", frlPct != null ? `${frlPct}%` : ""],
    ["Co-location candidate", coLocationEligible ? "yes" : "no"],
    ["PLP", plpEval.isPlp ? "yes" : "no"],
    ["PLP schools within 5 miles", String(anchorsWithin.length)],
    ["Nearby PLP schools", anchorsWithin.map((a) => `${a.name} (${a.miles.toFixed(1)} mi)`).join("; ")],
    ["In School of Hope siting area", sohEligible ? "yes" : "no"],
    ["Enrollment", p.enrollment != null ? String(p.enrollment) : "unknown"],
    ["Capacity", p.capacity != null ? String(p.capacity) : "unknown"],
    ["Permanent stations", p.permanent_capacity != null ? String(p.permanent_capacity) : "unknown"],
    ["Empty permanent seats", empty.seats != null ? String(empty.seats) : "unknown"],
    ["Statutory surplus (FISH, stations minus COFTE)", avail.stations != null ? String(avail.stations) : "unknown"],
    ["Median household income", income?.median_household_income != null ? String(income.median_household_income) : ""],
    ["In opportunity zone", inOZ ? "yes" : "no"],
    ["Address", p.address],
    ["Longitude", String(school.geometry.coordinates[0])],
    ["Latitude", String(school.geometry.coordinates[1])],
  ];
  // Append neighborhood demographics, one block of fields per radius ring, so the
  // export carries the same estimates (and their margins) shown in the panel.
  if (demo) {
    for (const r of demo.rings) {
      const tag = `within ${r.r} mi`;
      exportRows.push(
        [`Total population (${tag})`, `${r.total_pop}${r.total_pop > 0 ? ` (MOE +/-${r.total_pop_moe})` : ""}`],
        [`K-8 age population, ages 5-14 (${tag})`, `${r.k8_pop}${r.k8_pop > 0 ? ` (MOE +/-${r.k8_pop_moe})` : ""}`],
        [`Median household income (${tag})`, r.median_income != null ? `${r.median_income}${r.median_income_moe != null ? ` (MOE +/-${r.median_income_moe})` : ""}` : "n/a"],
        [`Percent Black (${tag})`, r.pct_black != null ? `${r.pct_black}${r.pct_black_moe != null ? ` (MOE +/-${r.pct_black_moe})` : ""}` : "n/a"],
        [`Percent Hispanic (${tag})`, r.pct_hispanic != null ? `${r.pct_hispanic}${r.pct_hispanic_moe != null ? ` (MOE +/-${r.pct_hispanic_moe})` : ""}` : "n/a"],
      );
    }
  }

  // Accordion section state (remembered per viewer) and the one-line summaries
  // each collapsed heading carries, so a closed section still answers "anything
  // here worth opening?" at a glance.
  const driveK8 = driveEntry?.status === "ready"
    ? driveEntry.result.contours.find((c) => c.minutes === 15)?.demographics?.k8_pop ?? null
    : null;
  const ring2 = demo?.rings.find((r) => r.r === 2) ?? null;
  const gradeYear = p.current_grade_year ? syShort(p.current_grade_year) : "";
  const canNotice = coLocationEligible && Boolean(districtFromCounty(p.county));
  // Collapsed rows show the title only: a second summary line on every row
  // doubled what the eye had to scan. The detail is one click away.
  const section = (id: InspectorSection, title: string, _meta: React.ReactNode, body: React.ReactNode) => (
    <AccordionItem
      key={id}
      className={`insp-acc__item insp-acc__item--${id}`}
      open={openSections.has(id)}
      onHeadingClick={() => toggleSection(id)}
      title={
        <span className="insp-acc__title">
          <span className="insp-acc__name" id={`insp-sec-${id}`}>{title}</span>
        </span>
      }
    >
      {body}
    </AccordionItem>
  );

  return (
    <aside className={`insp ${compact ? "insp--compact" : "insp--full"}`} aria-label={`Inspector for ${p.name}`}>
      {/* HEADER: two rows only. Identity (who is this), then a quiet toolbar of
          the two things people do from here, with everything else under "More".
          Status (PLP, co-location) lives with the verdict in the body, where it
          explains the answer, not up here. */}
      <div className="insp-head">
        <div className="insp-head__row">
          <GradeBadge grade={p.current_grade} />
          <div className="insp-head__id">
            <h2 className="insp-title">{p.name}</h2>
            <div className="insp-sub">{operatorLine}</div>
          </div>
          <IconButton label="Close" kind="ghost" size="sm" align="bottom-right" className="insp-close" onClick={() => selectSchool(null)}>
            <CloseIcon size={16} />
          </IconButton>
        </div>

        {/* Feature strip: the three things people do with a school, in fixed
            positions (icon over label), then "More". Unavailable actions stay in
            place, disabled with the reason, so the strip never reshuffles. */}
        <div className="insp-actions" role="toolbar" aria-label="School actions">
          <button
            type="button"
            className={`insp-feature${pinned ? " insp-feature--on" : ""}`}
            aria-pressed={pinned}
            disabled={!canPin}
            title={!canPin ? `You can compare up to ${MAX_COMPARE} schools` : pinned ? "Remove from the comparison" : "Add to the side-by-side comparison"}
            onClick={() => toggleComparePin(p.msid)}
          >
            <CompareIcon size={20} aria-hidden="true" />
            <span>{pinned ? "Comparing" : "Compare"}</span>
          </button>
          <DriveTimeToggle msid={p.msid} lng={school.geometry.coordinates[0]} lat={school.geometry.coordinates[1]} />
          <button
            type="button"
            className="insp-feature"
            disabled={!canNotice}
            title={canNotice ? "Draft the School of Hope building notice for this facility" : "Available for co-location candidates in Miami-Dade and Broward"}
            onClick={() => setNoticeOpen(true)}
          >
            <DocumentIcon size={20} aria-hidden="true" />
            <span>Building notice</span>
          </button>
          <OverflowMenu size="sm" flipped align="bottom" aria-label="More actions" iconDescription="More actions" className="insp-actions__more" menuOptionsClass="insp-actions__menu">
            <OverflowMenuItem itemText={picked ? "Remove from my map" : "Add to my map"} onClick={() => togglePicked(p.msid)} />
            {pickedMsids.size >= 1 && (
              <OverflowMenuItem
                itemText={isolatePicked ? "Show all schools again" : `Show only my map (${pickedMsids.size})`}
                onClick={() => setIsolatePicked(!isolatePicked)}
              />
            )}
            {comparePinnedMsids.length >= 1 && (
              <OverflowMenuItem
                itemText={`Open comparison (${comparePinnedMsids.length})`}
                onClick={() => { setViewMode("map"); setShortlistOpen(true); selectSchool(null); }}
              />
            )}
            <OverflowMenuItem itemText="Export to CSV" onClick={() => downloadCsv(`school_${p.msid}_${stamp()}.csv`, toCsv(["Field", "Value"], exportRows))} />
            <OverflowMenuItem itemText={copiedLink ? "Link copied" : "Copy link"} onClick={copyShareLink} />
          </OverflowMenu>
        </div>
        <DriveTimeStatus msid={p.msid} />
      </div>

      {/* BODY. Two labeled regions (common region + proximity: each idea in its
          own container, tight inside, clear space between), then the detail
          sections. Everything aligns to the 16px left edge. */}
      <div className="insp-body">
        {!isKipp && (
          <>
            <section className="insp-region" aria-labelledby={`siting-${p.msid}`}>
              <h3 className="insp-region__label" id={`siting-${p.msid}`}>School of Hope siting</h3>

              <p className={`insp-answer${sohEligible ? " insp-answer--yes" : ""}`}>
                {sohEligible
                  ? <CheckCircleIcon size={16} className="insp-answer__icon" />
                  : <CancelIcon size={16} className="insp-answer__icon" />}
                {sohEligible ? "May open here" : "Not a siting location"}
              </p>

              {(plpEval.isPlp || coLocationEligible) && (
                <div className="insp-tags">
                  {plpEval.isPlp && (
                    <Tag type="red" size="sm" title={isOfficialPlp && plpYear ? `On the FL DOE ${plpYear} persistently low-performing list` : "Persistently low-performing"}>
                      Low-performing (PLP)
                    </Tag>
                  )}
                  {coLocationEligible && <Tag type="teal" size="sm">Co-location candidate</Tag>}
                </div>
              )}

              {titleIDisqualifies ? (
                <p className="insp-region__note">Inside a siting area, but not Title I eligible.</p>
              ) : anchorsWithin.length === 0 && !plpEval.isPlp ? (
                <p className="insp-region__note">{inOZ ? "Inside an Opportunity Zone." : "No low-performing school within 5 miles, and not in an Opportunity Zone."}</p>
              ) : null}

              {/* The evidence, never collapsed: the low-performing schools a School
                  of Hope here would serve (what a notice cites). */}
              {anchorsWithin.length > 0 && (
                <div className="insp-region__group">
                  <p className="insp-region__sublabel">Low-performing schools within 5 miles</p>
                  <ul className="insp-plps__list">
                    {anchorsWithin.map((a) => (
                      <li key={a.msid} className="insp-plps__row">
                        <button type="button" className="insp-link insp-plps__name" onClick={() => selectSchool(a.msid)}>{a.name}</button>
                        <span className="insp-plps__mi">{a.miles.toFixed(1)} mi</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </section>

            <section className="insp-region" aria-labelledby={`building-${p.msid}`}>
              <h3 className="insp-region__label" id={`building-${p.msid}`}>Building</h3>
              <dl className="insp-glance">
              <div className="insp-glance__cell" title="Facility Utilization Rate, the statute's measure: funded FTE divided by all student stations, portables included. It decides the underused test.">
                <dt>Utilization</dt>
                <dd>
                  {utilPct != null ? <>{Math.round(utilPct)}%{util.basis === "enrollment" && <span className="insp-glance__aside"> est.</span>}</> : <span className="insp-glance__na">Not reported</span>}
                  {utilPct != null && <span className="insp-glance__tier" style={{ color: utilColor }}>{util.label}</span>}
                </dd>
              </div>
              <div className="insp-glance__cell" title="Empty permanent seats: permanent student stations minus current enrollment, the room beside the host. Portables are not counted.">
                <dt>Empty seats</dt>
                <dd>{empty.seats != null ? empty.seats.toLocaleString("en-US") : <span className="insp-glance__na">Not reported</span>}</dd>
              </div>
              <div className="insp-glance__cell">
                <dt>Enrollment</dt>
                <dd>
                  {p.enrollment != null ? p.enrollment.toLocaleString("en-US") : <span className="insp-glance__na">Not reported</span>}
                  {p.enrollment != null && p.enrollment_year && <span className="insp-glance__aside">SY{syShort(p.enrollment_year).slice(2)}</span>}
                </dd>
              </div>
              <div className="insp-glance__cell" title="Share of students certified for free or reduced-price meals. FL DOE Fall Survey 2, 2025-26.">
                <dt>Free/reduced lunch</dt>
                <dd>{frlPct != null ? `${frlPct}%` : <span className="insp-glance__na">Not reported</span>}</dd>
              </div>
              </dl>
            </section>
          </>
        )}

        <Accordion isFlush size="md" className="insp-acc">
          {!isKipp && section(
            "siting",
            "Eligibility checklist",
            "",
            <>
              <p className="insp-checks__head">Siting, any one</p>
              <ul className="insp-checks">
                <CheckItem
                  state={plpEval.isPlp || anchorsWithin.length > 0 ? "yes" : "no"}
                  label="Near a low-performing school"
                  detail={plpEval.isPlp ? "This school is one" : anchorsWithin.length > 0 ? `${anchorsWithin.length} within 5 mi` : "None within 5 mi"}
                />
                <CheckItem state={inOZ ? "yes" : "no"} label="In an Opportunity Zone" />
                <CheckItem state="unchecked" label="In a low-performing school's zone" detail="Zones not loaded" />
              </ul>
              <p className="insp-checks__head">Also required</p>
              <ul className="insp-checks">
                <CheckItem state={p.title_i === "yes" ? "yes" : p.title_i === "unknown" ? "unknown" : "no"} label="Title I eligible" />
              </ul>
              <p className="insp-checks__head">To share this building</p>
              <ul className="insp-checks">
                <CheckItem state={districtOperated ? "yes" : "no"} label="District-run building" />
                <CheckItem
                  state={util.key === "unknown" ? "unknown" : util.key === "under" ? "yes" : "no"}
                  label="Meets facility test"
                  detail={utilPct != null ? `${Math.round(utilPct)}%; needs 75% or less, or 400+ surplus` : "No capacity data"}
                />
                <CheckItem state="unchecked" label="In service 4+ years" detail="Building age not in data" />
              </ul>
              <p className="insp-cite">F.S. 1002.333; Rule 6A-1.0998271</p>
            </>,
          )}

          {!isKipp && section(
            "capacity",
            "Capacity and enrollment trend",
            empty.seats != null ? `${empty.seats.toLocaleString("en-US")} empty seats` : "",
            <>
              <div className="insp-util-head">
                <span className="insp-subhead" style={{ margin: 0 }}>Utilization (statutory)</span>
                <span className="insp-util-pct">{utilPct != null ? `${Math.round(utilPct)}%` : "n/a"}</span>
              </div>
              {utilPct != null && (
                <>
                  <div className="insp-bar" aria-hidden="true">
                    <div className="insp-bar__fill" style={{ width: `${Math.min(100, utilPct)}%`, background: utilColor }} />
                    <span className="insp-bar__mark" style={{ left: "75%" }} />
                  </div>
                  <div className="insp-bar__scale" aria-hidden="true">
                    <span>0%</span>
                    <span className="insp-bar__scale-mark" style={{ left: "75%" }} title="At or below 75% counts as underused">75%</span>
                    <span>100%</span>
                  </div>
                </>
              )}
              <p className="insp-note">
                {p.enrollment != null
                  ? <>{p.enrollment.toLocaleString("en-US")} enrolled{p.capacity != null && <> · {p.capacity.toLocaleString("en-US")} student stations</>}</>
                  : p.capacity != null ? <>{p.capacity.toLocaleString("en-US")} student stations · enrollment not reported</> : <>Enrollment and capacity not reported</>}
              </p>
              <dl className="insp-kvlist">
                {empty.seats != null && empty.permanent != null && empty.enrollment != null && (
                  <div className="insp-kvlist__row">
                    <dt>Empty permanent seats</dt>
                    <dd>
                      <strong>{empty.seats.toLocaleString("en-US")}</strong>
                      <span className="insp-kvlist__calc">
                        {empty.permanent.toLocaleString("en-US")} permanent stations minus {empty.enrollment.toLocaleString("en-US")} enrolled
                        {empty.overBy > 0 && <>; {empty.overBy.toLocaleString("en-US")} over the permanent building</>}
                        {empty.portables > 0 && <>; {empty.portables.toLocaleString("en-US")} portable stations not counted</>}
                      </span>
                    </dd>
                  </div>
                )}
                {avail.stations != null && (
                  <div className="insp-kvlist__row">
                    <dt title={`Total student stations (portables included) minus ${avail.basis === "cofte" ? "the prior year's funded FTE (COFTE)" : "current enrollment (estimate)"}. The figure for the ${SOH_SURPLUS_STATIONS}-station co-location test, not a sizing number.`}>
                      Statutory surplus
                    </dt>
                    <dd>
                      <strong>{avail.stations.toLocaleString("en-US")}</strong>
                      {avail.stations >= SOH_SURPLUS_STATIONS && <Tag type="teal" size="sm" className="insp-kvlist__tag">Meets {SOH_SURPLUS_STATIONS}+ test</Tag>}
                      <span className="insp-kvlist__calc">
                        For the {SOH_SURPLUS_STATIONS}-station test only
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
              <EnrollmentTrend history={enrollHistory} capacity={p.capacity} />
            </>,
          )}

          {(p.pct_black != null || p.pct_hispanic != null || p.pct_white != null) && section(
            "students",
            "Enrolled students",
            "",
            <StudentDemographics p={p} />,
          )}

          {section(
            "academics",
            "Letter grades",
            /^[A-F]$/.test(p.current_grade) ? `${p.current_grade}${gradeYear ? ` in ${gradeYear}` : ""}` : "",
            <>
              <GradeTimeline history={history} formulaChangeYears={formulaChangeYears} recentCount={6} />
            </>,
          )}

          {!isKipp && demo && data.schoolDemographics && section(
            "neighborhood",
            "Residents by distance",
            ring2 ? `${ring2.k8_pop.toLocaleString("en-US")} K-8 age within 2 mi` : "",
            <NeighborhoodDemographics entry={demo} meta={data.schoolDemographics} />,
          )}

          {section(
            "drive",
            "Residents by drive time",
            driveK8 != null ? `${driveK8.toLocaleString("en-US")} K-8 age within 15 min` : driveEntry?.status === "loading" ? "Computing..." : "Not computed",
            <DriveTimeMarket msid={p.msid} lng={school.geometry.coordinates[0]} lat={school.geometry.coordinates[1]} open={openSections.has("drive")} />,
          )}

          {section(
            "location",
            "Address and political districts",
            municipality || "",
            <>
              <Kv label="Address" value={
                <span className="insp-kv__addr">
                  <PlaceIcon size={14} style={{ color: DIM, marginTop: 2, flex: "none" }} />
                  <span>{p.address.replace(/,\s*FL,\s*(\d{5})/, ", FL $1")}</span>
                </span>
              } />
              <Kv label="MSID" value={p.msid} mono />
              <DistrictKv label="School board district" text={boardLabel} onFilter={districtTags?.board ? () => setDistrictFilter({ kind: "board", value: districtTags.board! }) : undefined} />
              <DistrictKv label="Congressional district" text={cd ? `District ${cd.district_number}${cdRep ? `, ${repLabel(cdRep)}` : ""}` : "Not mapped for this location"} onFilter={districtTags?.CD ? () => setDistrictFilter({ kind: "CD", value: districtTags.CD! }) : undefined} />
              <DistrictKv label="State House district" text={sldl ? `District ${sldl.district_number}${sldlRep ? `, ${repLabel(sldlRep)}` : " (representative not in dataset)"}` : "Not mapped for this location"} onFilter={districtTags?.SLDL ? () => setDistrictFilter({ kind: "SLDL", value: districtTags.SLDL! }) : undefined} />
              <DistrictKv label="State Senate district" text={sldu ? `District ${sldu.district_number}${slduRep ? `, ${repLabel(slduRep)}` : " (senator not in dataset)"}` : "Not mapped for this location"} onFilter={districtTags?.SLDU ? () => setDistrictFilter({ kind: "SLDU", value: districtTags.SLDU! }) : undefined} />
            </>,
          )}

          {section(
            "news",
            "Recent news",
            news.status === "ok" ? (news.items.length ? `${news.items.length} headline${news.items.length === 1 ? "" : "s"}` : "None recent") : "",
            <NewsCard news={news} name={p.name} />,
          )}
        </Accordion>
      </div>

      {noticeOpen && (
        <Suspense fallback={null}>
          <NoticeDialog
            facility={{
              name: p.name,
              county: p.county,
              address: p.address,
              utilizationPct: utilPct,
              availableStations: avail.stations,
              fishVintage: p.fish_vintage ?? null,
              anchors: anchorsWithin.map((a) => ({ name: a.name, miles: a.miles })),
              inOZ,
              plpListYear: plpShortYear(data.plp),
              emptySeats: empty.seats,
            }}
            onClose={() => setNoticeOpen(false)}
          />
        </Suspense>
      )}
    </aside>
  );
}

// A short "N days ago" / "today" from an RFC-822 date string, or "" if unparseable.
function relativeDate(rfc822: string | null): string {
  if (!rfc822) return "";
  const t = Date.parse(rfc822);
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

// The inspector's "In the news" card: up to six recent headlines that mention the
// school's name, each a link to the article. An EXTERNAL, UNVERIFIED feed (Google
// News), stated plainly so it is never mistaken for the tool's sourced data. Fails
// soft: quiet, non-alarming text for the unavailable / error / empty states.
function NewsCard({ news, name }: { news: SchoolNews; name: string }) {
  return (
    <section className="insp-news" aria-label={`Recent news mentioning ${name}`}>
      <p className="insp-news__src" title="Headlines are matched to the school by name; verify before citing.">Google News · not verified</p>

      {news.status === "loading" && (
        <SkeletonText paragraph lineCount={3} aria-label="Loading headlines" />
      )}
      {news.status === "unavailable" && (
        <p className="insp-news__note insp-news__note--dim">Live headlines aren&rsquo;t set up for this deployment.</p>
      )}
      {news.status === "error" && (
        <p className="insp-news__note insp-news__note--dim">Couldn&rsquo;t load headlines right now.</p>
      )}
      {news.status === "ok" && news.items.length === 0 && (
        <p className="insp-news__note insp-news__note--dim">No recent headlines mention this school.</p>
      )}
      {news.status === "ok" && news.items.length > 0 && (
        <>
          <ul className="insp-news__list">
            {news.items.map((it, i) => (
              <li key={`${it.url}-${i}`} className="insp-news__item">
                <a
                  className="insp-news__link"
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={it.title}
                >
                  <span className="insp-news__title">{it.title}</span>
                  <LaunchIcon size={16} className="insp-news__ext" aria-hidden />
                </a>
                {(it.source || it.publishedAt) && (
                  <span className="insp-news__meta">
                    {it.source}
                    {it.source && relativeDate(it.publishedAt) ? " · " : ""}
                    {relativeDate(it.publishedAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
