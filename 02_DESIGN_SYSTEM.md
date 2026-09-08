# Design System: Florida School Facilities Explorer

The visual goal is a clean, minimal, information-dense tool. The map is the product. Everything else floats over it in small purposeful panels. No visual chrome for its own sake. No decoration. No stock photography. No hero copy.

Reference aesthetic: floating pill nav on the left, a centered search bar with a keyboard-shortcut hint, and floating info cards over a full-bleed map. Similar to a well-crafted geospatial dashboard, without the trading-app noise.

## Principles

1. **The map is the interface.** UI panels are small, floating, and pushable to the side. Never a chrome-heavy toolbar that steals map real estate.
2. **Every label states what it means.** Not "Data" but "Median household income (ACS 2019-2023)". Not "Layer 1" but "FEMA flood zones". If a label needs a legend to be understood, the label is wrong.
3. **Density with restraint.** Analysts read a lot of numbers. Give them small text, tight spacing, and clear hierarchy. But not so dense that a single value has to be hunted for.
4. **Motion is purposeful.** Panels slide in when opened, fade when dismissed. No hover animations on data. No skeuomorphic effects. No parallax.
5. **Empty states are explicit.** Every "no value" says why. Never a blank cell.

## Layout

**Full-bleed map.** The map fills the viewport. All UI floats over it.

**Top bar.** A single thin bar across the top:
- Left: product wordmark ("FL Schools Explorer") and primary nav pills (Map, Compare, Exports).
- Center: search bar with keyboard shortcut hint (⌘K or /). Search accepts: school name, MSID, address, county, board district number.
- Right: county selector (Miami-Dade / Broward / Orange / All), attribution menu, help.

**Right side: layer panel.** Floating card, ~320px wide, snapped to the right edge with a small gap. Collapsible groups (Schools, Demand, Risk, Boundaries, Context). Each layer row has: toggle, label, small legend swatch, vintage caption. Panel is collapsible to an icon strip so the analyst can hide it when zooming into detail.

**Bottom left: scale bar and coordinate readout.** Small, always visible. Scale bar shows both miles and meters. Coordinate readout follows the mouse cursor with 5 decimal places (about 1 meter precision).

**Bottom right: measurement tool controls.** Appear only when a tool is active. Otherwise hidden.

**Floating inspector.** When a school is clicked, the inspector opens as a floating card on the right, pushing the layer panel underneath (layer panel can be brought back with a tab). Inspector card is ~400px wide, scrollable, dismissible with X or Escape.

**Compare drawer.** When compare mode is active, a horizontal drawer opens at the bottom of the screen with 2-4 columns side by side, taking about 40% of the viewport height. The map stays visible above.

## Color

**Map surface** stays the Google hybrid/satellite imagery. No filter, no darken.

**UI surface** is off-white (`#FAFAF9` background, `#FFFFFF` cards). Borders are a single hairline (`#E5E5E4`). Text is near-black (`#111111` primary, `#525252` secondary, `#A3A3A3` tertiary). This palette reads as neutral over both dark (satellite) and light (map) surfaces.

**Grade colors** (fills for school pins, matching legend chips):
- A: `#059669` (green 600)
- B: `#2563EB` (blue 600)
- C: `#D97706` (amber 600)
- D: `#EA580C` (orange 600)
- F: `#DC2626` (red 600)
- I (Incomplete): `#737373` (gray 500)
- NR (Not Rated): white fill, `#737373` outline
- NG (No Grade): white fill, `#737373` dashed outline

All grade pins carry the grade letter inside them at all zoom levels, in white text sized to remain legible at 24px pin size. This is the accessibility guarantee: the encoding survives colorblindness and grayscale printing.

**Overlay colors** are semantic and muted, chosen to layer without clashing:
- Household income choropleth: sequential green scale (`#F0FDF4` to `#14532D`)
- Flood zones: red-family with pattern (`#FEE2E2` fill, `#B91C1C` hatched border for AE/VE, `#FDBA74` fill for X)
- Board districts: transparent fill, `#6366F1` (indigo) outlines with district number labels
- Legislative districts: transparent fill, `#8B5CF6` (violet) outlines
- Opportunity zones: `#FEF3C7` (amber 100) fill with `#B45309` outline
- Drive-time reach: transparent teal fill, `#0D9488` outline

Layers combine additively. Fill opacity is 30% by default; outlines are always full opacity.

## Typography

**Font.** System sans stack for zero-weight cost and platform-native feel:
`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

Optional upgrade: Inter or Geist Sans if the team wants brand-specific type.

**Scale.**
- 20/28 Semibold: page title (only in exports)
- 15/22 Semibold: card title (inspector header)
- 13/20 Medium: section label (Identity, Performance, Context)
- 13/20 Regular: body text and values
- 12/16 Medium: layer panel labels, chip text
- 11/16 Regular: caption, vintage, source, hover text
- 11/16 Mono: coordinates, MSID, GEOID (use `ui-monospace, SFMono-Regular, Menlo, monospace`)

**Numerals.** Tabular-nums on every numeric column so figures align vertically.

## Iconography

Uniform stroke line icons (Lucide or Phosphor, 1.5px stroke, 20px default). Never colored icons. Never emojis in the UI.

Layer group icons:
- Schools: graduation cap
- Demand: bar chart
- Risk: alert triangle
- Boundaries: shapes
- Context: layers

Tool icons: ruler (measure), circle (radius), stack (compare), download (export), settings (preferences), question mark (help).

## Component patterns

**Layer toggle row.** Checkbox on the left, label, right-aligned small color swatch, vintage on hover (tooltip). Whole row is clickable, not just the checkbox. Keyboard: space toggles, enter opens layer detail.

**Chip.** Small pill for values that can be filtered (e.g. grade filter chips at the top of the panel). Selected state is filled with the grade color. Unselected is neutral with border.

**Grade pill (in the timeline).** 24x24 rounded square with the grade letter, colored by grade. Year label below in 11px. Formula-change years marked with a thin vertical divider between pills.

**Inspector row.** Label (13px medium) on the left, value (13px regular) on the right, source/vintage (11px caption) below the value. Copy button (16px, hover-visible) at the right edge.

**Floating card.** White fill, `#E5E5E4` border, 12px radius, soft shadow (`0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)`). Cards have a header row with title, optional badge, and dismiss X.

**Empty state.** Small icon (24px), one-line description of why it's empty, optional action button. Never blank space. Never "0" as a placeholder.

## Motion

- Panel open/close: 180ms ease-out slide.
- Inspector open: 220ms ease-out slide from right + fade.
- Layer toggle: instant. No animation on data.
- Radius drag: real-time, no easing.
- Loading: hairline progress bar at the top of the panel being loaded. Never a full-screen spinner.

## Accessibility

- All toggles, chips, and controls are keyboard-navigable in a sensible tab order.
- Focus rings are visible (2px offset ring in `#2563EB`).
- All icons have `aria-label`s.
- School pins have `alt` text on the map with school name and grade. Keyboard users can tab through visible pins and press Enter to open the inspector.
- Grade encoding is color + letter, always. Never color alone.
- Colorblind safety: the letter-inside-pin pattern makes grade readable without color. The choropleth uses a colorblind-safe sequential palette. Semantic outline colors (indigo/violet/teal) are distinct in luminance.
- Contrast ratios: all text on white meets WCAG AA (4.5:1 body, 3:1 large).

## What to avoid

- Skeuomorphic map controls (glossy buttons, drop shadows on markers).
- Marketing language anywhere in the UI ("Discover", "Explore", "Powerful").
- Auto-playing tutorials or product tours.
- Notifications, badges, or "new!" indicators.
- Any UI element that celebrates a data point (green up-arrows, "great!" microcopy).
- Iconography that requires a legend to interpret.
- Modals that block the map. Prefer floating panels.

## Attribution strip

A small dismissible strip at the bottom right of the map, always accessible via a "?" icon:
- "© Google, Google Maps"
- "© OpenStreetMap contributors, ODbL" (only when OSM-derived data is showing)
- "U.S. Census Bureau" (when Census data is showing)
- "FEMA National Flood Hazard Layer" (when flood is showing)
- "Florida Department of Education" (always, for school data)

Attributions are not optional and must be present whenever the corresponding data is on screen.
