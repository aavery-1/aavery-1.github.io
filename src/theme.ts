// Design tokens: the IBM Carbon Design System, Gray 10 theme. The single source
// of visual truth. Color, type, spacing, geometry, and elevation all follow
// Carbon. See https://carbondesignsystem.com. No em dashes anywhere in this file,
// per the prose style rule.

// Values are Carbon color tokens (Gray 10 theme). The map's DATA encodings
// (grade A-F scale, utilization teal/amber/red, layer ramps) keep their meaning
// and are re-expressed in Carbon's data-visualization palette rather than the UI
// gray/blue tokens, since they carry information, not chrome.
export const theme = {
  color: {
    bg: "#f4f4f4",          // Gray 10, page background
    card: "#ffffff",        // White, layer-01 (containers, fields)
    hairline: "#e0e0e0",    // Gray 20, border-subtle
    textPrimary: "#161616", // Gray 100, text-primary
    textSecondary: "#525252", // Gray 70, text-secondary
    textTertiary: "#6f6f6f", // Gray 60, text-helper
    focus: "#001e62",        // KIPP navy (brand indigo), interactive / focus
    // Map overlay encodings, in Carbon's categorical/sequential data-viz palette.
    incomeRamp: ["#edf5ff", "#a6c8ff", "#4589ff", "#0f62fe", "#002d9c"], // Carbon Blue sequential
    boardOutline: "#8a3ffc",       // Carbon Purple 60
    legislativeOutline: "#6929c4", // Carbon Purple 70
    opportunityFill: "#fddc69",    // Carbon Yellow 20 tint
    opportunityOutline: "#d2a106", // Carbon Yellow 50
    driveTimeOutline: "#009d9a",   // Carbon Teal 50
  },
  font: {
    sans: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  // Carbon geometry is square: containers, buttons, and fields have no radius.
  // Only Tags (chips) round to a pill, matching Carbon's Tag component.
  radius: { card: 0, chip: 999, control: 0 },
  shadow: {
    // Carbon elevation is flat: containers rely on borders, and only floating
    // overlays (menus, popovers, the results sheet) carry a shadow.
    card: "0 2px 6px rgba(0,0,0,0.2)",
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
