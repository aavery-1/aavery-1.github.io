// The data model behind the Compare view: given the pinned schools plus the
// always-available context (filter context and the spatial indexes), it produces
// the labelled sections and aligned rows the matrix renders. Kept as a pure
// function so the rendering stays dumb and the logic is unit-tested.
//
// Every value is read from the eagerly-built spatial indexes and the school
// properties, exactly as the inspector reads them, so a fact (board district,
// income, districts) is ALWAYS populated regardless of which map overlays happen
// to be toggled on. No row is ranked and no aggregate score is produced: the
// tool lays out the facts, the analyst forms the judgment. `diff` marks a row
// whose values are not all identical; it drives the "Differences only" filter
// and a neutral marker, never a ranking.

import { utilizationStyle } from "../store";
import {
  incomeAtPoint, boardDistrictAtPoint, opportunityZoneAtPoint,
  legislativeDistrictsAtPoint, formatIncomeWithMoe,
} from "../data/derive/contextReads";
import { schoolTypeLabel, titleILabel } from "../data/types";
import type { LegislativeProps, Representative, SchoolFeature } from "../data/types";
import type { SchoolFilterContext } from "../data/derive/filters";
import type { DataContextValue } from "../data/DataContext";
import type { LngLat } from "../geo/measure";

// A single comparison row: one label and one value per pinned site, in the same
// order as the site columns. `help` is an optional tooltip that defines a term
// (Baymard / NN/g: never make the reader Google a label). `diff` is true when
// the values are not all identical across the pinned set.
export interface CompareRow {
  key: string;
  label: string;
  help?: string;
  values: string[];
  diff: boolean;
}

export interface CompareSection {
  title: string;
  rows: CompareRow[];
}

// District schools carry a lower-cased county as their "operator" in the data
// ("Miami-dade"); show the properly-cased county instead. Charters keep their
// real operator name (e.g. "KIPP Miami").
export function operatorLabel(s: SchoolFeature): string {
  const op = s.properties.operator;
  if (!op) return `${s.properties.county} County`;
  return op.toLowerCase() === s.properties.county.toLowerCase() ? `${s.properties.county} County` : op;
}

function repLabel(r: Representative | undefined): string {
  if (!r) return "";
  return `${r.name}${r.party ? ` (${r.party[0]})` : ""}`;
}

// Build every section from the always-available indexes + properties. Reading
// the same helpers the inspector uses keeps the two views in exact agreement.
export function buildCompareSections(
  schools: SchoolFeature[],
  ctx: SchoolFilterContext,
  data: DataContextValue,
): CompareSection[] {
  if (schools.length === 0) return [];

  const points = schools.map((s) => s.geometry.coordinates as LngLat);
  const legFor = (i: number) => legislativeDistrictsAtPoint(data.legislativeIndex, points[i]);
  const chamber = (i: number, c: LegislativeProps["chamber"]) => legFor(i).find((d) => d.chamber === c);

  const boardValue = (i: number) => {
    const bd = boardDistrictAtPoint(data.boardIndex, points[i]);
    if (bd) return `District ${bd.district_number} (${bd.county})${bd.member_name ? `, ${bd.member_name}` : ""}`;
    const fallback = schools[i].properties.board_district;
    return fallback ? `District ${fallback}` : "Not mapped here";
  };
  const cdValue = (i: number) => {
    const cd = chamber(i, "CD");
    if (!cd) return "Not mapped here";
    const rep = data.reps?.congressional[`CD-${cd.district_number}`];
    return `District ${cd.district_number}${rep ? `, ${repLabel(rep)}` : ""}`;
  };
  const slduValue = (i: number) => {
    const d = chamber(i, "SLDU");
    if (!d) return "Not mapped here";
    const rep = data.reps?.state_legislative[`SLDU-${d.district_number}`];
    return `District ${d.district_number}${rep ? `, ${repLabel(rep)}` : ""}`;
  };
  const sldlValue = (i: number) => {
    const d = chamber(i, "SLDL");
    if (!d) return "Not mapped here";
    const rep = data.reps?.state_legislative[`SLDL-${d.district_number}`];
    return `District ${d.district_number}${rep ? `, ${repLabel(rep)}` : ""}`;
  };
  const incomeValue = (i: number) => {
    const inc = incomeAtPoint(data.incomeIndex, points[i]);
    return inc && inc.median_household_income != null ? `${formatIncomeWithMoe(inc)} (tract ${inc.geoid})` : "No tract data here";
  };
  const ozValue = (i: number) => {
    const oz = opportunityZoneAtPoint(data.ozIndex, points[i]);
    return oz?.designated ? `Yes, tract ${oz.geoid}` : "No";
  };
  const utilValue = (i: number) => {
    const p = schools[i].properties;
    return p.enrollment != null && p.capacity ? `${Math.round((p.enrollment / p.capacity) * 100)}%` : "Not reported";
  };
  const enrollValue = (i: number) => {
    const p = schools[i].properties;
    return p.enrollment != null ? `${p.enrollment.toLocaleString("en-US")} (${p.enrollment_year})` : "Not reported";
  };
  const capacityValue = (i: number) => {
    const p = schools[i].properties;
    return p.capacity != null ? `${p.capacity.toLocaleString("en-US")} stations` : "Not reported";
  };
  const permanentValue = (i: number) => {
    const p = schools[i].properties;
    if (p.permanent_capacity == null) return "Not reported";
    const portables = p.capacity != null ? p.capacity - p.permanent_capacity : 0;
    return portables > 0
      ? `${p.permanent_capacity.toLocaleString("en-US")} (${portables.toLocaleString("en-US")} in portables)`
      : `${p.permanent_capacity.toLocaleString("en-US")}`;
  };
  const facilityUseValue = (i: number) => {
    const p = schools[i].properties;
    return utilizationStyle(p.enrollment, p.capacity, p.cofte, p.fish_surplus).label;
  };
  // Empty seats = permanent student stations minus the most recent enrollment.
  // A negative value means enrollment exceeds the permanent building (portables in
  // use), shown honestly rather than clamped. Null when either figure is missing.
  const emptySeatsValue = (i: number) => {
    const p = schools[i].properties;
    if (p.permanent_capacity == null || p.enrollment == null) return "Not reported";
    const empty = p.permanent_capacity - p.enrollment;
    return empty >= 0
      ? `${empty.toLocaleString("en-US")}`
      : `${empty.toLocaleString("en-US")} (over permanent capacity)`;
  };
  const frlValue = (i: number) => {
    const p = schools[i].properties;
    return p.frl_rate != null ? `${Math.round(p.frl_rate * 100)}%` : "Not reported";
  };

  const build = (key: string, label: string, fn: (i: number) => string, help?: string): CompareRow => {
    const values = schools.map((_, i) => fn(i));
    return { key, label, help, values, diff: new Set(values).size > 1 };
  };
  const yesNo = (key: string, label: string, set: Set<string>, help?: string): CompareRow =>
    build(key, label, (i) => (set.has(schools[i].properties.msid) ? "Yes" : "No"), help);

  return [
    {
      title: "Overview",
      rows: [
        build("grade", "Current grade", (i) => `${schools[i].properties.current_grade} (${schools[i].properties.current_grade_year})`),
        build("level", "Level", (i) => schools[i].properties.level),
        build("type", "Type", (i) => schoolTypeLabel(schools[i].properties.type)),
        build("operator", "Operator", (i) => operatorLabel(schools[i])),
        build("county", "County", (i) => schools[i].properties.county),
      ],
    },
    {
      title: "School of Hope eligibility",
      rows: [
        yesNo("soh", "In a School of Hope siting area", ctx.sohEligibleMsids, "Within a siting area: 5 miles of a persistently low-performing school or in an Opportunity Zone, and Title I eligible (F.S. 1002.333)."),
        yesNo("plp", "Persistently low-performing (PLP) anchor", ctx.plp, "A school on the state's persistently low-performing list. A hope operator may open nearby to serve its students."),
        yesNo("coloc", "Co-location candidate", ctx.coLocationMsids, "An underused district building (use at or below 75%, or 400+ surplus stations) inside a siting area. One test we can't check: buildings under 4 years old don't qualify, so this is a candidate, not confirmed."),
        build("titlei", "Title I eligibility", (i) => titleILabel(schools[i].properties.title_i), "Title I eligibility (FL DOE Title I Part A list, 2025-26)."),
      ],
    },
    {
      title: "Enrollment and capacity",
      rows: [
        build("enroll", "Enrollment", enrollValue, "FL DOE membership enrollment, with its year: Final Survey 2 (October), except Broward SY2026-27, which is the district's Tenth Day count."),
        build("capacity", "FISH capacity", capacityValue, "Total student stations (permanent plus portable), from the FISH Level of Service report. This is the statute's measure for the utilization and co-location tests (Rule 6A-1.0998271)."),
        build("permanent", "Permanent stations", permanentValue, "Student stations in permanent buildings only, excluding portables. A disclosed reference; the statutory tests use total student stations above."),
        build("emptyseats", "Empty seats (permanent)", emptySeatsValue, "Permanent student stations minus the most recent enrollment. A rough measure of room in the permanent building; a negative value means enrollment exceeds the permanent stations (portables in use)."),
        build("util", "Utilization (enrollment / capacity)", utilValue, "Enrollment divided by total FISH student stations."),
        build("facility", "Facility use tier", facilityUseValue, "The statutory tier: underused (at or below 75%, or 400+ surplus stations), in use, or fully used (90% or above)."),
      ],
    },
    {
      title: "Districts and representation",
      rows: [
        build("board", "School board district", boardValue),
        build("cd", "Congressional district", cdValue),
        build("sldu", "State Senate district", slduValue),
        build("sldl", "State House district", sldlValue),
      ],
    },
    {
      title: "Community context",
      rows: [
        build("frl", "Free/reduced-price lunch", frlValue, "Share of students certified for free or reduced-price meals, the school-level poverty measure (FL DOE Fall Survey 2, 2025-26)."),
        build("income", "Median household income (area)", incomeValue, "American Community Survey median household income for the school's census tract, with margin of error."),
        build("oz", "In an Opportunity Zone", ozValue, "Whether the school's tract is a designated Qualified Opportunity Zone."),
      ],
    },
  ];
}
