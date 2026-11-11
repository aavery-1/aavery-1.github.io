// Design tokens as plain TypeScript constants, for the few places that need a
// color or a type value in code (inline styles, data encodings, a tint). The
// visual system itself is real IBM Carbon (Gray 10 theme, see carbon-styles.scss),
// and plain CSS reads the matching custom properties installed by theme.ts. These
// constants used to live in the MUI theme module; MUI is gone, the names are kept
// so every importer reads the same values as before. No em dashes in this file.

// Chrome (app bar, left rail): white surface over the Gray 10 canvas. Named
// NAVY / NAVY_DEEP only for compatibility with older imports.
export const NAVY = "#FFFFFF";
export const NAVY_DEEP = "#F4F4F4";
export const SHELL_BG = "#FFFFFF";       // White, layer-01 (chrome, cards, fields)
export const SHELL_ALT = "#F4F4F4";      // Gray 10, page canvas
export const SHELL_ON = "#161616";       // Gray 100, text-primary
export const SHELL_DIM = "#525252";      // Gray 70, text-secondary
export const SHELL_MUTED = "#6F6F6F";    // Gray 60, text-helper
export const SHELL_HAIRLINE = "#E0E0E0"; // Gray 20, border-subtle
export const BORDER_STRONG = "#8D8D8D";  // Gray 50, border-strong (field underlines)

// The one interactive color: KIPP navy, with a darker navy for hover/active and
// as text on a light navy tint. TEAL / TEAL_DARK are retained as aliases so the
// components that import them do not change; they resolve to KIPP navy.
// (This is the code half of the brand color; the Carbon components read the
// matching --cds-* overrides in carbon-styles.scss, and plain CSS reads --focus
// from theme.ts. Keep all three in sync.)
export const ACCENT = "#001E62";      // KIPP navy (brand indigo), interactive
export const ACCENT_DARK = "#001541"; // Darker navy, hover / active
export const ACCENT_TEXT = "#001541"; // Darker navy, text on a navy tint
export const TEAL = ACCENT;
export const TEAL_DARK = ACCENT_DARK;

// Carbon status (support) colors: Green 50, Orange 40 (caution), Red 60.
export const STATUS = {
  good: "#24A148",
  warning: "#FF832B",
  error: "#DA1E28",
};

// TYPE: the canonical type scale, mapped to Carbon's productive type set. Five
// roles, no more. Headings are IBM Plex Semibold (600), body is Regular (400).
export const TYPE = {
  title: { fontSize: 16, fontWeight: 600, lineHeight: 1.375 },  // Carbon heading-compact-02
  body: { fontSize: 14, fontWeight: 400, lineHeight: 1.43 },    // Carbon body-01
  label: { fontSize: 13, fontWeight: 600, lineHeight: 1.29 },   // Carbon heading-compact-01
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.34 }, // Carbon label-01
  micro: { fontSize: 12, fontWeight: 400, lineHeight: 1.34 },   // dense labels, at Carbon's 12px floor
} as const;

// Font weights, by intent. Carbon uses Regular (400) and Semibold (600).
export const WEIGHT = { body: 400, emphasis: 600, heading: 600 } as const;

// Spacing base: Carbon's 8px mini-unit.
export const SPACE = 8;
export const CARD_PADDING = 16;

// Focus: the brand navy, so focus rings and the interactive accent read as one.
export const FOCUS = ACCENT;

// A translucent tint of any CSS color (a hex literal or a var()), the plain-CSS
// replacement for MUI's alpha(). `amount` is 0..1, like alpha().
export function tint(color: string, amount: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, amount)) * 1000) / 10;
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
