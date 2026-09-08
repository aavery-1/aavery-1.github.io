# Design and engineering conventions

This is the single reference for how the Schools of Hope ("Hope Siting") tool
looks, reads, and is built. The tool follows the **IBM Carbon Design System**
(<https://carbondesignsystem.com>), Gray 10 theme. New and edited code follows
it. When a rule here and a component disagree, the component is wrong.

## 1. Design tokens (Carbon, one system)

All tokens live in [`src/muiTheme.ts`](src/muiTheme.ts) (MUI theme + exported
constants) and [`src/theme.ts`](src/theme.ts) (CSS custom properties). Reference
them; do not introduce ad-hoc `fontSize`, `color`, or pixel values in components.

### Type (IBM Plex)

Typeface is **IBM Plex Sans** (UI) and **IBM Plex Mono** (numbers, MSIDs, code),
loaded in [`index.html`](index.html). Carbon uses two working weights: Regular
(400) and Semibold (600); headings are Semibold, never Bold. Base size 14.

| Token | Size | Weight | Carbon role | Use |
|---|---|---|---|---|
| `TYPE.title` | 16 | 600 | heading-compact-02 | Panel and card titles |
| `TYPE.body` | 14 | 400 | body-01 | Default reading size |
| `TYPE.label` | 13 | 600 | heading-compact-01 | Control and field labels |
| `TYPE.caption` | 12 | 400 | label-01 | Secondary detail |
| `TYPE.micro` | 12 | 400 | label-01 | Dense map and legend labels |

12px is the type floor (Carbon's smallest). Italics only for a genuine secondary
aside, never for emphasis.

### Spacing

Carbon's mini-unit is 8px = `theme.spacing(1)`; the scale is 2/4/8/12/16/24/32...
Card inset is `CARD_PADDING` (16px, `p: 2`). Favor generous spacing: Carbon UI
breathes. Tight, dense clusters read as garbled here, so give panels room.

### Geometry

Carbon is **square**: `theme.shape.borderRadius` is `0`, so every numeric `sx`
`borderRadius` resolves to 0. Containers, buttons, fields, popovers, and the
results sheet all have sharp corners. The only rounded shapes are Tags/chips
(pills, matching Carbon's Tag) and true circles (avatars, status dots, donuts).

### Color roles (Carbon Gray 10)

Semantic, not raw hex, at call sites.

- Background: `SHELL_ALT` (Gray 10, `#f4f4f4`) canvas; `SHELL_BG` (White) for
  chrome, containers, and fields (Carbon layer-01).
- Text: `SHELL_ON` (Gray 100, `text.primary`), `SHELL_DIM` (Gray 70,
  `text.secondary`), `SHELL_MUTED` (Gray 60, helper).
- Border: `SHELL_HAIRLINE` (Gray 20, `divider`); `BORDER_STRONG` (Gray 50) for
  field underlines.
- Interactive: `ACCENT` / `TEAL` (Carbon Blue 60, `#0f62fe`); `ACCENT_DARK`
  (Blue 70) for hover/active and text on a blue tint (`ACCENT_TEXT`).
- Status: `STATUS.good` (Green 50), `STATUS.warning` (Orange 40), `STATUS.error`
  (Red 60).

**Data encodings keep their meaning and are never tokenized away:** the grade
A-F scale in [`gradeEncoding.ts`](src/map/gradeEncoding.ts) and `UTIL_COLORS`
(teal underused <=75%, amber in use, red fully used >=90%) in
[`store.ts`](src/store.ts). These carry information, not chrome; reuse
`UTIL_COLORS` everywhere utilization appears and never add a parallel palette.

### Elevation

Carbon is flat: containers rely on their 1px border, not shadow. Shadow is
reserved for floating overlays (menus, popovers, tooltips, the results sheet),
via `sx={{ boxShadow: N }}` or `var(--shadow-card)`.

### Iconography

One icon set: **Carbon icons** (`@carbon/icons-react`), re-exported from
[`src/ui/icons.tsx`](src/ui/icons.tsx). Icons take a `size` prop and inherit
`currentColor`. No MUI icons, no lucide, no emoji or Unicode glyphs as icons.

## 2. UI copy (Carbon content, sentence case)

Reference: <https://carbondesignsystem.com/guidelines/content/overview/>

- Sentence case for labels, buttons, headings, and menu items. Never Title Case,
  and never all-caps (Carbon does not use uppercase eyebrows; use size, weight,
  and color for emphasis instead of `textTransform: uppercase`).
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
