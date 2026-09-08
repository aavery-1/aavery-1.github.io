// MUI theme implementing Material Design 3 (https://m3.material.io). The MD3
// color roles, type scale, shape scale, elevation, and motion live in
// src/md3/tokens.ts (generated from the brand seed with Google's official
// material-color-utilities). This file wires them into MUI and expresses MD3
// component behavior: pill buttons with state layers, the MD3 switch, outlined
// text fields, tonal surface containers, and MD3 elevation.
//
// The legacy exported constant NAMES (SHELL_*, ACCENT, TEAL, TYPE, ...) are kept
// as ALIASES onto MD3 roles so every existing call site keeps compiling while
// the surfaces migrate. New code should import the MD3 roles from md3/tokens or
// the `md3` object below. No em dashes in this file (prose style rule).

import { createTheme } from "@mui/material/styles";
import {
  M3, SHAPE, ELEVATION, M3_TYPE, FONT_SANS, FONT_MONO, EASING, DURATION, STATE,
} from "./md3/tokens";

// Re-export the raw MD3 roles under one object for new code.
export const md3 = M3;
export { SHAPE, ELEVATION, EASING, DURATION, FONT_SANS, FONT_MONO };

// Blend two hex colors: `over` laid on `base` at `alpha` (0..1). Used for MD3
// state layers where the exact resulting hex is needed (e.g. a filled button's
// hover surface).
function blend(base: string, over: string, alpha: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(base);
  const [r2, g2, b2] = p(over);
  const m = (a: number, b: number) => Math.round(a * (1 - alpha) + b * alpha);
  return `#${[m(r1, r2), m(g1, g2), m(b1, b2)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
// An rgba() state layer of `hex` at `alpha`, for overlays where transparency is wanted.
export function stateLayer(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Legacy aliases -> MD3 roles. Names unchanged; values are now MD3.
// ---------------------------------------------------------------------------
export const SHELL_BG = M3.surfaceContainerLowest;   // #ffffff, crisp chrome / cards / fields
export const SHELL_ALT = M3.surface;                 // page canvas
export const SHELL_ON = M3.onSurface;                // text primary
export const SHELL_DIM = M3.onSurfaceVariant;        // text secondary
export const SHELL_MUTED = "#5b5e6d";                // helper: a tone between onSurfaceVariant and outline, AA on white
export const SHELL_HAIRLINE = M3.outlineVariant;     // subtle border / divider
export const BORDER_STRONG = M3.outline;             // strong border / field outline
export const NAVY = SHELL_BG;
export const NAVY_DEEP = SHELL_ALT;

// The interactive color: MD3 primary. ACCENT_DARK / _TEXT resolve to the darker
// on-primary-container blue used for pressed states and for text on a blue tint.
export const ACCENT = M3.primary;
export const ACCENT_DARK = M3.onPrimaryContainer;
export const ACCENT_TEXT = M3.onPrimaryContainer;
export const TEAL = ACCENT;
export const TEAL_DARK = ACCENT_DARK;
export const FOCUS = M3.primary;

// Status colors. Error aligns to the MD3 error role; good / warning are semantic
// status hues MD3 does not define, kept as-is (they read as fills and icons).
export const STATUS = {
  good: "#24A148",
  warning: "#FF832B",
  error: M3.error,
};

// Type roles (legacy 5-role set) mapped onto the MD3 scale.
export const TYPE = {
  title: { fontSize: 16, fontWeight: 500, lineHeight: 1.5, letterSpacing: 0.15 },   // titleMedium
  body: { fontSize: 14, fontWeight: 400, lineHeight: 1.43, letterSpacing: 0.25 },   // bodyMedium
  label: { fontSize: 14, fontWeight: 500, lineHeight: 1.43, letterSpacing: 0.1 },   // labelLarge
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.33, letterSpacing: 0.4 }, // bodySmall
  micro: { fontSize: 12, fontWeight: 500, lineHeight: 1.33, letterSpacing: 0.5 },   // labelMedium (12px floor)
} as const;

// MD3 working weights: Regular (400) and Medium (500). Headings are Medium.
export const WEIGHT = { body: 400, emphasis: 500, heading: 500 } as const;

export const SPACE = 8;
export const CARD_PADDING = 16;

// MUI variant style from an MD3 type role.
type M3Role = { fontSize: number; lineHeight: number; fontWeight: number; letterSpacing: number };
const v = (r: M3Role) => ({
  fontSize: `${r.fontSize}px`,
  lineHeight: r.lineHeight,
  fontWeight: r.fontWeight,
  letterSpacing: `${r.letterSpacing}px`,
});

// MUI's 25-slot shadow ramp, filled from MD3's 5 elevation levels.
const E = ELEVATION;
const shadows = [
  "none",
  E[1], E[1], E[2], E[2], E[2],
  E[3], E[3], E[3], E[4], E[4],
  E[4], E[4], E[5], E[5], E[5],
  E[5], E[5], E[5], E[5], E[5],
  E[5], E[5], E[5], E[5],
] as unknown as ReturnType<typeof createTheme>["shadows"];

export const muiTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: M3.primary, dark: M3.onPrimaryContainer, light: M3.primaryContainer, contrastText: M3.onPrimary },
    secondary: { main: M3.secondary, light: M3.secondaryContainer, dark: M3.onSecondaryContainer, contrastText: M3.onSecondary },
    error: { main: M3.error, light: M3.errorContainer, contrastText: M3.onError },
    warning: { main: STATUS.warning },
    success: { main: STATUS.good },
    info: { main: M3.primary },
    background: { default: M3.surface, paper: M3.surfaceContainerLowest },
    text: { primary: M3.onSurface, secondary: M3.onSurfaceVariant },
    divider: M3.outlineVariant,
    action: {
      active: M3.onSurfaceVariant,
      hover: stateLayer(M3.onSurface, STATE.hover),
      hoverOpacity: STATE.hover,
      selected: stateLayer(M3.primary, STATE.pressed),
      selectedOpacity: STATE.pressed,
      focus: stateLayer(M3.onSurface, STATE.focus),
      focusOpacity: STATE.focus,
    },
  },
  // MD3 base shape is medium (12); components override to their own shape token.
  shape: { borderRadius: SHAPE.medium },
  typography: {
    fontFamily: FONT_SANS,
    fontSize: 14,
    h4: v(M3_TYPE.headlineSmall),
    h5: v(M3_TYPE.titleLarge),
    h6: v(M3_TYPE.titleLarge),
    subtitle1: v(M3_TYPE.titleMedium),
    subtitle2: v(M3_TYPE.titleSmall),
    body1: v(M3_TYPE.bodyLarge),
    body2: v(M3_TYPE.bodyMedium),
    button: { ...v(M3_TYPE.labelLarge), textTransform: "none" },
    caption: v(M3_TYPE.bodySmall),
    overline: { ...v(M3_TYPE.labelSmall), textTransform: "none" },
  },
  shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: FONT_SANS,
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    // MD3 buttons: pill shape, medium-weight sentence-case label, state layers.
    // Filled (contained) hover lightens with an on-primary state layer and rises
    // to elevation level 1, per MD3.
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: SHAPE.full,
          textTransform: "none",
          fontWeight: 500,
          letterSpacing: "0.1px",
          paddingLeft: 24,
          paddingRight: 24,
        },
        sizeSmall: { paddingLeft: 16, paddingRight: 16 },
        containedPrimary: {
          "&:hover": { backgroundColor: blend(M3.primary, M3.onPrimary, STATE.hover), boxShadow: E[1] },
        },
        outlined: { borderColor: M3.outline },
      },
    },
    // MD3 chip: small (8px) corner, not a pill; medium-weight label.
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: SHAPE.small, fontWeight: 500 },
      },
    },
    // MD3 switch: 52x32 track, thumb grows 16 -> 24 when on, off track carries a
    // 2px outline, on track is primary.
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 52,
          height: 32,
          padding: 0,
          "&.MuiSwitch-sizeSmall": { width: 52, height: 32, padding: 0 },
          "& .MuiSwitch-switchBase": {
            padding: 0,
            margin: 8,
            transitionDuration: `${DURATION.short4}ms`,
            "&.Mui-checked": {
              transform: "translateX(20px)",
              margin: 4,
              color: M3.onPrimary,
              "& .MuiSwitch-thumb": { width: 24, height: 24 },
              "& + .MuiSwitch-track": { backgroundColor: M3.primary, opacity: 1, border: 0 },
            },
            "&.Mui-disabled + .MuiSwitch-track": { opacity: 0.4 },
          },
          "& .MuiSwitch-thumb": {
            width: 16,
            height: 16,
            borderRadius: SHAPE.full,
            backgroundColor: M3.outline,
            boxShadow: "none",
            transition: `width ${DURATION.short3}ms ${EASING.standard}, height ${DURATION.short3}ms ${EASING.standard}`,
          },
          "& .Mui-checked .MuiSwitch-thumb": { backgroundColor: M3.onPrimary },
          "& .MuiSwitch-track": {
            borderRadius: SHAPE.full,
            backgroundColor: M3.surfaceContainerHighest,
            border: `2px solid ${M3.outline}`,
            opacity: 1,
            boxSizing: "border-box",
          },
        },
      },
    },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: SHAPE.medium } } },
    // MD3 plain tooltip: inverse surface, small radius.
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: 12,
          fontWeight: 400,
          backgroundColor: M3.inverseSurface,
          color: M3.inverseOnSurface,
          padding: "4px 8px",
          borderRadius: SHAPE.extraSmall,
          letterSpacing: "0.4px",
        },
      },
    },
    // MD3 outlined text field: 4px corners, outline border, primary 2px on focus.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: SHAPE.extraSmall,
          backgroundColor: "transparent",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: M3.outline },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: M3.onSurface },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: M3.primary, borderWidth: 2 },
        },
      },
    },
    // MD3 menus use a small (4px) corner; dialogs an extra-large (28px) corner.
    MuiMenu: { styleOverrides: { paper: { borderRadius: SHAPE.extraSmall } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: SHAPE.extraLarge } } },
  },
});
