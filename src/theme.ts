// Design tokens as CSS custom properties: Material Design 3 (https://m3.material.io).
// The MD3 roles live in src/md3/tokens.ts; this file exposes the ones plain CSS
// and inline styles reference, under the same variable names as before so
// styles.css keeps working. No em dashes anywhere in this file (prose style rule).

import { M3, SHAPE, ELEVATION, FONT_SANS, FONT_MONO } from "./md3/tokens";

// The map's DATA encodings (grade A-F scale, utilization tiers, layer ramps)
// carry information, not chrome, so they keep their meaning and are NOT remapped
// to UI roles. The income ramp and layer outlines below are map styling.
export const theme = {
  color: {
    bg: M3.surface,                     // page background (MD3 surface)
    card: M3.surfaceContainerLowest,    // containers, fields (white)
    hairline: M3.outlineVariant,        // subtle border / divider
    textPrimary: M3.onSurface,
    textSecondary: M3.onSurfaceVariant,
    textTertiary: "#5b5e6d",            // helper tone, AA on white
    focus: M3.primary,                  // interactive / focus
    // Map overlay encodings, unchanged (sequential blues + categorical outlines).
    incomeRamp: ["#edf5ff", "#a6c8ff", "#4589ff", "#0f62fe", "#002d9c"],
    boardOutline: "#8a3ffc",
    legislativeOutline: "#6929c4",
    opportunityFill: "#fddc69",
    opportunityOutline: "#d2a106",
    driveTimeOutline: "#009d9a",
  },
  font: {
    sans: FONT_SANS,
    mono: FONT_MONO,
  },
  // MD3 shape: cards are medium (12), chips small (8), controls extra-small (4).
  radius: { card: SHAPE.medium, chip: SHAPE.small, control: SHAPE.extraSmall },
  shadow: {
    // MD3 elevation level 2, for a card that floats above the map.
    card: ELEVATION[2],
  },
  z: {
    map: 0,
    overlayControls: 400,
    panel: 500,
    inspector: 600,
    drawer: 650,
    attribution: 700,
  },
} as const;

// Inject the tokens as CSS custom properties on :root once at startup so plain
// CSS and inline styles can both reference them.
export function installThemeVariables() {
  const r = document.documentElement.style;
  r.setProperty("--bg", theme.color.bg);
  r.setProperty("--card", theme.color.card);
  r.setProperty("--hairline", theme.color.hairline);
  r.setProperty("--text-primary", theme.color.textPrimary);
  r.setProperty("--text-secondary", theme.color.textSecondary);
  r.setProperty("--text-tertiary", theme.color.textTertiary);
  r.setProperty("--focus", theme.color.focus);
  r.setProperty("--font-sans", theme.font.sans);
  r.setProperty("--font-mono", theme.font.mono);
  r.setProperty("--shadow-card", theme.shadow.card);
  r.setProperty("--radius-card", `${theme.radius.card}px`);
}
