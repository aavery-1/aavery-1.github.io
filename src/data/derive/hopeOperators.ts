// Designated Hope Operators, per s. 1002.333(2), F.S. A "school of hope" is a
// charter operated by a state-designated hope operator, so the tool stars the
// schools run by those operators. The authoritative roster is published by FL
// DOE and reproduced in "Copy of Schools of Hope Resources.pdf" (p.2):
//
//   The six Florida designated hope operators are: Mater Academy, RCMA, IDEA
//   Public Schools, Success Academy, Renaissance/Warrington Preparatory Academy,
//   and KIPP New Jersey.
//
// This module maps that roster to the school names in our tri-county dataset. It
// is an EXPLICIT, auditable registry (not a fuzzy contains() scan) for one
// integrity reason: the generic "Renaissance Charter" chain in Broward is run by
// Charter Schools USA and is NOT the designated "Renaissance/Warrington
// Preparatory Academy" (a single Escambia school), so a bare "renaissance" match
// would falsely star 13 schools that are not schools of hope. Each operator below
// carries an explicit `match` (and, where needed, `exclude`) so every star on the
// map traces back to a named, designated operator. No em dashes in this file.
//
// See SCHOOLS_OF_HOPE_LEGAL_BASIS.md section 1a for the citation.

import type { SchoolFeature, SchoolCollection } from "../types";

export interface HopeOperatorRule {
  // Display name shown on the star tooltip.
  name: string;
  // True when this school belongs to the operator's network.
  match: (name: string) => boolean;
  // Optional guard: exclude look-alike names that are NOT this operator.
  exclude?: (name: string) => boolean;
}

// Small helpers so each rule reads as intent, not regex noise.
const startsWord = (prefix: string) => (n: string) =>
  new RegExp(`^${prefix}\\b`, "i").test(n.trim());
const containsWord = (word: string) => (n: string) =>
  new RegExp(`\\b${word}\\b`, "i").test(n);

// The six designated operators. Rules are precise on purpose: only Mater Academy
// and KIPP have schools in the loaded tri-county (Miami-Dade / Broward / Orange)
// data today; IDEA, RCMA, Success Academy, and Renaissance/Warrington operate
// elsewhere in Florida, so their rules match nothing here but are kept so the
// roster stays complete and future data lights up automatically.
export const HOPE_OPERATORS: HopeOperatorRule[] = [
  // Academica-managed Mater network (Miami-Dade + Broward).
  { name: "Mater Academy", match: startsWord("Mater") },
  // KIPP network. The designated entity is KIPP New Jersey; KIPP Miami is the
  // KIPP-network operator that has actually opened schools of hope in Florida
  // (it is the KIPP operator in the Revolving Loan Fund ledger).
  { name: "KIPP", match: startsWord("KIPP") },
  // IDEA Public Schools (Tampa / Jacksonville; none in the tri-county set).
  { name: "IDEA Public Schools", match: startsWord("IDEA") },
  // RCMA / Redlands Christian Migrant Association (Polk / Hillsborough / Collier).
  { name: "RCMA", match: (n) => startsWord("RCMA")(n) || containsWord("Redlands Christian")(n) },
  // Success Academy (New York; no Florida schools today).
  { name: "Success Academy", match: containsWord("Success Academy") },
  // Renaissance/Warrington Preparatory Academy is a SINGLE Escambia school. Match
  // "Warrington" specifically, and never the generic "Renaissance Charter" chain
  // (Charter Schools USA), which is a different, non-designated operator.
  {
    name: "Renaissance/Warrington Preparatory Academy",
    match: containsWord("Warrington"),
    exclude: (n) => /renaissance charter/i.test(n),
  },
];

// The designated operator that runs this school, or null. First match wins.
export function matchHopeOperator(name: string): string | null {
  for (const op of HOPE_OPERATORS) {
    if (op.exclude?.(name)) continue;
    if (op.match(name)) return op.name;
  }
  return null;
}

// MSID -> operator name for every loaded school run by a designated hope
// operator. Cheap to compute at data-load time and pass through the store, the
// same shape the PLP set uses.
export function hopeOperatorMsids(schools: SchoolCollection | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!schools) return out;
  for (const f of schools.features) {
    const op = matchHopeOperator(f.properties.name);
    if (op) out.set(f.properties.msid, op);
  }
  return out;
}

// Convenience for callers that already hold the feature array.
export function isHopeOperatorSchool(f: SchoolFeature): boolean {
  return matchHopeOperator(f.properties.name) !== null;
}
