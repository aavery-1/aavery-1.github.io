// Generates a spec-correct Material Design 3 color scheme (light + dark) from a
// seed color using Google's official material-color-utilities (the HCT / tonal
// palette engine that powers MD3 dynamic color). Run: node scripts/gen-md3-theme.mjs
// Prints JSON with every modern MD3 color role, including the surface-container
// elevation levels. Seed is the tool's existing brand blue for continuity.

import {
  Hct,
  SchemeVibrant,
  MaterialDynamicColors,
  hexFromArgb,
  argbFromHex,
} from "@material/material-color-utilities";

const SEED = "#0F62FE"; // prior brand (Carbon Blue 60); HCT derives the tonal palette
// SchemeVibrant keeps a strong, recognizable blue primary while harmonizing the
// secondary / tertiary / neutral roles, the MD3 way. It preserves brand energy
// better than the muted default TonalSpot for this map / wayfinding tool.

const ROLES = [
  "primary", "onPrimary", "primaryContainer", "onPrimaryContainer",
  "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
  "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
  "error", "onError", "errorContainer", "onErrorContainer",
  "background", "onBackground",
  "surface", "onSurface", "surfaceVariant", "onSurfaceVariant",
  "surfaceDim", "surfaceBright",
  "surfaceContainerLowest", "surfaceContainerLow", "surfaceContainer",
  "surfaceContainerHigh", "surfaceContainerHighest",
  "outline", "outlineVariant",
  "inverseSurface", "inverseOnSurface", "inversePrimary",
  "surfaceTint", "shadow", "scrim",
];

function scheme(isDark) {
  const s = new SchemeVibrant(Hct.fromInt(argbFromHex(SEED)), isDark, 0.0);
  const out = {};
  for (const role of ROLES) {
    out[role] = hexFromArgb(MaterialDynamicColors[role].getArgb(s));
  }
  return out;
}

console.log(JSON.stringify({ seed: SEED, light: scheme(false), dark: scheme(true) }, null, 2));
