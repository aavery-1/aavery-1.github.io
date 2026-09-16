// Turn a selected school (plus the eligibility facts the inspector already
// derived) into the eleven facility-specific values a School of Hope Building
// Notice needs, applying the skill's field conventions from REFERENCE.md:
//   - district from county (MDCPS / Broward only; Orange has no template)
//   - facility name in RE-line UPPERCASE and natural-case body forms
//   - address normalized to the report style ("..., FL 33142", no comma before ZIP)
//   - utilization phrased per district (MDCPS "approximately N%", Broward exact)
//   - available capacity = the FISH surplus (stations minus COFTE)
//   - report_year read from the FISH Level of Service vintage (which IS the FLDOE
//     Vacant & Underutilized Facilities report; see the statute-facts memory)
//   - plp_list = the 5-mile same-county PLP anchors, "and" before the last
//
// Every value is SOURCED, never invented: figures come from the tool's current
// data, and anything the tool cannot know (target start year, projected
// enrollment, send date) is a caller input. Where a required figure is missing
// or a legal caveat applies, this returns a warning rather than guessing, and
// the caller shows it before anyone generates a document. No em dashes here.

import type { CountyName } from "../data/types";
import type { NoticeDistrict, NoticeFields } from "./fillNotice";

// The state's PLP list vintage the notices cite. Update when a newer official
// FL DOE PLP list is loaded; the panel also lets the operator edit it per notice.
export const PLP_LIST_YEAR = "2024-25";

export type EligibilityBasis = "oz+plp" | "plp-only" | "oz-only" | "none";

export interface NoticeSourceInput {
  // Facility identity + figures, straight from the school record / inspector.
  name: string;
  county: CountyName;
  address: string;
  utilizationPct: number | null; // statutory FUR percent
  availableStations: number | null; // FISH surplus (available additional capacity)
  fishVintage: string | null; // e.g. "FISH Level of Service, Miami-Dade, 2025-26 (reported 2026-04-10)"
  anchors: Array<{ name: string; miles: number }>; // 5-mile same-county PLP anchors
  inOZ: boolean;
  // Caller (human) inputs.
  date: string; // "September 16, 2026"
  startYear: string; // "2027-28"
  projectedEnrollment: string; // "500"
  plpListYear?: string; // defaults to PLP_LIST_YEAR
  blankFill?: boolean; // leave utilization / capacity / projected enrollment as fill-ins
}

export interface NoticeBuild {
  district: NoticeDistrict | null; // null = county has no template
  fields: NoticeFields;
  warnings: string[];
  basis: EligibilityBasis;
  canGenerate: boolean; // false when a blocking gap (no template, missing PLP list) remains
}

export function districtFromCounty(county: CountyName): NoticeDistrict | null {
  if (county === "Miami-Dade") return "MDCPS";
  if (county === "Broward") return "Broward";
  return null; // Orange (or anything else) has no approved template yet
}

// Title-case a facility name for the body sentence, leaving the record's casing
// where it already reads correctly. The data names are already title-ish, so we
// only collapse whitespace; the RE line uppercases the same string.
function bodyName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

// The report style writes "..., Miami, FL 33142": a comma between city and state,
// but a SPACE (not a comma) before the ZIP. Tool addresses store "FL, 33187", so
// drop that one comma. Everything else is passed through untouched.
function normalizeAddress(address: string): string {
  return address
    .replace(/\s+/g, " ")
    .trim()
    .replace(/,\s*(FL)\s*,\s*(\d{5})/i, ", $1 $2");
}

// "2025-26" out of the FISH vintage string; null if it cannot be found.
function reportYearFromVintage(vintage: string | null): string | null {
  if (!vintage) return null;
  const m = vintage.match(/(\d{4}-\d{2})/);
  return m ? m[1] : null;
}

// A comma list with "and" before the final item: "A, B, and C" / "A and B" / "A".
function joinAnd(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

const BLANK = "__________";

export function buildNotice(input: NoticeSourceInput): NoticeBuild {
  const district = districtFromCounty(input.county);
  const basis: EligibilityBasis = input.inOZ
    ? input.anchors.length
      ? "oz+plp"
      : "oz-only"
    : input.anchors.length
      ? "plp-only"
      : "none";

  const warnings: string[] = [];
  if (!district) {
    warnings.push(`No approved template for ${input.county}. Only MDCPS and Broward are supported.`);
  }

  // Utilization phrasing follows the observed per-district convention.
  const utilization = input.blankFill
    ? BLANK
    : input.utilizationPct == null
      ? BLANK
      : district === "MDCPS"
        ? `approximately ${Math.round(input.utilizationPct)}%`
        : `${Math.round(input.utilizationPct)}%`;
  if (!input.blankFill && input.utilizationPct == null) {
    warnings.push("No utilization figure in the data; enter it from the report or use blank-fill.");
  }

  const capacity = input.blankFill
    ? BLANK
    : input.availableStations == null
      ? BLANK
      : String(Math.round(input.availableStations));
  if (!input.blankFill && input.availableStations == null) {
    warnings.push("No available-capacity figure in the data; enter it from the report or use blank-fill.");
  }

  const projected_enrollment = input.blankFill
    ? BLANK
    : String(input.projectedEnrollment ?? "").trim() || BLANK;

  const reportYear = reportYearFromVintage(input.fishVintage) ?? BLANK;
  if (reportYear === BLANK) {
    warnings.push("Could not read the report year from the FISH vintage; set it manually.");
  }
  // Broward's FISH Level of Service vintage lags the current report, so its
  // utilization/capacity can be stale relative to the notice's cited year.
  if (district === "Broward" && /2022-23/.test(input.fishVintage ?? "")) {
    warnings.push("Broward FISH figures are 2022-23 vintage; confirm against the current V&U report or use blank-fill.");
  }

  const plp_list = joinAnd(input.anchors.map((a) => a.name));
  if (input.anchors.length === 0) {
    warnings.push("No PLP school within five miles in the tool's data; the standard PLP sentence may not apply.");
  }
  // The template hard-codes an Opportunity Zone claim. On a site that qualifies
  // only via the 5-mile pathway, that boilerplate asserts a false OZ fact in a
  // legal filing, so flag it (Phase 3 turns that sentence into a token).
  if (basis === "plp-only") {
    warnings.push("Site is NOT in an Opportunity Zone; the template's OZ sentence over-claims and must be corrected before sending.");
  }

  const fields: NoticeFields = {
    date: input.date.trim(),
    facility_name_upper: bodyName(input.name).toUpperCase(),
    facility_address: normalizeAddress(input.address),
    facility_name_body: bodyName(input.name),
    start_year: input.startYear.trim(),
    report_year: reportYear,
    utilization,
    capacity,
    projected_enrollment,
    plp_list_year: (input.plpListYear ?? PLP_LIST_YEAR).trim(),
    plp_list,
  };

  // A missing PLP list or no template is a hard block; a stale-vintage or
  // over-claim warning is not (the operator resolves those in review).
  const canGenerate = Boolean(district) && plp_list.trim().length > 0;

  return { district, fields, warnings, basis, canGenerate };
}
