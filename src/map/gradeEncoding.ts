// Grade pin encoding: color PLUS letter, always. Never color alone.
//
// Color alone fails for red-green colorblind viewers (about 8% of men) and fails
// on grayscale printing. Every pin carries the grade letter inside it at every
// zoom level, so the letter is the encoding of record and color is the
// reinforcement. The full domain is A, B, C, D, F, I, NR, NG. Non-standard
// grades (I, NR, NG) are rendered distinctly and are never coerced into A-F.
//
// This module owns the mapping. It is exhaustive by construction: GRADE_DOMAIN
// lists every valid grade, resolveGradeStyle returns a style for each, and the
// grade-domain test asserts none falls through to a default.

export const GRADE_DOMAIN = ["A", "B", "C", "D", "F", "I", "NR", "NG"] as const;
export type Grade = (typeof GRADE_DOMAIN)[number];

export interface GradeStyle {
  grade: Grade;
  // RGBA fill for the deck.gl pin.
  fill: [number, number, number, number];
  // RGBA outline.
  stroke: [number, number, number, number];
  // Dashed outline (NG only) for the map legend and SVG rendering.
  dashed: boolean;
  // Text drawn inside the pin. Always the grade letter(s), never empty.
  letter: string;
  // Color of the letter text, chosen for contrast against the fill.
  letterColor: [number, number, number, number];
  // A human sentence for aria-labels and the inspector badge.
  description: string;
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
// Neutral slate for the ungraded family (NR / NG): a filled mid-grey marker with
// dark letters, so they read clearly on the light basemap (a paler grey washed
// out). The letters NR / NG remain the encoding of record.
const NEUTRAL_FILL: [number, number, number, number] = [148, 163, 184, 255];   // Slate 400
const NEUTRAL_STROKE: [number, number, number, number] = [71, 85, 105, 255];    // Slate 600
const NEUTRAL_LETTER: [number, number, number, number] = [15, 23, 42, 255];     // Slate 900

// Fills use the Material Design named palette for A-F. Fill = tone 700, stroke =
// tone 900 (deeper, for a clear edge). Letters are white on the colored A-F fills
// and dark slate on the neutral NR / NG fills, so contrast holds either way
// (WCAG AA at 12px+). NR / NG use a light slate fill (not white) so they stay
// legible on the light basemap.
//
//   A  Green 700       #388E3C   stroke Green 900    #1B5E20
//   B  Blue 700        #1976D2   stroke Blue 900     #0D47A1
//   C  Amber 800       #FF8F00   stroke Amber 900    #FF6F00
//   D  Deep Orange 700 #E64A19   stroke Deep Orng 900 #BF360C
//   F  Red 700         #D32F2F   stroke Red 900      #B71C1C
//   I  Grey 600        #757575   stroke Grey 800     #424242
const STYLES: Record<Grade, GradeStyle> = {
  A: { grade: "A", fill: [56, 142, 60, 255],  stroke: [27, 94, 32, 255],  dashed: false, letter: "A",  letterColor: WHITE, description: "Grade A" },
  B: { grade: "B", fill: [25, 118, 210, 255], stroke: [13, 71, 161, 255], dashed: false, letter: "B",  letterColor: WHITE, description: "Grade B" },
  C: { grade: "C", fill: [255, 143, 0, 255],  stroke: [255, 111, 0, 255], dashed: false, letter: "C",  letterColor: WHITE, description: "Grade C" },
  D: { grade: "D", fill: [230, 74, 25, 255],  stroke: [191, 54, 12, 255], dashed: false, letter: "D",  letterColor: WHITE, description: "Grade D" },
  F: { grade: "F", fill: [211, 47, 47, 255],  stroke: [183, 28, 28, 255], dashed: false, letter: "F",  letterColor: WHITE, description: "Grade F" },
  I: { grade: "I", fill: [117, 117, 117, 255], stroke: [66, 66, 66, 255], dashed: false, letter: "I",  letterColor: WHITE, description: "Incomplete (did not meet minimum participation for grading)" },
  NR: { grade: "NR", fill: NEUTRAL_FILL, stroke: NEUTRAL_STROKE, dashed: false, letter: "NR", letterColor: NEUTRAL_LETTER, description: "Not Rated (school type not rated by FL DOE)" },
  NG: { grade: "NG", fill: NEUTRAL_FILL, stroke: NEUTRAL_STROKE, dashed: true,  letter: "NG", letterColor: NEUTRAL_LETTER, description: "No Grade (too new or otherwise ungraded)" },
};

// Exposed so the legend can render one swatch per grade from the same source of
// truth the map draws from.
export const GRADE_STYLES = STYLES;

export function isGrade(value: unknown): value is Grade {
  return typeof value === "string" && (GRADE_DOMAIN as readonly string[]).includes(value);
}

// Resolve a raw grade string to a style. Throws on an unknown grade rather than
// silently defaulting, so a bad value fails loud instead of rendering as if it
// were valid. Callers validating sample data already guarantee the domain.
export function resolveGradeStyle(grade: string): GradeStyle {
  if (!isGrade(grade)) {
    throw new Error(
      `Unknown grade "${grade}". The allowed domain is ${GRADE_DOMAIN.join(", ")} (see 03_DATA_CATALOG.md).`,
    );
  }
  return STYLES[grade];
}

// CSS hex helpers for the DOM legend and inspector badge (deck.gl uses the RGBA
// arrays above; the HTML UI uses these strings).
export function rgbaToCss([r, g, b, a]: [number, number, number, number]): string {
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}
