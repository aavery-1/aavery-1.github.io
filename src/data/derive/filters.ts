// Single source of truth for how the school filters compose. Every surface that
// needs to render "the schools currently in scope" (map, list, callouts) calls
// passesFilters with the same store slice, so the views never drift out of sync.
//
// AND-composed: a school must pass every active filter to be included. Each
// categorical filter is a Set; an empty Set means "no constraint" (show all).

import type { SchoolFeature, SchoolCollection, GradesFile, CountyName, SchoolLevel, SchoolType, TitleIState } from "../types";
import type { PlpFile } from "../adapters/plp";
import { distanceMiles, type LngLat } from "../../geo/measure";
import { isUnderutilizedFacility, utilizationStyle, type FacilityUseKey, type LatLng } from "../../store";
import type { Grade } from "../../map/gradeEncoding";
import type { PolygonIndex } from "../../geo/spatialIndex";
import { opportunityZoneAtPoint } from "./contextReads";
import { plpMsids } from "./plp";

const SOH_RADIUS_MILES = 5;

// The one rule that decides whether a school sits where a School of Hope operator
// may open, shared by the map/list flag and the inspector so they can never
// drift. Per F.S. 1002.333 the siting area is the greater of a PLP school's
// attendance zone, a 5-mile radius of a PLP school, or a Florida Opportunity
// Zone. (Attendance zones are not in the dataset, so they are not tested.) A
// School of Hope must also be Title I eligible: a definitive "no" disqualifies;
// "unknown" is left as missing, not treated as "no".
export interface SitingEvaluation {
  inSitingArea: boolean;
  titleIBlocked: boolean;
  eligible: boolean;
  reasons: string[]; // human clauses for the positive case
}

export function evaluateSitingArea(args: {
  isPlpAnchor: boolean;
  nearbyPlpCount: number;
  inOpportunityZone: boolean;
  titleI: TitleIState;
}): SitingEvaluation {
  const reasons: string[] = [];
  if (args.isPlpAnchor) reasons.push("a persistently low-performing school itself");
  if (args.nearbyPlpCount > 0) reasons.push(`within 5 miles of ${args.nearbyPlpCount} PLP school${args.nearbyPlpCount === 1 ? "" : "s"}`);
  if (args.inOpportunityZone) reasons.push("inside a Florida Opportunity Zone");
  const inSitingArea = reasons.length > 0;
  const titleIBlocked = args.titleI === "no";
  return { inSitingArea, titleIBlocked, eligible: inSitingArea && !titleIBlocked, reasons };
}

// Tooltip text for an eligible school, spelling out which pathway(s) qualify it
// and making clear this marks a location, not an official school status.
export function formatSitingReason(reasons: string[]): string {
  return `School of Hope siting area (F.S. 1002.333): ${reasons.join("; ")}.`;
}

// Co-location under the statute is into "underused, vacant, or surplus SCHOOL
// DISTRICT facilities" (F.S. 1002.333(7); Rule 6A-1.0998271(6)), i.e. any public
// school operated by the district. That is every type except charter schools
// (not district-operated) and virtual schools (no physical building). Magnet,
// traditional, alternative, and other district-run schools all count.
export function isDistrictOperated(type: SchoolType): boolean {
  return type !== "Charter" && type !== "Virtual";
}

// The FACILITY half of the co-location test (Rule 6A-1.0998271(5)(e)): a
// district-operated building that is underused, i.e. Facility Utilization Rate
// at or below 75% OR a surplus of at least 400 student stations. This alone does
// NOT make a school a co-location target; the siting-area test below must also
// pass, and the statute's 4-year facility-age exclusion (Rule (5)(f)) is not
// modeled here (no building-age data) and must be disclosed to the user.
export function isUnderusedDistrictFacility(f: SchoolFeature): boolean {
  const p = f.properties;
  return isDistrictOperated(p.type) && isUnderutilizedFacility(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
}

// A co-location target: an underused district facility (above) that ALSO lies in
// a School of Hope siting area. Both halves are required by statute. A hope
// operator may co-locate rent-free only where a School of Hope may open, and a
// School of Hope may open only in a Florida Opportunity Zone, a PLP school's
// attendance zone, or within a 5-mile radius of a PLP school (F.S.
// 1002.333(1)(d)1.b; Rule 6A-1.0998271). `inSitingArea` is the geographic result
// from evaluateSitingArea. (The statute's narrow fallback, allowing the nearest
// suitable facility outside the area when the district has none inside, is not
// modeled here; the map flags the primary case.) This is the shared predicate
// for the map/list flag, the inspector, and the co-location filter.
export function isCoLocationTarget(f: SchoolFeature, inSitingArea: boolean): boolean {
  return inSitingArea && isUnderusedDistrictFacility(f);
}

// Why a school is a co-location candidate: the facility-use figure that makes it
// underused, plus the specific siting-area pathway(s) that let a hope operator
// place a school there. Computed once per candidate in buildFilterContext so the
// map tooltip and the inspector cite the same facts. `nearestPlp` is the closest
// same-county PLP anchor within 5 miles (name + geodesic distance), matching the
// distance the measure tool reports.
export interface CoLocationReason {
  utilPct: number | null;                 // rounded % of capacity, from utilizationStyle
  basis: "cofte" | "enrollment" | "none"; // whether the % is the statutory COFTE rate or an enrollment proxy
  isPlpAnchor: boolean;                   // the building is itself a PLP school
  inOpportunityZone: boolean;
  nearestPlp: { msid: string; name: string; miles: number } | null;
}

// One economical sentence naming the utilization and the qualifying pathway(s).
// Opportunity Zone is listed first when both apply (it is the county-independent
// pathway); the enrollment proxy is flagged so the figure is never mistaken for
// the official COFTE-based Facility Utilization Rate.
export function formatCoLocationReason(r: CoLocationReason): string {
  const head =
    r.utilPct == null
      ? "Underused facility"
      : r.basis === "enrollment"
        ? `Underused at ${r.utilPct}% of capacity (enrollment estimate)`
        : `Underused at ${r.utilPct}% of capacity`;
  const paths: string[] = [];
  if (r.inOpportunityZone) paths.push("in a Qualified Opportunity Zone");
  if (r.nearestPlp) paths.push(`within 5 miles of ${r.nearestPlp.name} (${r.nearestPlp.miles.toFixed(1)} mi)`);
  if (!paths.length && r.isPlpAnchor) paths.push("at a persistently low-performing school");
  return paths.length ? `${head}, ${paths.join(" and ")}` : head;
}

export interface SchoolFilterInput {
  counties: Set<CountyName>;
  grades: Set<Grade>;
  levels: Set<SchoolLevel>;
  types: Set<SchoolType>;
  titleI: Set<TitleIState>;
  plpOnly: boolean;
  coLocationOnly: boolean;
  facilityUse: Set<FacilityUseKey>; // utilization tiers (under/inuse/full); empty = no constraint
  // Custom utilization band as % (enrollment / capacity, the ratio the List shows),
  // for precise thresholds the tiers cannot express. null = open on that end.
  utilMin: number | null;
  utilMax: number | null;
  // Custom free/reduced-price lunch band as % (frl_rate * 100). null = open on
  // that end. A school with no reported rate cannot satisfy a set band.
  frlMin: number | null;
  frlMax: number | null;
  boundary: LatLng[] | null; // a generic polygon; when set, only points inside pass
  // The radius tool's committed area, as the EXACT geodesic disk (center + radius
  // in miles). When set, only schools whose geodesic distance to the center is at
  // or below the radius pass. This tests the true circle the map draws, so the set
  // that passes is exactly the set inside the visible ring (no polygon rounding).
  circle: { center: LatLng; radiusMiles: number } | null;
  // MSIDs inside the active board/legislative district, or null for no district
  // filter. Precomputed by the district-tagging spatial join (see districts.ts).
  districtMsids: Set<string> | null;
}

// Ray-casting point-in-polygon on a ring of {lat,lng} vertices. Cheap enough to
// run per school; only invoked when a boundary is active.
export function pointInPolygon(lng: number, lat: number, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    const hit = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export interface SchoolFilterContext {
  plp: Set<string>;              // MSIDs of PLP anchor schools
  sohEligibleMsids: Set<string>; // MSIDs in a siting area (5-mi PLP or OZ) and Title I eligible
  sohReasons: Map<string, string>; // per eligible MSID, why it qualifies (tooltip text)
  coLocationMsids: Set<string>;  // underused district facilities that are ALSO in a siting area
  coLocationReasons: Map<string, CoLocationReason>; // per candidate, the utilization + pathway detail
}

// Compute the derived context once per (schools, grades, plp) tuple. Callers
// memoize on the three identities.
//
// PLP source: prefer the official FL DOE list when available (authoritative,
// per F.S. 1002.333). Fall back to computing from grade history via the statute
// rule.
export function buildFilterContext(
  schools: SchoolCollection | null | undefined,
  grades: GradesFile | null | undefined,
  plpFile?: PlpFile | null,
  ozIndex?: PolygonIndex | null,
): SchoolFilterContext {
  const plp = plpFile ? new Set(Object.keys(plpFile.schools)) : plpMsids(grades);
  const sohEligibleMsids = new Set<string>();
  const sohReasons = new Map<string, string>();
  const coLocationMsids = new Set<string>();
  const coLocationReasons = new Map<string, CoLocationReason>();
  if (schools) {
    // Coordinates of every PLP anchor (with its county), so each school can be
    // tested against them for the 5-mile radius pathway. The county is carried
    // because a School of Hope must be located in the same school district as
    // the Notice of Intent, which is filed in the district where the PLP school
    // was identified (Rule 6A-1.0998271(3)); Florida districts are coterminous
    // with counties, so a PLP anchor only expands eligibility within its own
    // county and cross-county spillover of the 5-mile ring is not counted.
    // Opportunity Zones are an independent pathway, so a school can qualify on
    // OZ alone even when no PLP list loaded.
    const anchors: Array<{ msid: string; coord: LngLat; county: CountyName; name: string }> = [];
    for (const f of schools.features) {
      if (plp.has(f.properties.msid)) anchors.push({ msid: f.properties.msid, coord: f.geometry.coordinates as LngLat, county: f.properties.county, name: f.properties.name });
    }
    for (const f of schools.features) {
      const p = f.properties;
      const here = f.geometry.coordinates as LngLat;
      let nearbyPlpCount = 0;
      // The closest same-county PLP anchor within 5 miles, so the co-location
      // reason can name it and report the distance (same geodesic the eligibility
      // decision and the measure tool use).
      let nearestPlp: { msid: string; name: string; miles: number } | null = null;
      for (const a of anchors) {
        if (a.coord === here) continue; // a PLP anchor is counted via isPlpAnchor, not as its own neighbor
        if (a.county !== p.county) continue; // same-district (county) requirement, Rule 6A-1.0998271(3)
        const d = distanceMiles(here, a.coord);
        if (d <= SOH_RADIUS_MILES) {
          nearbyPlpCount++;
          if (!nearestPlp || d < nearestPlp.miles) nearestPlp = { msid: a.msid, name: a.name, miles: d };
        }
      }
      const inOpportunityZone = Boolean(ozIndex && opportunityZoneAtPoint(ozIndex, here)?.designated);
      const evalResult = evaluateSitingArea({
        isPlpAnchor: plp.has(p.msid),
        nearbyPlpCount,
        inOpportunityZone,
        titleI: p.title_i,
      });
      if (evalResult.eligible) {
        sohEligibleMsids.add(p.msid);
        sohReasons.set(p.msid, formatSitingReason(evalResult.reasons));
      }
      if (isCoLocationTarget(f, evalResult.inSitingArea)) {
        coLocationMsids.add(p.msid);
        const us = utilizationStyle(p.enrollment, p.capacity, p.cofte, p.fish_surplus);
        coLocationReasons.set(p.msid, {
          utilPct: us.pct,
          basis: us.basis,
          isPlpAnchor: plp.has(p.msid),
          inOpportunityZone,
          nearestPlp,
        });
      }
    }
  }
  return { plp, sohEligibleMsids, sohReasons, coLocationMsids, coLocationReasons };
}

export function passesFilters(
  f: SchoolFeature,
  input: SchoolFilterInput,
  ctx: SchoolFilterContext,
): boolean {
  const p = f.properties;

  // Geography
  if (!input.counties.has(p.county)) return false;

  // Rating / grade span / type / Title I (empty set = no constraint)
  if (input.grades.size > 0 && !input.grades.has(p.current_grade)) return false;
  if (input.levels.size > 0 && !input.levels.has(p.level)) return false;
  if (input.types.size > 0 && !input.types.has(p.type)) return false;
  if (input.titleI.size > 0 && !input.titleI.has(p.title_i)) return false;

  // Designations
  if (input.plpOnly && !ctx.plp.has(p.msid)) return false;
  if (input.coLocationOnly && !ctx.coLocationMsids.has(p.msid)) return false;

  // Board / legislative district (matched set precomputed by the spatial join).
  if (input.districtMsids && !input.districtMsids.has(p.msid)) return false;

  // Generic drawn boundary: keep only schools whose point falls inside the polygon.
  if (input.boundary && input.boundary.length >= 3) {
    const [lng, lat] = f.geometry.coordinates as LngLat;
    if (!pointInPolygon(lng, lat, input.boundary)) return false;
  }

  // Radius area: keep only schools within the exact geodesic disk. This is the
  // same ellipsoidal distance the ring is drawn from and the toolbar counts with,
  // so the drawn circle, the count, and the filtered set are one and the same.
  if (input.circle && input.circle.radiusMiles > 0) {
    const center: LngLat = [input.circle.center.lng, input.circle.center.lat];
    if (distanceMiles(center, f.geometry.coordinates as LngLat) > input.circle.radiusMiles) return false;
  }

  // Facility-use tier (OR within the facet). A school's tier is the statutory
  // classification from utilizationStyle; "unknown" (no reported capacity) never
  // matches a chosen tier, so selecting any tier excludes capacity-less schools.
  if (input.facilityUse.size > 0) {
    const key = utilizationStyle(p.enrollment, p.capacity, p.cofte, p.fish_surplus).key;
    if (key === "unknown" || !input.facilityUse.has(key)) return false;
  }

  // Custom utilization band (enrollment / capacity %, the ratio shown in the List).
  // A school with no reported enrollment/capacity cannot satisfy a set band, so it
  // is excluded when either bound is active (same behavior as the tiers).
  if (input.utilMin != null || input.utilMax != null) {
    if (p.enrollment == null || p.capacity == null || p.capacity <= 0) return false;
    const pct = (p.enrollment / p.capacity) * 100;
    if (input.utilMin != null && pct < input.utilMin) return false;
    if (input.utilMax != null && pct > input.utilMax) return false;
  }

  // Custom free/reduced-price lunch band (%). A school with no reported rate
  // (suppressed or absent from the FL DOE report) cannot satisfy a set band.
  if (input.frlMin != null || input.frlMax != null) {
    if (p.frl_rate == null) return false;
    const frlPct = p.frl_rate * 100;
    if (input.frlMin != null && frlPct < input.frlMin) return false;
    if (input.frlMax != null && frlPct > input.frlMax) return false;
  }

  return true;
}

export function filterSchools(
  schools: SchoolCollection | null | undefined,
  input: SchoolFilterInput,
  ctx: SchoolFilterContext,
): SchoolFeature[] {
  if (!schools) return [];
  return schools.features.filter((f) => passesFilters(f, input, ctx));
}
