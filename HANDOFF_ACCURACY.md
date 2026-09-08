# Handoff: Accuracy & Intuitiveness Pass (SOH Geomapping / "Hope Siting")

Goal of the next session: make every piece of data, every filter, and every slider
in the map tool accurate AND intuitive. Known pain points to fix: the map coloring
is confusing (color meanings collide), you cannot tell a district-run school from a
charter on the map, and some filter/slider semantics are unclear.

## 0. Orient first (do this before touching anything)
- Project root: `/Users/adenavery/Desktop/SOH Geomapping Tool`. Stack: React + TypeScript +
  Vite + deck.gl + Google Maps + MUI + Zustand. Dev server: `npm run dev` (usually port 5173).
- READ the persistent memory notes first (they carry the whole mental model):
  `~/.claude/projects/-Users-adenavery-Desktop-SOH-Geomapping-Tool/memory/` ->
  `MEMORY.md`, `soh-filter-architecture.md`, `soh-statute-facts.md`, `soh-tool-gotchas.md`.
- Also read this file and `PROJECT_NOTES.md`.
- HARD RULES:
  - No em dashes anywhere in `src/` (a prose test fails the build). Use "-" or "·".
  - After edits: `npx tsc --noEmit`, `npx vitest run`, `grep -rl "—" src` (must be empty), `npm run build`.
  - Editing `store.ts` / `MapView.tsx` while the dev server is live throws transient
    zustand-HMR errors ("reading 'size'" / "getSnapshot"). They are NOT real bugs; do a
    full page reload. The browser tool's console buffer is not cleared on navigate, so
    judge health from a fresh screenshot, not old console errors.

## 1. The rule that keeps data consistent (do not break it)
Every "which schools are shown / counted" decision flows through ONE predicate,
`passesFilters()` in `src/data/derive/filters.ts`, exposed via the `useFilteredSchools()`
hook in `src/data/derive/useFilteredSchools.ts`. The map, the school list, the bottom
callouts, and every count read from it. Fix filter/count logic THERE, once, and it
propagates everywhere. Never re-implement filtering in a component.

## 2. FIX: the coloring is confusing (two color languages collide)
Today the map uses blue and orange for TWO unrelated things:
- Grade pin fill (`src/map/gradeEncoding.ts`): A=green, B=blue(#1976D2), C=amber,
  D=deep-orange, F=red, plus NR/NG=white, I=grey.
- Utilization "halo" ring around each pin (`src/map/useDeckLayers.ts`, thresholds in
  `src/store.ts`): over-capacity ring = deep orange, under-utilized ring = blue(#1976D2).
So blue = grade B AND under-utilized; orange = grade C/D AND over-capacity. A blue pin
with a blue ring is ambiguous. THIS is the "coloring doesn't make sense."
Do this:
- Keep GRADE as the pin fill + the letter inside (that is the primary, colorblind-safe read).
- Move UTILIZATION to a channel that cannot be confused with grade color. Options:
  ring STYLE (e.g. solid vs dashed), a tiny corner glyph (▲ over / ▼ under), or a
  neutral monochrome halo. Pick one and apply it consistently.
- Add a real MAP LEGEND that explains EVERY color/marker on the map (grade colors,
  utilization, the gold "existing Schools of Hope" star, PLP red, choropleth ramps,
  district boundary line families). Right now only the income choropleth has a legend
  (`src/map/MapLegend.tsx`). Extend it (or add a legend panel) so nothing on the map is
  unexplained.
- Sanity-check the choropleth ramps: income = green sequential (`07_LAYERS.config.json`);
  population growth = red->grey->green diverging. Make sure both read correctly and are legended.

## 3. FIX: you cannot tell district vs charter on the map
A pin encodes only grade, so charters and district schools look identical on the map.
- Add a VISUAL CHANNEL for operator type on the map: e.g. pin SHAPE (district = circle,
  charter = square or diamond, plus maybe magnet/virtual/alt variants) or a distinct
  outline/badge. Implement in `src/map/useDeckLayers.ts` (IconLayer or shaped markers),
  and add it to the legend from §2.
- Keep the wording consistent everywhere: inspector header says "District school" /
  "Charter" (`src/inspector/SchoolInspector.tsx`); the list has a Type column
  (`src/views/SchoolListView.tsx`); the filter labels Traditional as "District"
  (`src/shell/LeftRail.tsx`). Make sure Magnet is handled and labeled.
- ACCURACY: school `type` comes from NCES and is ~97% aligned to the authoritative FL DOE
  charter directory. `SchoolList.xls` (in the project root) lists 282 charters in the 3
  counties vs the tool's 273. RECONCILE: parse `SchoolList.xls` (columns District + School
  Code; MSID = `{districtNumber}-{schoolCode}`, e.g. Miami-Dade district 13 + code 3501 ->
  "13-3501"), mark exact matches as Charter, and log the mismatches so the charter filter
  becomes trustworthy. FL district numbers: Miami-Dade 13, Broward 6, Orange 48.

## 4. Audit every filter and slider (semantics must match the label)
For each: confirm the logic matches the label, the "all/off" state is obvious, and it
updates map + list + counts together (they should, via §1).
- Geography (county checkboxes): empty selection = empty map; verify the empty state reads clearly.
- School rating (A-F chips, multi-select, empty = all): F is disabled when no F schools
  exist (correct); make the NR/NG/I "Other" bucket read clearly.
- Grade span (Elementary/Middle/High/Combination/Other): confirm these exactly match the
  data's `level` values (`src/data/types.ts` SCHOOL_LEVELS) and that Combination/Other are meaningful.
- School type (District/Charter/Magnet/Virtual/Alternative): see §3.
- Designation (PLP-only, SoH-eligible-only): verify against the official PLP list.
- Facility utilization slider (enrollment/capacity, 0-200%, marks at 75% and 100%):
  IMPORTANT - narrowing it EXCLUDES schools with no reported capacity (only ~53% have
  capacity), so make the UI clearly say this or users think schools vanished by mistake.
  The 75% mark is the statutory co-location threshold (Rule 6A-1.0998271). Confirm the
  `isUtilRangeDefault` behavior in `filters.ts` is what you intend.

## 5. Data accuracy TODOs (real vs still-sample)
REAL, trust these: school locations (NCES), official PLP list (44), grades, enrollment
history, FISH capacity (charters/virtual correctly null), Opportunity Zones,
legislative districts + congressional reps, population growth (county-level), median
household income (ACS 2019-2023, just wired via `scripts/build-acs-income.mjs`), existing
Schools of Hope (loan-fund ledger, `scripts/build-schools-of-hope.mjs`).
STILL SAMPLE / PLACEHOLDER - fix or clearly caveat in the UI:
- FLOOD zones: only 5 polygons, so almost every school reads "no flood zone" (unreliable).
  Wire real FEMA National Flood Hazard Layer. NOTE: FEMA's public ArcGIS REST service
  504-times-out from a sandboxed environment; pull via the bulk county GDB from the FEMA
  Flood Map Service Center, or run a FEMA REST precompute from a normal network.
  Deliverable: a per-school flood zone (point-in-SFHA) keyed by MSID so the inspector's
  "Located in a flood zone" becomes real.
- TITLE I: `title_i_eligible` exists on every school but is all `false` (unpopulated), yet
  Title I eligibility is a STATUTORY requirement for a School of Hope. Wire the FLDOE Title
  I list, then add a "Title I eligible" filter + an inspector Yes/No + factor it into SoH eligibility.
- BOARD (school-board member) districts: only Miami-Dade (4 features). Add Broward + Orange
  from county GIS / Supervisor of Elections.
- STATE House/Senate representative NAMES: empty (boundaries are real). Populate from
  OpenStates or each chamber roster (`public/data/representatives.json`).
- ATTENDANCE zones: absent. The siting test is the GREATER of Opportunity Zone / attendance
  zone / 5-mile PLP radius, so omitting attendance zones can UNDER-state eligible area. Wire
  NCES EDGE SABS or district GIS boundaries.
- FISH coverage: ~240 district schools are unmatched by name in
  `scripts/parse-fish-capacity.mjs`; improve the join (also match on address/ZIP).

## 6. Statutory correctness to preserve (do not regress)
- PLP: prefer the OFFICIAL FLDOE list; the computed rule (`src/data/derive/plp.ts`) is fallback only.
- "Underused facility" / co-location: Rule 6A-1.0998271 = utilization <= 75% OR >= 400 surplus
  student stations (`isUnderutilizedFacility` in `store.ts`). Co-location applies to DISTRICT facilities only.
- SoH siting = greater of Opportunity Zone / attendance zone / 5-mile PLP radius; the school must be Title I eligible.
- Radius and measure tools are geodesic (turf) and verified accurate (a 3-mile ring = 28.3 mi^2).
  Do not "fix" them to flat pixel math.

## 7. Verification for every change
`npx tsc --noEmit` -> `npx vitest run` -> `grep -rl "—" src` (empty) -> `npm run build`.
Then browser QA: reload with a cache-busting `?r=N`, and screenshot to confirm (console
buffer is stale). Test: toggle a county off (counts drop), a rating filter, click a pin ->
inspector, the utilization slider, a zero-result combo (empty state shows), and each layer overlay.

## 8. Suggested order
1. Fix the color collision + add a full map legend (§2) - biggest "makes sense" win.
2. District-vs-charter visual + reconcile charters against `SchoolList.xls` (§3).
3. Utilization slider clarity + full filter audit (§4).
4. Real flood + Title I (§5).
5. Everything else in §5.
