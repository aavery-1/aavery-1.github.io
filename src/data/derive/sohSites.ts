// Curated School of Hope SITE designations for Miami-Dade, from the KIPP / Mater /
// Success Academy activity map (project deck). These are keyed by MSID and sit
// alongside the OPERATOR roster in hopeOperators.ts (which flags a school by who
// runs it). Two of the deck's four marker types carry no signal in a school's
// name and so must be an explicit, auditable registry:
//
//   Success Academy co-locations  Approved by the MDCPS Board on Apr 22, 2026.
//     Success co-locates a School of Hope INTO each host district high school, so
//     the host is flagged with the same gold star an operator School of Hope gets.
//   KIPP requested buildings      Vacant or underused MDCPS facilities that KIPP
//     Miami has requested. Not yet operating, so the host is drawn as an OPEN dot.
//
// The deck's other two marker types need no MSID list here:
//   Mater Academy schools of hope are matched by operator name (startsWord Mater)
//     in hopeOperators.ts, so they already star.
//   KIPP CURRENT campuses are the KIPP-network schools already in the data,
//     matched by isKippSchool(name); they draw a SOLID yellow dot.
//
// One classifier, sohMarker(), is the single source of truth for the map marker
// layers, the legend meaning, and the hover card, so the three never disagree.
// No em dashes in this file.

import { matchHopeOperator, isKippSchool } from "./hopeOperators";

// Success Academy approved co-locations (MDCPS Board, Apr 22, 2026). Host = the
// district high school Success co-locates into; the callout data in the deck is
// that host school's data.
export const SUCCESS_COLOCATION_MSIDS: ReadonlySet<string> = new Set([
  "13-7591", // North Miami Senior High School
  "13-7131", // Hialeah-Miami Lakes Senior High
  "13-7049", // Westland Hialeah Senior High School
  "13-7341", // Miami Jackson Senior High School
  "13-7151", // Homestead Senior High School
]);

// KIPP Miami requested buildings: MDCPS facilities KIPP has requested. Host = the
// current occupant school; the deck shows that host school's data.
export const KIPP_REQUESTED_MSIDS: ReadonlySet<string> = new Set([
  "13-6051", // Carol City Middle School
  "13-1681", // Lillie C. Evans K-8 Center
  "13-3621", // Coconut Palm K-8 Academy
]);

export function isSuccessColocation(msid: string): boolean {
  return SUCCESS_COLOCATION_MSIDS.has(msid);
}

export function isKippRequestedBuilding(msid: string): boolean {
  return KIPP_REQUESTED_MSIDS.has(msid);
}

// The School of Hope marker a school carries on the map, or null.
//   "star"           Mater (or any non-KIPP designated operator) OR a Success
//                    Academy approved co-location host. Drawn as a gold star.
//   "kipp-current"   A current KIPP Miami campus. Drawn as a solid yellow dot.
//   "kipp-requested" A KIPP Miami requested district building. Drawn as an open dot.
export type SohMarker = "star" | "kipp-current" | "kipp-requested" | null;

export function sohMarker(name: string, msid: string): SohMarker {
  // A requested building is a district school (its name is not a KIPP name), so
  // check it first: the site is KIPP's request, not its current campus.
  if (isKippRequestedBuilding(msid)) return "kipp-requested";
  if (isKippSchool(name)) return "kipp-current";
  const op = matchHopeOperator(name);
  if (op && op !== "KIPP") return "star"; // Mater, and any future non-KIPP operator
  if (isSuccessColocation(msid)) return "star"; // Success Academy co-location host
  return null;
}

// A KIPP dot (current or requested) owns the school's upper-right corner, so the
// teal co-location dot yields to it there. The star keeps its existing behavior.
export function hasKippMarker(name: string, msid: string): boolean {
  const m = sohMarker(name, msid);
  return m === "kipp-current" || m === "kipp-requested";
}

// The hover-card label for a school's School of Hope marker, or null. Kept here so
// the wording traces to the same classifier the dot does.
export function sohMarkerLabel(name: string, msid: string): string | null {
  const marker = sohMarker(name, msid);
  if (!marker) return null;
  if (marker === "kipp-requested") return "Requested building · KIPP Miami";
  if (marker === "kipp-current") return "School of Hope · KIPP Miami";
  const op = matchHopeOperator(name);
  if (op) return `School of Hope · ${op === "KIPP" ? "KIPP Miami" : op}`;
  if (isSuccessColocation(msid)) return "School of Hope · Success Academy co-location";
  return "School of Hope";
}
