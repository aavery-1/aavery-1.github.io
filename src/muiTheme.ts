// MUI theme implementing the IBM Carbon Design System (Gray 10 theme). Carbon is
// now the single design language: IBM Plex type, Carbon color tokens, the square
// Carbon geometry (no border radius except Tags), flat elevation with shadows
// reserved for floating overlays, and Carbon's Blue 60 as the one interactive
// color. See https://carbondesignsystem.com.
//
// The exported constant NAMES are unchanged so every call site keeps compiling;
// their VALUES are Carbon tokens. TEAL / ACCENT etc. now resolve to Carbon Blue.

import { createTheme } from "@mui/material/styles";

// Chrome (AppBar, left rail): white surface over the Gray 10 canvas. Named
// NAVY / NAVY_DEEP only for compatibility with existing imports.
export const NAVY = "#FFFFFF";
export const NAVY_DEEP = "#F4F4F4";
export const SHELL_BG = "#FFFFFF";       // White, layer-01 (chrome, cards, fields)
export const SHELL_ALT = "#F4F4F4";      // Gray 10, page canvas
export const SHELL_ON = "#161616";       // Gray 100, text-primary
export const SHELL_DIM = "#525252";      // Gray 70, text-secondary
export const SHELL_MUTED = "#6F6F6F";    // Gray 60, text-helper
export const SHELL_HAIRLINE = "#E0E0E0"; // Gray 20, border-subtle
export const BORDER_STRONG = "#8D8D8D";  // Gray 50, border-strong (field underlines)

// The one interactive color: Carbon Blue 60, with Blue 70 for hover/active and
// as text on a light blue tint. TEAL / TEAL_DARK are retained as aliases so the
// components that import them do not change; they now resolve to Carbon Blue.
export const ACCENT = "#0F62FE";      // Blue 60, interactive
export const ACCENT_DARK = "#0043CE"; // Blue 70, hover / active
export const ACCENT_TEXT = "#0043CE"; // Blue 70, text on a blue tint
export const TEAL = ACCENT;
export const TEAL_DARK = ACCENT_DARK;

// Carbon status (support) colors: Green 50, Orange 40 (caution), Red 60.
export const STATUS = {
  good: "#24A148",
  warning: "#FF832B",
  error: "#DA1E28",
};

// ---------------------------------------------------------------------------
// Design tokens. One system (Carbon), referenced instead of ad-hoc values.
// ---------------------------------------------------------------------------
// TYPE: the canonical type scale, mapped to Carbon's productive type set. Five
// roles, no more. Headings are IBM Plex Semibold (600), body is Regular (400),
// following Carbon (not Material's 700 headings).
export const TYPE = {
  title: { fontSize: 16, fontWeight: 600, lineHeight: 1.375 },  // Carbon heading-compact-02
  body: { fontSize: 14, fontWeight: 400, lineHeight: 1.43 },    // Carbon body-01
  label: { fontSize: 13, fontWeight: 600, lineHeight: 1.29 },   // Carbon heading-compact-01
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.34 }, // Carbon label-01
  micro: { fontSize: 12, fontWeight: 400, lineHeight: 1.34 },   // dense labels, at Carbon's 12px floor
} as const;

// Font weights, by intent. Carbon uses Regular (400) and Semibold (600) as its
// two working weights; headings are Semibold, not Bold.
export const WEIGHT = { body: 400, emphasis: 600, heading: 600 } as const;

// Spacing base. Carbon's mini-unit is 8px (theme.spacing(1) === 8px), and the
// spacing scale (2/4/8/12/16/24/32...) is built from it.
export const SPACE = 8;
export const CARD_PADDING = 16;

// Focus: Carbon Blue 60, so focus rings and the interactive accent read as one.
export const FOCUS = ACCENT;

// Elevation. Carbon is flat: containers use borders, and only floating overlays
// (menus, popovers, tooltips, the results sheet) carry a shadow. One overlay
// shadow, scaled by how far the surface floats.
const SHADOW = {
  1: "0 1px 3px rgba(0,0,0,0.12)",
  2: "0 2px 6px rgba(0,0,0,0.16)",
  3: "0 2px 6px rgba(0,0,0,0.20)",
  4: "0 4px 12px rgba(0,0,0,0.22)",
  6: "0 6px 16px rgba(0,0,0,0.26)",
};

const FONT_SANS =
  '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const muiTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: ACCENT, dark: ACCENT_DARK, contrastText: "#FFFFFF" },
    secondary: { main: SHELL_ALT, contrastText: SHELL_ON },
    info: { main: FOCUS },
    background: { default: SHELL_ALT, paper: SHELL_BG },
    text: { primary: SHELL_ON, secondary: SHELL_DIM },
    warning: { main: STATUS.warning },
    error: { main: STATUS.error },
    success: { main: STATUS.good },
    divider: SHELL_HAIRLINE,
  },
  // Carbon geometry is square. Tags/chips round to a pill via their own override.
  shape: { borderRadius: 0 },
  typography: {
    fontFamily: FONT_SANS,
    fontSize: 14,
    // Carbon headings are IBM Plex Semibold (600). Carbon uses near-zero tracking.
    h6: { fontWeight: 600, letterSpacing: 0 },
    subtitle1: { fontWeight: 600, letterSpacing: 0 },
    subtitle2: { fontWeight: 600, letterSpacing: 0 },
    body1: { letterSpacing: 0.16 },
    body2: { letterSpacing: 0.16 },
    button: { textTransform: "none", fontWeight: 400, letterSpacing: 0.16 },
    caption: { letterSpacing: 0.32 },
    overline: { letterSpacing: 0.32, fontWeight: 600, textTransform: "uppercase" },
  },
  shadows: [
    "none",
    SHADOW[1], SHADOW[1], SHADOW[2], SHADOW[2], SHADOW[2],
    SHADOW[3], SHADOW[3], SHADOW[3], SHADOW[4], SHADOW[4],
    SHADOW[4], SHADOW[4], SHADOW[4], SHADOW[4], SHADOW[4],
    SHADOW[4], SHADOW[6], SHADOW[6], SHADOW[6], SHADOW[6],
    SHADOW[6], SHADOW[6], SHADOW[6], SHADOW[6],
  ] as unknown as ReturnType<typeof createTheme>["shadows"],
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
    // Carbon buttons: square, regular-weight label, Blue 60 primary with a Blue
    // 70 hover. No elevation.
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 0, fontWeight: 400, letterSpacing: 0.16 },
        containedPrimary: { "&:hover": { backgroundColor: ACCENT_DARK } },
      },
    },
    // Carbon Tag: a pill, kept rounded while everything else is square.
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 999 },
      },
    },
    // Carbon toggle color: Blue 60 when on. Shape kept compact.
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 36,
          height: 20,
          padding: 0,
          display: "flex",
          "&.MuiSwitch-sizeSmall": { width: 36, height: 20, padding: 0 },
          "& .MuiSwitch-switchBase": {
            padding: 2,
            color: "#FFFFFF",
            "&.Mui-checked": {
              transform: "translateX(16px)",
              color: "#FFFFFF",
              "& + .MuiSwitch-track": { opacity: 1, backgroundColor: ACCENT },
            },
            "&.Mui-disabled + .MuiSwitch-track": { opacity: 0.4 },
          },
          "& .MuiSwitch-thumb": {
            width: 16,
            height: 16,
            borderRadius: 999,
            boxShadow: "none",
          },
          "& .MuiSwitch-track": {
            borderRadius: 999,
            opacity: 1,
            backgroundColor: BORDER_STRONG,
          },
        },
      },
    },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 0 } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: 12,
          fontWeight: 400,
          backgroundColor: SHELL_ON,
          padding: "6px 10px",
          borderRadius: 0,
          letterSpacing: 0.32,
        },
      },
    },
    // Carbon fields: white fill, a single bottom border that thickens to Blue 60
    // on focus (the Carbon underline field), square corners.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          backgroundColor: SHELL_BG,
          "& .MuiOutlinedInput-notchedOutline": {
            border: "none",
            borderBottom: `1px solid ${BORDER_STRONG}`,
            borderRadius: 0,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderBottom: `1px solid ${SHELL_ON}`,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderBottom: `2px solid ${ACCENT}`,
          },
        },
      },
    },
  },
});
