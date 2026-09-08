# Data Visualization, Labeling, and Mathematical Integrity audit

Scope: every graphic, chart, metric, and quantitative display in the tool, against
the Section 14 standard (axes, units, scale, zero baselines, labeling, correct
calculations, consistent formatting, discoverable sources). Date: 2026-09-07.
Verification: `npm run typecheck` clean, `npm test` 57/57 passing.

## Inventory of quantitative surfaces

| # | Surface | File | What it shows |
|---|---------|------|----------------|
| 1 | Enrollment trend chart | `src/inspector/SchoolInspector.tsx` | Annual membership vs building capacity, line + area |
| 2 | Building utilization metric + bar | `src/inspector/SchoolInspector.tsx` | Facility Utilization Rate, % + progress bar |
| 3 | Grade timeline | `src/inspector/GradeTimeline.tsx` | Letter grade per school year (categorical) |
| 4 | Usage donut | `src/status/OverviewDock.tsx` | Per-school utilization ring |
| 5 | In-view counts | `src/status/OverviewDock.tsx` | Schools in view, PLP, Underused, Co-location |
| 6 | School table | `src/views/SchoolTable.tsx` | Utilization (bar + %), Enrollment, Capacity |
| 7 | Compare drawer | `src/inspector/CompareDrawer.tsx` | Enrollment / capacity / utilization rows |
| 8 | Map hover tooltip | `src/map/MapView.tsx` | Utilization % with its numerator and denominator |
| 9 | Map pin encoding + legend | `src/map/MapLegend.tsx` | Grade (color+letter), type (shape), utilization mark |
| 10 | Population-growth choropleth + legend + context row | `useDeckLayers.ts`, `MapLegend.tsx`, `contextModel.ts` | County annual growth rate |
| 11 | Household-income choropleth + legend + income row | same trio | Median household income + margin of error |
| 12 | Distance / radius / scale bar | `src/geo/*`, `src/map/ScaleBar.tsx` | Geodesic miles; PLP 5-mile siting radius |

## The 10-question review, and the calculation check

Every surface was read against the ten QA questions and the calculation list.
Calculation spine that all surfaces share:

- Distance is computed in exactly one place (`src/geo/measure.ts`), geodesic on the
  WGS84 ellipsoid (Vincenty), `METERS_PER_MILE = 1609.344`. The 5-mile PLP radius,
  the measure tool, and the scale bar all derive from it. No flat lat/long math. OK.
- Utilization is computed by one shared helper (`utilizationStyle` /
  `isUnderutilizedFacility` in `src/store.ts`): statutory Facility Utilization Rate
  is COFTE / FISH student stations; a COFTE of 0 is treated as missing (not a real
  rate) and falls back to the enrollment proxy; "underused" is the OR-composed
  statutory test (rate at or below 75% OR surplus of 400+ stations). OK.
- Growth rate is a fraction; every display multiplies by 100 once (legend
  `Math.round(n*100)%`, context row `(rate*100).toFixed(2)%`). Same numerator. OK.
- Counts (`MiniStat`, table count, "in view") come from the single filtered slice
  (`useFilteredSchools`), so map, list, dock, and callouts cannot disagree. OK.

## Findings and actions

### Fixed

1. **Table utilization bar exaggerated low values.** `UtilizationCell` floored the
   proportional bar at `Math.max(24, util*100)`, so a school at 5% utilization drew
   a bar filled to ~24% of the track. Now the fill is the exact utilization fraction
   (a 2% floor only so a non-zero rate stays visible), capped at a full track with
   the over-capacity case flagged by the triangle mark and the % label. Truthful
   magnitude. (`src/views/SchoolTable.tsx`)

2. **Enrollment chart y-axis used arbitrary tick values.** The domain top was
   `1.08 x peak` and ticks were `0, round(top/2), round(top)`, producing labels like
   703 / 1,406. Replaced with a standard nice-number axis: a true 0 baseline (never
   truncated, since this is a count) up to a rounded ceiling at or above both the
   capacity line and the peak, with gridlines on readable intervals (0 / 500 /
   1,000). (`src/inspector/SchoolInspector.tsx`)

3. **Enrollment chart axes were only implied.** Added explicit axis unit labels
   ("Students" on Y, "School year" on X) alongside the existing legend and
   aria-label, and widened the left gutter so tick labels never crowd the Y title.
   (`src/inspector/SchoolInspector.tsx`)

4. **Table headers did not disclose definitions or sources.** The Utilization,
   Enroll., and Capacity headers now carry hover definitions: Utilization =
   enrollment / capacity (FISH stations) so it reconciles with the two columns
   beside it; Enrollment = NCES CCD membership (2023-24); Capacity = permanent FISH
   student stations. (`src/views/SchoolTable.tsx`)

5. **Stale code comment on the usage donut** claimed enrollment/capacity and a
   neutral color; it actually uses the COFTE-preferred rate and tints by utilization
   tier. Comment corrected. (`src/status/OverviewDock.tsx`)

### Verified correct, no change

- Grade timeline: correctly refuses a trend line across Florida's grading-formula
  resets (2010/2012/2015/2022) and marks those years; grades are categorical, gaps
  read as gaps. Chart type fits the question.
- Enrollment-vs-capacity chart already used a 0 baseline and a dashed capacity
  reference line; tooltip reports the value, year, and % of capacity.
- Map hover tooltip states utilization as `X% (enrollment of capacity)`, so the
  number is reproducible from the figures shown next to it.
- Income choropleth reports median household income with its ACS margin of error and
  the tract id; legend ramp uses `$k` rounding appropriate to a scale.
- Distance/scale/radius: single-source geodesic, correct unit constant.

### Documented (intentional, now labeled everywhere)

- **Two utilization definitions coexist by design.** Surfaces that show enrollment
  and capacity next to the rate (table, compare drawer, map hover) display the
  membership rate (enrollment / capacity) so the reader can reproduce it from the
  visible figures. The school inspector shows the statutory COFTE-based Facility
  Utilization Rate, which it labels as a proxy approximating Rule 6A-1.0998271(1)(n).
  Both are correct for their context; each surface now names its basis so the two are
  never mistaken for one drifting number.

## Consistency conventions confirmed

- Percentages: whole-number % for utilization everywhere; 2-decimal % only for the
  small county growth rate where that precision is meaningful.
- Counts and enrollment/capacity: `toLocaleString("en-US")`, tabular figures.
- Distances: miles, one decimal in siting text; the scale bar switches m/km.
- School years: `YYYY-YYYY` with `'YY` tick shorthand, chronological.
- Sources and vintages are attributed in the inspector, the layer adapters, and the
  attribution strip (CCD 2023-24 enrollment, FISH capacity, ACS income, PEP growth).
