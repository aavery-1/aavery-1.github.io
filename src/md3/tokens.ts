// Material Design 3 design tokens: the single source of visual truth for this
// tool. Reference: https://m3.material.io. The color roles below were generated
// from the brand-blue seed (#0F62FE) with Google's official material-color
// -utilities engine (SchemeVibrant), so they are a spec-correct HCT tonal
// palette, not hand-picked hexes. Regenerate with scripts/gen-md3-theme.mjs.
//
// No em dashes anywhere in this file, per the prose style rule.

// ---------------------------------------------------------------------------
// Color roles (light + dark). Light is the active scheme; dark is kept so a
// runtime theme toggle can be added without regenerating.
// ---------------------------------------------------------------------------
export interface M3Scheme {
  primary: string; onPrimary: string; primaryContainer: string; onPrimaryContainer: string;
  secondary: string; onSecondary: string; secondaryContainer: string; onSecondaryContainer: string;
  tertiary: string; onTertiary: string; tertiaryContainer: string; onTertiaryContainer: string;
  error: string; onError: string; errorContainer: string; onErrorContainer: string;
  background: string; onBackground: string;
  surface: string; onSurface: string; surfaceVariant: string; onSurfaceVariant: string;
  surfaceDim: string; surfaceBright: string;
  surfaceContainerLowest: string; surfaceContainerLow: string; surfaceContainer: string;
  surfaceContainerHigh: string; surfaceContainerHighest: string;
  outline: string; outlineVariant: string;
  inverseSurface: string; inverseOnSurface: string; inversePrimary: string;
  surfaceTint: string; shadow: string; scrim: string;
}

export const M3_LIGHT: M3Scheme = {
  primary: "#0052dd", onPrimary: "#ffffff", primaryContainer: "#dbe1ff", onPrimaryContainer: "#003da9",
  secondary: "#5c5b7d", onSecondary: "#ffffff", secondaryContainer: "#e3dfff", onSecondaryContainer: "#454364",
  tertiary: "#675687", onTertiary: "#ffffff", tertiaryContainer: "#ebddff", onTertiaryContainer: "#4f3e6e",
  error: "#ba1a1a", onError: "#ffffff", errorContainer: "#ffdad6", onErrorContainer: "#93000a",
  background: "#faf8ff", onBackground: "#191b25",
  surface: "#faf8ff", onSurface: "#191b25", surfaceVariant: "#e0e1f2", onSurfaceVariant: "#434654",
  surfaceDim: "#d8d9e7", surfaceBright: "#faf8ff",
  surfaceContainerLowest: "#ffffff", surfaceContainerLow: "#f2f3ff", surfaceContainer: "#ecedfb",
  surfaceContainerHigh: "#e6e7f5", surfaceContainerHighest: "#e1e1ef",
  outline: "#747685", outlineVariant: "#c3c6d6",
  inverseSurface: "#2e303a", inverseOnSurface: "#eff0fe", inversePrimary: "#b4c5ff",
  surfaceTint: "#0052dd", shadow: "#000000", scrim: "#000000",
};

export const M3_DARK: M3Scheme = {
  primary: "#b4c5ff", onPrimary: "#002979", primaryContainer: "#003da9", onPrimaryContainer: "#dbe1ff",
  secondary: "#c5c2ea", onSecondary: "#2e2d4d", secondaryContainer: "#454364", onSecondaryContainer: "#e3dfff",
  tertiary: "#d2bdf6", onTertiary: "#382856", tertiaryContainer: "#4f3e6e", onTertiaryContainer: "#ebddff",
  error: "#ffb4ab", onError: "#690005", errorContainer: "#93000a", onErrorContainer: "#ffdad6",
  background: "#10131c", onBackground: "#e1e1ef",
  surface: "#10131c", onSurface: "#e1e1ef", surfaceVariant: "#434654", onSurfaceVariant: "#c3c6d6",
  surfaceDim: "#10131c", surfaceBright: "#363943",
  surfaceContainerLowest: "#0b0e17", surfaceContainerLow: "#191b25", surfaceContainer: "#1d1f29",
  surfaceContainerHigh: "#272a34", surfaceContainerHighest: "#32343f",
  outline: "#8d909f", outlineVariant: "#434654",
  inverseSurface: "#e1e1ef", inverseOnSurface: "#2e303a", inversePrimary: "#0052dd",
  surfaceTint: "#b4c5ff", shadow: "#000000", scrim: "#000000",
};

// The active scheme. Light for now; swapping this (and re-running installThemeVariables)
// is all a future dark-mode toggle needs at the token layer.
export const M3 = M3_LIGHT;

// ---------------------------------------------------------------------------
// Shape scale (corner radius, px). MD3 assigns a shape token per component;
// these are the seven canonical steps.
// ---------------------------------------------------------------------------
export const SHAPE = {
  none: 0,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Elevation. MD3 conveys elevation primarily through the surface-container
// tones above (a higher container = more elevated), with shadow reserved for
// components that float above content. These are MD3's level 1-5 shadow tokens.
// ---------------------------------------------------------------------------
export const ELEVATION = {
  0: "none",
  1: "0px 1px 2px 0px rgba(0,0,0,0.30), 0px 1px 3px 1px rgba(0,0,0,0.15)",
  2: "0px 1px 2px 0px rgba(0,0,0,0.30), 0px 2px 6px 2px rgba(0,0,0,0.15)",
  3: "0px 1px 3px 0px rgba(0,0,0,0.30), 0px 4px 8px 3px rgba(0,0,0,0.15)",
  4: "0px 2px 3px 0px rgba(0,0,0,0.30), 0px 6px 10px 4px rgba(0,0,0,0.15)",
  5: "0px 4px 4px 0px rgba(0,0,0,0.30), 0px 8px 12px 6px rgba(0,0,0,0.15)",
} as const;

// State-layer opacities: the "on" role laid over a component to signal state.
export const STATE = { hover: 0.08, focus: 0.1, pressed: 0.1, dragged: 0.16 } as const;

// ---------------------------------------------------------------------------
// Type scale (Roboto). The full MD3 scale; the app references the roles it needs.
// size/lineHeight in px, weight numeric, letterSpacing in px (MUI accepts px).
// ---------------------------------------------------------------------------
type Role = { fontSize: number; lineHeight: number; fontWeight: number; letterSpacing: number };
const role = (fontSize: number, lh: number, fontWeight: number, letterSpacing: number): Role => ({
  fontSize, lineHeight: lh / fontSize, fontWeight, letterSpacing,
});

export const M3_TYPE = {
  displayLarge: role(57, 64, 400, -0.25),
  displayMedium: role(45, 52, 400, 0),
  displaySmall: role(36, 44, 400, 0),
  headlineLarge: role(32, 40, 400, 0),
  headlineMedium: role(28, 36, 400, 0),
  headlineSmall: role(24, 32, 400, 0),
  titleLarge: role(22, 28, 400, 0),
  titleMedium: role(16, 24, 500, 0.15),
  titleSmall: role(14, 20, 500, 0.1),
  bodyLarge: role(16, 24, 400, 0.5),
  bodyMedium: role(14, 20, 400, 0.25),
  bodySmall: role(12, 16, 400, 0.4),
  labelLarge: role(14, 20, 500, 0.1),
  labelMedium: role(12, 16, 500, 0.5),
  labelSmall: role(11, 16, 500, 0.5),
} as const;

// ---------------------------------------------------------------------------
// Motion: MD3 easing and duration tokens.
// ---------------------------------------------------------------------------
export const EASING = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  standardAccelerate: "cubic-bezier(0.3, 0, 1, 1)",
  standardDecelerate: "cubic-bezier(0, 0, 0, 1)",
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
  emphasizedAccelerate: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  emphasizedDecelerate: "cubic-bezier(0.05, 0.7, 0.1, 1)",
} as const;

export const DURATION = {
  short1: 50, short2: 100, short3: 150, short4: 200,
  medium1: 250, medium2: 300, medium3: 350, medium4: 400,
  long1: 450, long2: 500, long3: 550, long4: 600,
} as const;

// Fonts. Roboto is MD3's reference typeface; a mono face is kept for MSIDs,
// coordinates, and code, tabular by default.
export const FONT_SANS =
  'Roboto, "Roboto Flex", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const FONT_MONO =
  '"Roboto Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
