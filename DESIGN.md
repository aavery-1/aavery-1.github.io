# Design and engineering conventions

This is the single reference for how the Schools of Hope ("Hope Siting") tool
looks, reads, and is built. The tool follows **Material Design 3**
(<https://m3.material.io>). New and edited code follows it. When a rule here and
a component disagree, the component is wrong.

## 1. Design tokens (Material Design 3, one system)

The MD3 tokens are the single source of visual truth. Raw tokens live in
[`src/md3/tokens.ts`](src/md3/tokens.ts); [`src/muiTheme.ts`](src/muiTheme.ts)
wires them into MUI (and keeps legacy constant names as aliases onto MD3 roles),
and [`src/theme.ts`](src/theme.ts) exposes the CSS custom properties. Reference
tokens; do not introduce ad-hoc `fontSize`, `color`, or pixel values in
components. New code should import MD3 roles (`md3`, `RADIUS`, `SHAPE`,
`ELEVATION`, `M3_TYPE`) from `md3/tokens` or `muiTheme`.

### Color (MD3 roles, HCT tonal palette)

The scheme is generated from the brand-blue seed (`#0F62FE`) by Google's
official material-color-utilities engine (`SchemeVibrant`), so it is a
spec-correct HCT tonal palette, not hand-picked hexes. Regenerate with
[`scripts/gen-md3-theme.mjs`](scripts/gen-md3-theme.mjs). Use MD3 role names, not
raw hex, at call sites. Key roles:

- Surfaces: `surface` canvas; `surfaceContainerLowest` (white) for chrome, cards,
  and fields; the `surfaceContainer*` tones step up with elevation.
- Text: `onSurface` (primary), `onSurfaceVariant` (secondary); a helper tone sits
  between `onSurfaceVariant` and `outline`.
- Border: `outlineVariant` (subtle / divider), `outline` (strong / field border).
- Interactive: `primary` (`#0052dd`); `onPrimaryContainer` (`#003da9`) for
  pressed states and text on a blue tint. `onPrimary` is text on a filled primary.
- Status: `error` is the MD3 error role; `good` / `warning` are semantic status
  hues MD3 does not define.

Every MD3 text/interactive role passes WCAG AA on its surface (checked; the HCT
engine calibrates for contrast). The legacy aliases (`SHELL_*`, `ACCENT`, `TEAL`)
still resolve, now onto MD3 roles.

**Data encodings keep their meaning and are never tokenized away:** the grade
A-F scale in [`gradeEncoding.ts`](src/map/gradeEncoding.ts) and `UTIL_COLORS`
(teal underused <=75%, amber in use, red fully used >=90%) in
[`store.ts`](src/store.ts). These carry information, not chrome; reuse
`UTIL_COLORS` everywhere utilization appears and never add a parallel palette.

### Type (Roboto, MD3 type scale)

Typeface is **Roboto** (UI) and **Roboto Mono** (numbers, MSIDs, code), loaded in
[`index.html`](index.html). MD3's working weights are Regular (400) and Medium
(500); titles and labels are Medium, headlines Regular, never Bold. The full MD3
scale (display / headline / title / body / label) is `M3_TYPE`; the five-role
`TYPE` set maps onto it (title -> titleMedium, body -> bodyMedium, label ->
labelLarge, caption -> bodySmall, micro -> labelMedium). 11px is the label floor.

### Shape

MD3 uses a seven-step corner scale (`SHAPE`: none 0, extra-small 4, small 8,
medium 12, large 16, extra-large 28, full). `theme.shape.borderRadius` is medium
(12), so components round by default. At `sx` call sites a bare number is a
theme-unit MULTIPLIER (`borderRadius: 8` renders 96px), so reach for the
px-string tokens instead: `borderRadius: RADIUS.sm`. The language:

- tiny shape-encoding swatches (legend / type dots): `RADIUS.tile` (3), to keep
  square-vs-circle marker semantics crisp
- grade letter tiles, chips: `RADIUS.sm` (8)
- cards, popovers, thumbnails, map icon buttons: `RADIUS.md` (12)
- floating tool bars, map control clusters: `RADIUS.lg` (16)
- search field, view switcher, active-filter bar: `RADIUS.full` (pill)
- dialogs: extra-large (28); true circles (avatars, status dots, donuts): `50%`

### Spacing

8px grid = `theme.spacing(1)`; the scale is 2/4/8/12/16/24/32... Card inset is
`CARD_PADDING` (16px, `p: 2`). Favor generous spacing; give panels room.

### Elevation

MD3 conveys elevation first through the surface-container tones (a higher
container reads as more elevated), with shadow reserved for surfaces that float
above content (menus, popovers, tooltips, the results sheet). `ELEVATION` holds
MD3's level 1-5 shadow tokens; MUI's shadow ramp is filled from them.

### Motion and state layers

`EASING` and `DURATION` are the MD3 motion tokens; `STATE` holds the state-layer
opacities (hover 8 / focus 10 / pressed 10 / dragged 16). Interactive components
show a state layer (the "on" role over the component) on hover/focus/press.

### Iconography

One icon set: **Material Symbols** (MD3's icon family), via `@mui/icons-material`
Rounded variants, re-exported from [`src/ui/icons.tsx`](src/ui/icons.tsx). Icons
take a `size` (px) prop and inherit `currentColor`. No Carbon icons, no lucide,
no emoji or Unicode glyphs as icons.

## 2. UI copy (sentence case)

Reference: <https://m3.material.io/foundations/content-design/style-guide>

- Sentence case for labels, buttons, headings, and menu items. Never Title Case,
  and never all-caps (MD3 does not uppercase; use size, weight, and color for
  emphasis instead of `textTransform: uppercase`).
- Second person, present tense, no filler. No trailing colons on toggles.
- Buttons and actions start with a verb ("Export", "Compare", "Open in the list").
- For each string, ask "what does the user need to know here?" and write the
  minimum that answers it. Let the map, legend, and numbers speak; do not
  restate what a control already shows.
- Spelling, grammar, capitalization: correct, always.

**Domain terms, used precisely:** grade span, Title I, attendance zone (education);
parcel, isochrone, choropleth (geo/mapping); persistently low-performing (PLP),
Facility Utilization Rate (FUR), COFTE, **co-location candidate** (statute). Never
loosen "candidate" to "eligible": the 4-year building-age exclusion of Rule
6A-1.0998271(5)(f) is not modeled, so "eligible" would overstate the law.

## 3. Motion and states (Material Design 3)

Reference: <https://m3.material.io>

- Standard MUI transitions and durations. Respect `prefers-reduced-motion`
  (guard keyframe animations, as the inspector and dock do).
- Every interactive element has hover, focus-visible, active, and disabled
  states. Focus rings use the accent color.
- Scroll containers scroll smoothly and cap their height rather than pushing the
  layout.

## 4. Control-type rubric (P1.0.1)

A control must match the shape of its data. Adopted from the faceted-filter
patterns below.

| Data shape | Control | Example here |
|---|---|---|
| Binary on/off, immediate | Switch | PLP-only, layer toggles |
| Multi-select, small visible set (2-7) | Chips | school type, level, Title I |
| Single-select, small mutually exclusive | Segmented / `ToggleButtonGroup` | district kind, view mode |
| Single-select, long list (8+) | Searchable Select with counts | specific district |
| Ordinal categorical, color-encoded | Color-coded toggle grid | letter grade A-F, matched to the map |
| Continuous numeric range | Range slider with meaningful marks | facility utilization, with statutory teal/amber/red bands |

## 5. Adopted UX rules (P1.0 research)

Concrete rules extracted from Google Maps, ArcGIS Online, Felt, Mapbox Studio,
Zillow, Redfin, Linear, Notion, and Material Design 3, and how this tool applies
them.

- **Filters before overlays; keep the two jobs distinct** (ArcGIS / Felt layer
  panels vs. Zillow / Redfin filter rails). The left panel is Geography ->
  School filters (both change *which schools appear*) -> Map layers (visual
  overlays only). The two are never interleaved.
- **State legibility over instruction** (Linear, Notion). Each filter group shows
  a name and an active-count badge and offers a per-group Clear; the panel header
  shows total shown + active-filter count and a global Reset. Redundant helper
  sentences are removed: the controls and counts carry the meaning.
- **One thematic areal fill at a time** (Mapbox Studio, ArcGIS thematic layers).
  The two graduated choropleths (median income, population growth) are mutually
  exclusive; a second whole-map fill only occludes the first. Categorical area
  overlays (opportunity zones, flood) and all point/line layers stay additive.
  See `EXCLUSIVE_CHOROPLETH_IDS` in [`mapLayers.ts`](src/config/mapLayers.ts).
- **Legend reflects only what is drawn** (Google Maps, Felt). The legend shows a
  row only for an active layer, wraps and caps its height, and never overlaps
  other controls. It lives behind a compact icon button that opens a popover
  (not a card standing open over the map), grouped with the base-map button into
  one top-right control cluster that mirrors the bottom-right zoom cluster, so
  the map's chrome reads as one consistent icon-button system.
- **Results live in a bottom sheet** (Redfin, Zillow, Google Maps). The "schools
  in view" surface (`OverviewDock`) is a bottom sheet with a grabber handle and a
  count-forward header ("N schools in view"): a peek by default, pulled up to
  reveal the scannable list plus the "Open in List" handoff. One responsive
  pattern: a centered capped-width sheet on desktop, a full-width sheet on phones
  that lifts the corner controls clear of the peek and sits above the Google
  attribution strip. It is a glance-and-jump bridge, never a spreadsheet (that is
  the List view): Map answers WHERE, List answers WHICH, Compare answers WHICH OF
  THESE FEW.
- **Controls never cover the interactive surface** (Google Maps). Map-tool
  instruction bars sit at a screen edge; tool buttons stay in a fixed corner.
- **Concurrent panels reflow, they do not stack fixed widths** (Zillow, Redfin,
  ArcGIS). The left rail overlays rather than pushes; on narrow widths one of
  the left panel / inspector becomes a drawer; nothing overlaps the Google
  attribution.
- **Compare is a first-class view, and it ranks nothing** (NN/g and Baymard
  comparison-table research). One of the three top-level views (Map / List /
  Compare), reached from a switcher with a live pin count. The canonical matrix:
  sites across the top, attributes down the left, a sticky identity header and a
  sticky row-label column so identity and the current row never scroll away;
  attributes grouped into decision-order sections (never alphabetical); a
  "Differences only" toggle that hides rows every site shares, with differing
  rows always marked (a neutral dot and a heavier value, never a score); inline
  add and per-column remove up to a small max (four); a guided empty state that
  teaches the feature and lets the analyst build the set. No aggregate score: the
  tool lays out the facts, the analyst forms the judgment. See
  [`CompareView.tsx`](src/views/CompareView.tsx) and the tested row model in
  [`compareModel.ts`](src/views/compareModel.ts).

## 6. Code style

- TypeScript follows the Google TypeScript Style Guide:
  <https://google.github.io/styleguide/tsguide.html>.
- UI text follows the Google developer documentation style guide (section 2).
- **No em dashes anywhere in `src/`** (a build test enforces it); use commas,
  colons, or periods. En dashes in numeric ranges are fine.
- One filter source of truth: every surface (map, list, split, dock, callouts)
  derives its school set from `useFilteredSchools` / `passesFilters`. Never
  re-implement filtering per view.

## 7. Definition of done

A change is not done until:

- `npx tsc --noEmit` is clean.
- `npx vitest run` is green (new logic and every legal invariant has a test).
- `npx vite build` succeeds.
- The dev server loads with no new console errors; the change is checked at
  1280 / 1024 / 768 / 375.
- If a convention, data vintage, or legal-logic rule changed, the relevant
  memory file and [`AttributionStrip.tsx`](src/topbar/AttributionStrip.tsx) are
  updated in the same change.
