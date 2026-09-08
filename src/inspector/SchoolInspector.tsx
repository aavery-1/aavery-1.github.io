// Right-column inspector for a selected school. A bordered surface with a sticky
// header (identity at a glance), a scrollable body of MECE sections, and a sticky
// footer with the primary actions.
//
// Unlike the map overlays, the inspector's location and community facts are
// ALWAYS shown: a school has a board district, legislative districts, an income
// context, and an opportunity-zone status regardless of which
// map layers happen to be toggled on. Those come straight from the spatial
// indexes (loaded eagerly in DataContext), so toggling a layer never blanks a
// fact the analyst needs.
//
// Sections, in decision order:
//   1. School & location  - identity, address, MSID, districts + representatives.
//   2. Key indicators      - co-location eligibility, PLP status, SoH eligibility.
//   3. Enrollment & capacity - utilization + an enrollment-vs-capacity trend.
//   4. Community context   - median income, opportunity zone.

import { useState } from "react";
import {
  Box, Paper, IconButton, Typography, Divider, Stack, Button, Chip, List,
  ListItem, LinearProgress, Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Close as CloseIcon, Compare as CompareArrowsIcon, Location as PlaceIcon, CheckmarkFilled as CheckCircleIcon, Misuse as CancelIcon, Filter as FilterIcon } from "@carbon/icons-react";
import { useData } from "../data/DataContext";
import { useStore, MAX_COMPARE, utilizationStyle, isUnderutilizedFacility } from "../store";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { GradeTimeline } from "./GradeTimeline";
import {
  incomeAtPoint, boardDistrictAtPoint, opportunityZoneAtPoint,
  legislativeDistrictsAtPoint, formatIncomeWithMoe,
} from "../data/derive/contextReads";
import { ExportButton } from "../tools/ExportButton";
import { evaluateSitingArea, isCoLocationTarget, isDistrictOperated, formatCoLocationReason } from "../data/derive/filters";
import { evaluatePlp, plpMsids } from "../data/derive/plp";
import { distanceMiles, type LngLat } from "../geo/measure";
import { SHELL_BG, SHELL_ON, SHELL_DIM, SHELL_HAIRLINE, TEAL, RADIUS } from "../muiTheme";
import { titleILabel } from "../data/types";
import type { LegislativeProps, Representative } from "../data/types";

const RED_STRONG = "#B71C1C";
const RED_MID = "#D32F2F";
const RED_TINT = alpha(RED_MID, 0.1);
const GREEN_MID = "#047857"; // Emerald 700, success / eligible

function GradeBadge({ grade }: { grade: string }) {
  const s = resolveGradeStyle(grade);
  return (
    <Box
      sx={{
        width: 40, height: 40, borderRadius: RADIUS.sm,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 16,
        bgcolor: rgbaToCss(s.fill), color: rgbaToCss(s.letterColor),
        border: "1.5px solid", borderColor: rgbaToCss(s.stroke),
        borderStyle: s.dashed ? "dashed" : "solid", flex: "none",
      }}
      aria-label={s.description}
    >
      {s.letter}
    </Box>
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
  if (history.length < 2) {
    return <Typography sx={{ fontSize: 12, color: SHELL_DIM, mt: 1 }}>Not enough enrollment history to chart.</Typography>;
  }

  const W = 320, H = 150, padL = 50, padR = 14, padT = 16, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = history.map((d) => d.enrollment);
  const maxEnroll = Math.max(...vals);
  // Y domain: a fixed 0 baseline (never truncated, since this is a count and a
  // cut baseline would distort the visual) up to a "nice" rounded ceiling at or above
  // both the capacity line and the peak enrollment. Gridlines then land on
  // readable intervals (0 / 500 / 1,000) instead of arbitrary values.
  const rawMax = Math.max(capacity ?? 0, maxEnroll, 1);
  const step = niceNum(rawMax / 2, true) || 1;
  const yMax = Math.max(step, Math.ceil(rawMax / step) * step);
  const x = (i: number) => padL + (history.length === 1 ? plotW / 2 : (i / (history.length - 1)) * plotW);
  const y = (v: number) => padT + (1 - v / yMax) * plotH;

  const pts = history.map((d, i) => `${x(i).toFixed(1)},${y(d.enrollment).toFixed(1)}`);
  const area = `${padL},${padT + plotH} ${pts.join(" ")} ${x(history.length - 1).toFixed(1)},${padT + plotH}`;
  const first = history[0], last = history[history.length - 1];
  const yr = (s: string) => (s.length >= 4 ? `'${s.slice(2, 4)}` : s);
  const active = hover;
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + step / 2; v += step) yTicks.push(v);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Legend swatch={TEAL} label="Enrollment" />
        {capacity != null && <Legend swatch="#EF6C00" dashed label={`Capacity ${capacity.toLocaleString("en-US")}`} />}
      </Stack>
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        sx={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        role="img"
        aria-label={`Enrollment from ${first.enrollment} students in ${first.year} to ${last.enrollment} in ${last.year}, against a capacity of ${capacity ?? "unknown"}.`}
        onMouseLeave={() => setHover(null)}
      >
        {/* y gridlines + labels (0 at bottom, capacity/peak at top) */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={SHELL_HAIRLINE} strokeWidth={0.75} />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={SHELL_DIM} style={{ fontVariantNumeric: "tabular-nums" }}>
              {v.toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {/* axis unit labels: students on Y, school year on X */}
        <text transform={`translate(11 ${padT + plotH / 2}) rotate(-90)`} textAnchor="middle" fontSize={8.5} fill={SHELL_DIM} letterSpacing={0.4}>Students</text>
        <text x={padL + plotW / 2} y={H - 4} textAnchor="middle" fontSize={8.5} fill={SHELL_DIM} letterSpacing={0.4}>School year</text>
        {/* capacity reference line */}
        {capacity != null && capacity <= yMax && (
          <line x1={padL} x2={W - padR} y1={y(capacity)} y2={y(capacity)} stroke="#EF6C00" strokeWidth={1.5} strokeDasharray="5 3" />
        )}
        {/* area + line */}
        <polygon points={area} fill={alpha(TEAL, 0.12)} />
        <polyline points={pts.join(" ")} fill="none" stroke={TEAL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* x ticks: every year */}
        {history.map((d, i) => (
          <text key={d.year} x={x(i)} y={padT + plotH + 14} textAnchor="middle" fontSize={8.5} fill={SHELL_DIM}>
            {yr(d.year)}
          </text>
        ))}
        {/* points + hover targets */}
        {history.map((d, i) => (
          <g key={d.year}>
            <circle cx={x(i)} cy={y(d.enrollment)} r={i === active ? 4 : 2.5} fill={i === active ? TEAL : "#FFFFFF"} stroke={TEAL} strokeWidth={1.5} />
            <rect x={x(i) - plotW / (history.length * 2)} y={padT} width={plotW / history.length} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} style={{ cursor: "pointer" }} />
          </g>
        ))}
        {/* readable hover tooltip */}
        {active != null && (() => {
          const d = history[active];
          const cx = x(active);
          const boxW = 118, boxH = capacity != null ? 40 : 26;
          const bx = Math.max(padL, Math.min(W - padR - boxW, cx - boxW / 2));
          const by = Math.max(2, y(d.enrollment) - boxH - 10);
          const pct = capacity ? Math.round((d.enrollment / capacity) * 100) : null;
          return (
            <g>
              <line x1={cx} x2={cx} y1={padT} y2={padT + plotH} stroke={alpha(TEAL, 0.4)} strokeWidth={1} />
              <rect x={bx} y={by} width={boxW} height={boxH} rx={5} fill="#0F172A" opacity={0.94} />
              <text x={bx + 8} y={by + 15} fontSize={10} fontWeight={700} fill="#fff">{d.year}</text>
              <text x={bx + 8} y={by + 27} fontSize={10} fill="#CBD5E1" style={{ fontVariantNumeric: "tabular-nums" }}>
                {d.enrollment.toLocaleString("en-US")} enrolled
              </text>
              {capacity != null && pct != null && (
                <text x={bx + 8} y={by + 37} fontSize={9.5} fill="#FDBA74" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {pct}% of capacity
                </text>
              )}
            </g>
          );
        })()}
      </Box>
      <Typography sx={{ fontSize: 11, color: SHELL_DIM, mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
        {last.enrollment.toLocaleString("en-US")} in {last.year}, {last.enrollment - first.enrollment >= 0 ? "+" : ""}
        {(last.enrollment - first.enrollment).toLocaleString("en-US")} since {first.year}
      </Typography>
    </Box>
  );
}

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Box sx={{ width: 14, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${swatch}` }} />
      <Typography sx={{ fontSize: 11, color: SHELL_DIM, fontWeight: 600 }}>{label}</Typography>
    </Stack>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 700, color: SHELL_DIM, letterSpacing: 0.16, textTransform: "none", mb: 1 }}>
      {children}
    </Typography>
  );
}

function Kv({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <ListItem disableGutters sx={{ py: 0.6, alignItems: "flex-start", display: "block" }}>
      <Typography component="div" sx={{ fontSize: 11, fontWeight: 600, color: SHELL_DIM, textTransform: "none", letterSpacing: 0.16 }}>
        {label}
      </Typography>
      <Typography component="div" sx={{ fontSize: 13, color: SHELL_ON, fontWeight: 500, mt: 0.15, fontFamily: mono ? "var(--font-mono)" : "inherit", wordBreak: "break-word" }}>
        {value}
      </Typography>
    </ListItem>
  );
}

// Like Kv, but the value is a button that filters the whole view to this
// district when a filter key is available. Turns a read-only fact into the
// logical next click (drill from a school into its district).
function DistrictKv({ label, text, onFilter }: { label: string; text: string; onFilter?: () => void }) {
  return (
    <ListItem disableGutters sx={{ py: 0.6, alignItems: "flex-start", display: "block" }}>
      <Typography component="div" sx={{ fontSize: 11, fontWeight: 600, color: SHELL_DIM, textTransform: "none", letterSpacing: 0.16 }}>
        {label}
      </Typography>
      {onFilter ? (
        <Button
          onClick={onFilter}
          endIcon={<FilterIcon size={12} />}
          title="Filter the map and list to this district"
          sx={{
            p: 0, minWidth: 0, mt: 0.15, textTransform: "none", fontWeight: 500, fontSize: 13,
            color: SHELL_ON, justifyContent: "flex-start", textAlign: "left", lineHeight: 1.35,
            "& .MuiButton-endIcon": { ml: 0.5, color: SHELL_DIM },
            "&:hover": { color: TEAL, bgcolor: "transparent", "& .MuiButton-endIcon": { color: TEAL } },
          }}
        >
          {text}
        </Button>
      ) : (
        <Typography component="div" sx={{ fontSize: 13, color: SHELL_ON, fontWeight: 500, mt: 0.15 }}>{text}</Typography>
      )}
    </ListItem>
  );
}

function YesNo({ yes, why }: { yes: boolean; why?: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ py: 0.75 }}>
      {yes ? <CheckCircleIcon size={18} style={{ color: GREEN_MID }} /> : <CancelIcon size={18} style={{ color: SHELL_DIM }} />}
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: yes ? GREEN_MID : SHELL_ON }}>{yes ? "Yes" : "No"}</Typography>
        {why && <Typography sx={{ fontSize: 11, color: SHELL_DIM, lineHeight: 1.35 }}>{why}</Typography>}
      </Box>
    </Stack>
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
  const setDistrictFilter = useStore((s) => s.setDistrictFilter);

  if (!selectedSchoolMsid || !data.schools) return null;
  const school = data.schools.features.find((f) => f.properties.msid === selectedSchoolMsid);
  if (!school) return null;
  const p = school.properties;
  const here: LngLat = school.geometry.coordinates as LngLat;
  // Exact district-filter keys for this school (same source the filter uses), so
  // the district rows below can drill the whole view into a district.
  const districtTags = data.schoolDistricts.tagOf(p.msid);
  const history = data.grades?.schools[p.msid] ?? [];
  const formulaChangeYears = data.grades?.formula_change_years ?? [];
  const enrollHistory = data.enrollment?.schools[p.msid] ?? [];
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
  // The FISH surplus is COFTE-derived, so it is only trustworthy when the COFTE is
  // a credible value (> 0). When COFTE is missing or mis-parsed as 0, fall back to
  // the enrollment-based spare stations, matching isUnderutilizedFacility so the
  // stated number never contradicts the co-location decision.
  const surplusStations = (p.fish_surplus != null && p.cofte != null && p.cofte > 0)
    ? Math.round(p.fish_surplus)
    : (p.enrollment != null && p.capacity != null ? p.capacity - p.enrollment : null);
  const facilityUnderused = isUnderutilizedFacility(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
  // Shared predicate so the inspector chip matches the map/list flag and filter.
  // Co-location requires BOTH an underused district facility AND that the site is
  // in a School of Hope siting area (5-mi of a PLP school or an Opportunity Zone).
  const coLocationEligible = isCoLocationTarget(school, inSitingArea);
  // Rule (5)(f) also bars co-location at a facility placed into service within
  // the previous 4 years. We have no building-age data, so we disclose rather
  // than silently assert full eligibility.
  const AGE_CAVEAT = " Not checked: co-location also excludes buildings placed into service within the last 4 years (Rule (5)(f)); no building-age data.";
  const coLocationWhy = !districtOperated
    ? "Co-location applies to district-operated facilities (not charter or virtual schools)."
    : p.capacity == null || p.enrollment == null
      ? "Student stations or enrollment not reported, so spare room is unknown."
      : !facilityUnderused
        ? `At ${utilPct != null ? Math.round(utilPct) : "?"}% of capacity with ${surplusStations != null ? surplusStations.toLocaleString("en-US") : "?"} surplus stations, below the 75% / 400-station threshold.`
        : !inSitingArea
          ? `Underused (${utilPct != null ? Math.round(utilPct) : "?"}% utilized), but outside a School of Hope siting area: not within 5 miles of a PLP school or inside an Opportunity Zone.`
          : `${formatCoLocationReason({ utilPct: util.pct, basis: util.basis, isPlpAnchor: plpEval.isPlp, inOpportunityZone: inOZ, nearestPlp: anchorsWithin[0] ? { name: anchorsWithin[0].name, miles: anchorsWithin[0].miles } : null })}, per Rule 6A-1.0998271(5)(e).${AGE_CAVEAT}`;

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
    <Paper
      component="aside"
      elevation={0}
      square
      aria-label={`Inspector for ${p.name}`}
      sx={{
        // On the map (compact) the panel is a lighter, narrower companion card;
        // elsewhere it is the full-height detail column.
        width: compact ? { xs: "100%", sm: 336 } : { xs: "100%", sm: 380, md: 400 },
        height: "100%", flex: "none",
        display: "flex", flexDirection: "column", bgcolor: SHELL_BG,
        border: compact ? `1px solid ${SHELL_HAIRLINE}` : "none",
        borderLeft: compact ? `1px solid ${SHELL_HAIRLINE}` : { xs: "none", md: `1px solid ${SHELL_HAIRLINE}` },
        animation: "inspectorIn 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      }}
    >
      {/* Sticky header */}
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2, borderBottom: `1px solid ${SHELL_HAIRLINE}` }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          <GradeBadge grade={p.current_grade} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: SHELL_ON, lineHeight: 1.25 }}>{p.name}</Typography>
            <Typography sx={{ fontSize: 12, color: SHELL_DIM, mt: 0.25 }}>{operatorLine}</Typography>
          </Box>
          <IconButton size="small" aria-label="Close inspector" onClick={() => selectSchool(null)} sx={{ color: SHELL_DIM, mr: -0.5, mt: -0.5 }}>
            <CloseIcon size={16} />
          </IconButton>
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: "wrap", rowGap: 0.5 }}>
          {plpEval.isPlp && <Chip size="small" label="PLP" sx={{ height: 22, fontWeight: 700, bgcolor: RED_TINT, color: RED_STRONG, border: `1px solid ${alpha(RED_MID, 0.35)}`, fontSize: 11 }} />}
          {coLocationEligible && <Chip size="small" label="Co-location candidate" sx={{ height: 22, fontWeight: 700, bgcolor: alpha("#1976D2", 0.1), color: "#0D47A1", border: `1px solid ${alpha("#1976D2", 0.35)}`, fontSize: 11 }} />}
        </Stack>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}>
        {/* 1. SCHOOL & LOCATION */}
        <SectionLabel>School &amp; location</SectionLabel>
        <List dense disablePadding>
          <Kv label="Address" value={
            <Stack direction="row" spacing={0.5} alignItems="flex-start">
              <PlaceIcon size={14} style={{ color: SHELL_DIM, marginTop: 2 }} />
              <span>{p.address}</span>
            </Stack>
          } />
          <Kv label="MSID" value={p.msid} mono />
          <Kv label="Title I eligible" value={titleILabel(p.title_i)} />
          <DistrictKv label="School board district" text={boardLabel} onFilter={districtTags?.board ? () => setDistrictFilter({ kind: "board", value: districtTags.board! }) : undefined} />
          <DistrictKv label="Congressional district" text={cd ? `District ${cd.district_number}${cdRep ? `, ${repLabel(cdRep)}` : ""}` : "Not mapped for this location"} onFilter={districtTags?.CD ? () => setDistrictFilter({ kind: "CD", value: districtTags.CD! }) : undefined} />
          <DistrictKv label="State House district" text={sldl ? `District ${sldl.district_number}${sldlRep ? `, ${repLabel(sldlRep)}` : " (representative not in dataset)"}` : "Not mapped for this location"} onFilter={districtTags?.SLDL ? () => setDistrictFilter({ kind: "SLDL", value: districtTags.SLDL! }) : undefined} />
          <DistrictKv label="State Senate district" text={sldu ? `District ${sldu.district_number}${slduRep ? `, ${repLabel(slduRep)}` : " (senator not in dataset)"}` : "Not mapped for this location"} onFilter={districtTags?.SLDU ? () => setDistrictFilter({ kind: "SLDU", value: districtTags.SLDU! }) : undefined} />
        </List>

        <Divider sx={{ my: 2.5, borderColor: SHELL_HAIRLINE }} />

        {/* 2. KEY INDICATORS */}
        <SectionLabel>Key indicators</SectionLabel>
        <Stack divider={<Divider sx={{ borderColor: alpha(SHELL_ON, 0.05) }} />}>
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: SHELL_DIM }}>Co-location candidate</Typography>
            <YesNo yes={coLocationEligible} why={coLocationWhy} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: SHELL_DIM }}>Persistently Low-Performing (PLP)</Typography>
            <YesNo yes={plpEval.isPlp} why={plpEval.reason} />
          </Box>
        </Stack>
        <Paper variant="outlined" sx={{ mt: 1.25, p: 1.5, borderRadius: RADIUS.md, borderColor: sohEligible ? alpha(GREEN_MID, 0.35) : SHELL_HAIRLINE, bgcolor: sohEligible ? alpha(GREEN_MID, 0.06) : "transparent" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: sohEligible ? GREEN_MID : SHELL_DIM }}>
            {sohEligible ? "A new School of Hope may open here" : "Not an eligible location for a new School of Hope"}
          </Typography>
          <Typography sx={{ fontSize: 12, color: SHELL_ON, mt: 0.4, lineHeight: 1.5 }}>
            {plpEval.isPlp
              ? "This is a PLP anchor: under F.S. 1002.333 a hope operator may open within a 5-mile radius."
              : anchorsWithin.length > 0
                ? <>Within 5 miles of {anchorsWithin.length} PLP anchor{anchorsWithin.length === 1 ? "" : "s"}, e.g.{" "}
                    <Button size="small" onClick={() => selectSchool(anchorsWithin[0].msid)} sx={{ p: 0, minWidth: 0, textTransform: "none", fontWeight: 700, color: TEAL, fontSize: 12, verticalAlign: "baseline" }}>
                      {anchorsWithin[0].name}
                    </Button> ({anchorsWithin[0].miles.toFixed(1)} mi).</>
                : inOZ
                  ? "Sits inside a designated Opportunity Zone, an eligible siting area under the “whichever is greater” clause."
                  : "No PLP anchor within 5 miles and not in an Opportunity Zone."}
          </Typography>
          <Typography sx={{ fontSize: 11, color: SHELL_DIM, mt: 0.6, lineHeight: 1.5 }}>
            {titleIDisqualifies
              ? "A School of Hope must be Title I eligible; this school is not, so it is not SoH-eligible despite the siting area."
              : inSitingArea
                ? `Title I eligible: ${titleILabel(p.title_i)} (a School of Hope requirement).`
                : ""}
          </Typography>
        </Paper>

        <Divider sx={{ my: 2.5, borderColor: SHELL_HAIRLINE }} />

        {/* 3. ENROLLMENT & CAPACITY */}
        <SectionLabel>Enrollment &amp; capacity</SectionLabel>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography sx={{ fontSize: 12, color: SHELL_DIM }}>Building utilization</Typography>
            {utilPct != null && (
              <Box sx={{ px: 0.75, py: 0.15, borderRadius: RADIUS.xs, bgcolor: alpha(utilColor, 0.14), color: utilColor, fontSize: 11, fontWeight: 700, lineHeight: 1.5 }}>
                {util.label}
              </Box>
            )}
          </Stack>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: utilColor, fontVariantNumeric: "tabular-nums" }}>
            {utilPct != null ? `${Math.round(utilPct)}%` : "n/a"}
          </Typography>
        </Stack>
        {utilPct != null ? (
          <>
            <LinearProgress variant="determinate" value={Math.min(100, utilPct)} sx={{ height: 6, borderRadius: 999, bgcolor: alpha(SHELL_ON, 0.06), "& .MuiLinearProgress-bar": { bgcolor: utilColor, borderRadius: 999 } }} />
            <Typography sx={{ fontSize: 11, color: SHELL_DIM, mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
              {p.enrollment?.toLocaleString("en-US")} enrolled of {p.capacity?.toLocaleString("en-US")} capacity ({p.enrollment_year})
            </Typography>
            <Typography sx={{ fontSize: 11, color: SHELL_DIM, mt: 0.5, lineHeight: 1.4 }}>
              Approximates the statutory Facility Utilization Rate (COFTE / FISH student stations, Rule 6A-1.0998271(1)(n)) using reported membership enrollment; it is a proxy, not the official COFTE-based rate.
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: 12, color: SHELL_DIM }}>Enrollment or capacity not reported.</Typography>
        )}
        <EnrollmentTrend history={enrollHistory} capacity={p.capacity} />

        <Divider sx={{ my: 2.5, borderColor: SHELL_HAIRLINE }} />

        {/* Academic performance */}
        <SectionLabel>Academic performance</SectionLabel>
        <Typography sx={{ fontSize: 12, color: SHELL_DIM, mb: 0.5 }}>Historic letter grades</Typography>
        <GradeTimeline history={history} formulaChangeYears={formulaChangeYears} />

        <Divider sx={{ my: 2.5, borderColor: SHELL_HAIRLINE }} />

        {/* 4. COMMUNITY CONTEXT */}
        <SectionLabel>Community context</SectionLabel>
        <List dense disablePadding>
          <Kv label="Median household income (area)" value={income?.median_household_income != null ? `${formatIncomeWithMoe(income)}, tract ${income.geoid}` : "No tract data at this location"} />
        </List>
        <Stack divider={<Divider sx={{ borderColor: alpha(SHELL_ON, 0.05) }} />} sx={{ mt: 0.5 }}>
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: SHELL_DIM }}>Located in an opportunity zone</Typography>
            <YesNo yes={inOZ} why={inOZ ? `Designated QOZ tract ${oz?.geoid}` : "Not in a designated Opportunity Zone"} />
          </Box>
        </Stack>
      </Box>

      {/* Footer */}
      <Box sx={{ px: 2.5, py: 2, borderTop: `1px solid ${SHELL_HAIRLINE}`, bgcolor: SHELL_BG }}>
        <Stack direction="row" spacing={1}>
          <Tooltip title={!canPin ? `Compare holds up to ${MAX_COMPARE} sites` : ""}>
            <span style={{ flex: 1 }}>
              <Button fullWidth variant={pinned ? "contained" : "outlined"} color="primary" startIcon={<CompareArrowsIcon size={16} />} onClick={() => toggleComparePin(p.msid)} disabled={!canPin} sx={{ textTransform: "none", fontWeight: 600 }}>
                {pinned ? "Pinned to compare" : "Add to compare"}
              </Button>
            </span>
          </Tooltip>
          <ExportButton filenameBase={`school_${p.msid}`} headers={["Field", "Value"]} rows={exportRows} label="Export" />
        </Stack>
        {comparePinnedMsids.length >= 2 && (
          <Button
            fullWidth
            size="small"
            startIcon={<CompareArrowsIcon size={16} />}
            onClick={() => setViewMode("compare")}
            sx={{ mt: 1, textTransform: "none", fontWeight: 600 }}
          >
            Open compare ({comparePinnedMsids.length} sites)
          </Button>
        )}
      </Box>
    </Paper>
  );
}
