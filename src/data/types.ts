// Shared types matching the schemas in 04_SAMPLE_SCHEMAS.md exactly. The UI and
// inspector are typed against these, so swapping a sample file for a real source
// is a one-file edit inside the adapter with no UI change.

import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from "geojson";
import type { Grade } from "../map/gradeEncoding";

export type CountyName = "Miami-Dade" | "Broward" | "Orange";
export const SCHOOL_LEVELS = ["Elementary", "Middle", "High", "Combination", "Adult", "Other"] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];
export const SCHOOL_TYPES = ["Traditional", "Charter", "Magnet", "Virtual", "Alternative", "Other"] as const;
export type SchoolType = (typeof SCHOOL_TYPES)[number];

// Title I eligibility is a tri-state: "yes"/"no" from the CCD, "unknown" when the
// school has no reported value. Missing data stays "unknown", never coerced to
// "no". Title I eligibility is a statutory School of Hope requirement.
export const TITLE_I_STATES = ["yes", "no", "unknown"] as const;
export type TitleIState = (typeof TITLE_I_STATES)[number];

export function titleILabel(state: TitleIState | undefined): string {
  if (state === "yes") return "Yes";
  if (state === "no") return "No";
  return "Unknown";
}

// User-facing label for a school type. NCES codes district-run schools as
// "Traditional"; the UI names them "District" consistently across the filter,
// map tooltip, inspector, and list.
export function schoolTypeLabel(type: SchoolType | string): string {
  return type === "Traditional" ? "District" : type;
}

export interface SchoolProps {
  msid: string;
  // Outcome-reporting MSID. Florida reports some multi-campus charters (every
  // KIPP Miami campus, for one) under a SINGLE MSID, so their grade and
  // enrollment history live under that shared key, not each campus's own msid.
  // Defaults to msid; set it only when a school's outcomes are reported under a
  // different MSID, so the inspector timelines populate across all the campuses.
  report_msid?: string | null;
  name: string;
  level: SchoolLevel;
  type: SchoolType;
  operator: string | null;
  county: CountyName;
  county_fips: string;
  board_district: string | null;
  current_grade: Grade;
  current_grade_year: string;
  enrollment: number | null;
  enrollment_year: string;
  // capacity = FISH SCHOOL CAPACITY = total student stations (permanent +
  // relocatable). This is the statute's "total student stations" (Rule
  // 6A-1.0998271(1)(n),(f)) and the denominator for every FUR / surplus /
  // co-location test.
  capacity: number | null;
  // permanent_capacity = FISH PERMANENT CAPACITY = the permanent building's
  // student stations only (excludes portables/relocatables). Disclosed as a
  // secondary figure in the inspector/table/compare; NEVER used in the statutory
  // tests, which the rule defines on total student stations.
  permanent_capacity?: number | null;
  // FISH Level of Service figures (district-operated schools only), the statutory
  // co-location inputs per Rule 6A-1.0998271: cofte = capital-outlay FTE
  // enrollment (the FUR numerator), fish_surplus = student stations - COFTE (the
  // >=400-station test). Null for schools with no FISH match (charters/virtual/
  // special). See scripts/parse-fish-los.py.
  cofte?: number | null;
  fish_surplus?: number | null;
  fish_vintage?: string | null;
  title_i: TitleIState;
  title_i_schoolwide: boolean;
  title_i_eligible: boolean;
  // Free/reduced-price lunch rate (0-1), the school-level poverty measure, from
  // FL DOE Fall Survey 2 lunch status. The published rate already carries the
  // USDA CEP multiplier where applicable. Null = suppressed (small count) or the
  // school is absent from the report; never coerced to 0. frl_denominator is the
  // student count the rate is over. See scripts/parse-frl-lunch.py.
  frl_rate?: number | null;
  frl_denominator?: number | null;
  frl_year?: string | null;
  address: string;
  geocode_source: string;
}
export type SchoolFeature = Feature<Point, SchoolProps>;
export type SchoolCollection = FeatureCollection<Point, SchoolProps>;

export interface GradeHistoryEntry {
  year: string;
  grade: Grade;
}
export interface GradesFile {
  vintage: string;
  formula_change_years: string[];
  schools: Record<string, GradeHistoryEntry[]>;
}

export interface IncomeProps {
  geoid: string;
  state_fips: string;
  county_fips: string;
  tract: string;
  median_household_income: number | null;
  moe: number | null;
  population: number;
  school_age_population: number;
}
export type IncomeCollection = FeatureCollection<Polygon, IncomeProps> & { vintage?: string };

// Precomputed neighborhood demographics for each school, one row per radius ring.
// Built offline by scripts/build-school-demographics.mjs via dasymetric
// aggregation (ACS 2019-2023 block groups distributed to 2020 Census blocks).
// counts carry a 90% ACS margin of error; percentages carry a derived MOE;
// median income is a household-weighted approximation. coverage_pct is the share
// of the ring's populated-land area that falls within the loaded county set.
export interface DemographicsRing {
  r: number; // radius in miles
  blocks: number; // populated 2020 blocks inside the ring
  total_pop: number;
  total_pop_moe: number;
  k8_pop: number; // ages 5-14
  k8_pop_moe: number;
  pct_black: number | null;
  pct_black_moe: number | null;
  pct_hispanic: number | null;
  pct_hispanic_moe: number | null;
  median_income: number | null;
  median_income_moe: number | null;
  coverage_pct: number; // 0..1
}
export interface SchoolDemographicsEntry {
  lon: number;
  lat: number;
  rings: DemographicsRing[];
}
export interface SchoolDemographicsFile {
  source: string;
  vintage: string;
  method: string;
  generated: string;
  counties_covered: string[];
  radii_miles: number[];
  k8_definition: string;
  schools: Record<string, SchoolDemographicsEntry>;
}

export interface BoardDistrictProps {
  county: CountyName;
  county_fips: string;
  district_number: string;
  member_name: string | null;
  source: string;
  source_url: string | null;
}
export type BoardDistrictCollection = FeatureCollection<Polygon, BoardDistrictProps> & { vintage?: string };

export interface IsochroneProps {
  origin_msid: string;
  origin_lon: number;
  origin_lat: number;
  mode: "driving" | "walking" | "cycling";
  minutes: number;
  computed_at: string;
  population_within: number;
}
export type IsochroneCollection = FeatureCollection<Polygon, IsochroneProps> & { vintage?: string };

// Population growth (county-level choropleth, real Census PEP data).
export interface PopulationGrowthProps {
  county: CountyName;
  county_fips: string;
  pop_2023: number;
  pop_2024: number;
  population_change: number;
  growth_rate: number;
  births: number;
  deaths: number;
  natural_increase: number;
  international_migration: number;
  domestic_migration: number;
  net_migration: number;
  under_18: number | null;
}
export type PopulationGrowthCollection = FeatureCollection<Polygon, PopulationGrowthProps> & { vintage?: string };

// Opportunity zones (designated QOZ tracts).
export interface OpportunityZoneProps {
  geoid: string;
  state_fips: string;
  county_fips: string;
  county: CountyName | null;
  tract: string;
  rural: boolean;
  designated: boolean;
}
export type OpportunityZoneCollection = FeatureCollection<Polygon | MultiPolygon, OpportunityZoneProps> & { vintage?: string };

// Legislative districts (congressional + state upper/lower).
export type Chamber = "CD" | "SLDU" | "SLDL";
export interface LegislativeProps {
  chamber: Chamber;
  district_number: string;
  geoid: string;
  name: string;
  label: string;
}
export type LegislativeCollection = FeatureCollection<Polygon | MultiPolygon, LegislativeProps> & { vintage?: string };

// Representatives dataset (feeds inspector legislative rows). Federal members
// are populated; state-legislative and county-board names are structured but
// intentionally left empty until their per-source feeds are integrated.
export interface Representative {
  name: string;
  party: string | null;
  phone?: string | null;
  url?: string | null;
  class?: string | null;
  source: string;
}
export interface RepresentativesFile {
  vintage: string;
  source: string;
  congressional: Record<string, Representative>; // keyed "CD-<n>"
  senate: Representative[];
  state_legislative: Record<string, Representative>;
  board: Record<string, Representative>;
  notes?: string;
}

// Existing Schools of Hope (Revolving Loan Fund ledger). A reference overlay of
// real hope-operator sites that have drawn loan-fund capital, per F.S. 1001.292.
export interface SchoolOfHopeProps {
  operator: string;
  address: string;
  reported_address: string;
  amount: number;
  date: string;
  note: string;
  county: CountyName | null;
  geocode_source: string;
}
export type SchoolsOfHopeCollection = FeatureCollection<Point, SchoolOfHopeProps> & {
  vintage?: string;
  source?: string;
  total_disbursed?: number;
};

// Enrollment history dataset (feeds inspector enrollment trend).
export interface EnrollmentEntry {
  year: string;
  enrollment: number;
}
export interface EnrollmentHistoryFile {
  vintage: string;
  source: string;
  schools: Record<string, EnrollmentEntry[]>; // keyed by MSID
}

// Orange County board-district assignment: MSID -> district number (1-7). Orange
// has no board polygons, so this is how its schools resolve in the district
// filter. See scripts/parse-orange-board.mjs.
export type OrangeBoardFile = Record<string, number>;

// The load state every adapter exposes. Fail loud on data problems (error is a
// specific message), fail soft on runtime problems (handled by the UI).
export interface LoadResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  source: string;
  vintage: string;
}
