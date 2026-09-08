// Every non-trivial derivation the inspector shows is defined here, exactly
// once. The inspector's "tract median income" and "drive-time reach" all come
// from these functions and are not recomputed a
// second way anywhere else (05_ACCURACY_STANDARDS.md section 2).

import type { PolygonIndex } from "../../geo/spatialIndex";
import type { LngLat } from "../../geo/measure";
import type {
  IncomeProps, BoardDistrictProps, IsochroneCollection, IsochroneProps,
  OpportunityZoneProps, LegislativeProps, PopulationGrowthProps, RepresentativesFile,
} from "../types";

export function incomeAtPoint(index: PolygonIndex | null, point: LngLat): IncomeProps | null {
  const f = index?.first(point);
  return (f?.properties as IncomeProps) ?? null;
}

export function boardDistrictAtPoint(index: PolygonIndex | null, point: LngLat): BoardDistrictProps | null {
  const f = index?.first(point);
  return (f?.properties as BoardDistrictProps) ?? null;
}

// Drive-time reach is a stored value on the isochrone that originates from the
// given school. If no isochrone was precomputed for that school, there is no
// value (the inspector shows a labeled empty state, never a fake zero).
export function driveTimeReachForSchool(isochrones: IsochroneCollection | null, msid: string): IsochroneProps | null {
  if (!isochrones) return null;
  const f = isochrones.features.find((iso) => iso.properties.origin_msid === msid);
  return f?.properties ?? null;
}

export function opportunityZoneAtPoint(index: PolygonIndex | null, point: LngLat): OpportunityZoneProps | null {
  const f = index?.first(point);
  return (f?.properties as OpportunityZoneProps) ?? null;
}

// All legislative districts (CD, SLDU, SLDL) that contain the point. A point
// sits in exactly one district per chamber, so this returns up to three.
export function legislativeDistrictsAtPoint(index: PolygonIndex | null, point: LngLat): LegislativeProps[] {
  if (!index) return [];
  return index.containing(point).map((f) => f.properties as LegislativeProps);
}

export function populationGrowthAtPoint(index: PolygonIndex | null, point: LngLat): PopulationGrowthProps | null {
  const f = index?.first(point);
  return (f?.properties as PopulationGrowthProps) ?? null;
}

// Human-readable summary of the districts a school sits in, with the member
// name where we have it (federal House from the reps file). Ordered CD, SLDU,
// SLDL for a consistent read.
export function formatLegislativeDistricts(districts: LegislativeProps[], reps: RepresentativesFile | null): string {
  const order: Record<string, number> = { CD: 0, SLDU: 1, SLDL: 2 };
  const label: Record<string, string> = { CD: "Congress", SLDU: "State Senate", SLDL: "State House" };
  return [...districts]
    .sort((a, b) => (order[a.chamber] ?? 9) - (order[b.chamber] ?? 9))
    .map((d) => {
      let who = "";
      if (d.chamber === "CD" && reps) {
        const rep = reps.congressional[`CD-${d.district_number}`];
        if (rep) who = ` - ${rep.name}${rep.party ? ` (${rep.party[0]})` : ""}`;
      }
      return `${label[d.chamber] ?? d.chamber} ${d.district_number}${who}`;
    })
    .join("; ");
}

// Honest precision for a noisy ACS estimate: show the value with its margin of
// error, not false decimals. "median $62,340 plus or minus $4,210" is honest.
export function formatIncomeWithMoe(props: IncomeProps): string {
  if (props.median_household_income == null) return "no data at this location";
  const base = `$${props.median_household_income.toLocaleString("en-US")}`;
  if (props.moe == null) return base;
  return `${base} +/- $${props.moe.toLocaleString("en-US")}`;
}
