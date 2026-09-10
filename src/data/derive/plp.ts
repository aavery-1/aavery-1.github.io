// Persistently Low-Performing (PLP) school calculator per F.S. 1002.333(1)(c).
//
// The statute defines PLP as meeting ANY of three criteria: (c)1 the grades test
// below; (c)2 a school closed under s. 1008.33(4) within 2 years of a notice of
// intent; or (c)3 bottom 10% in >=2 of the previous 3 years on grade-3 ELA /
// grade-4 math screening. This function computes ONLY (c)1 (the only one derivable
// from grade history); (c)2 and (c)3 require data we do not have. So the official
// FL DOE PLP list is PREFERRED when loaded (it captures all three) and this is a
// fallback that can only UNDER-count relative to the official list.
//
// (c)1 grades test - a school is PLP if:
//   1. It earned three grades lower than "C" in at least 3 of the previous 5
//      years that the school received a grade, AND
//   2. It has not earned a grade of "B" or higher in the most recent 2 school
//      years.
//
// Grades below C are D and F. Non-standard grades (I, NR, NG) are neither
// counted as "below C" nor as a graded year: they are excluded when picking
// the "previous 5 years that the school received a grade" and when checking
// the "most recent 2 school years" (which the statute reads as the most
// recent 2 years the school actually received a grade).
//
// Source: https://www.flsenate.gov/Laws/Statutes/2024/1002.333

import type { GradeHistoryEntry, GradesFile } from "../types";

const BELOW_C = new Set(["D", "F"]);
const B_OR_HIGHER = new Set(["A", "B"]);
const GRADED = new Set(["A", "B", "C", "D", "F"]);

export interface PlpResult {
  isPlp: boolean;
  reason: string;
  belowCInLast5: number;    // count of D/F in the previous 5 graded years
  recent2: string[];         // the most recent 2 graded years (grade letters), newest first
}

export function evaluatePlp(history: GradeHistoryEntry[]): PlpResult {
  // Newest first, only real grades.
  const graded = [...history]
    .filter((h) => GRADED.has(h.grade))
    .sort((a, b) => b.year.localeCompare(a.year));

  if (graded.length === 0) {
    return { isPlp: false, reason: "No letter grades on record yet.", belowCInLast5: 0, recent2: [] };
  }

  const last5 = graded.slice(0, 5);
  const belowCInLast5 = last5.filter((h) => BELOW_C.has(h.grade)).length;
  const recent2 = graded.slice(0, 2).map((h) => h.grade);

  const enoughLowYears = belowCInLast5 >= 3;
  const noBOrHigherRecent2 = recent2.length > 0 && recent2.every((g) => !B_OR_HIGHER.has(g));

  if (enoughLowYears && noBOrHigherRecent2) {
    return {
      isPlp: true,
      // Plain-language verdict first, then the evidence (see 07_CONTENT_STYLE.md).
      reason: `${belowCInLast5} of its last ${last5.length} grades were below C, and neither of its 2 most recent grades reached B (${recent2.join(", ")}). Those are the two tests for persistently low-performing.`,
      belowCInLast5,
      recent2,
    };
  }

  // Not PLP: say plainly which test it fails to meet, in everyday words.
  const reasons: string[] = [];
  if (!enoughLowYears) reasons.push(`only ${belowCInLast5} of its last ${last5.length} grades were below C (it takes 3)`);
  if (!noBOrHigherRecent2) {
    const recentB = recent2.filter((g) => B_OR_HIGHER.has(g));
    reasons.push(`its recent grades are B or higher (${recentB.join(", ")})`);
  }
  return {
    isPlp: false,
    reason: `${reasons.join(", and ").replace(/^./, (c) => c.toUpperCase())}.`,
    belowCInLast5,
    recent2,
  };
}

// Build a Set of PLP MSIDs from a loaded grades file. Cheap to compute at
// data-load time and pass through the store.
export function plpMsids(grades: GradesFile | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!grades) return out;
  for (const msid of Object.keys(grades.schools)) {
    if (evaluatePlp(grades.schools[msid]).isPlp) out.add(msid);
  }
  return out;
}
