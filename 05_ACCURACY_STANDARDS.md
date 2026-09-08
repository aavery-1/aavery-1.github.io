# Accuracy, Performance, and Presentation Standards

These are mandatory. "Professional grade" here means: numbers are true, the map is fast, the presentation earns trust, and the correctness claim is enforced by tests, not just by comments. The headline guarantee is **"5 miles is truly 5 miles."**

## 1. Geospatial correctness

> **Store in WGS84. Measure geodesically (or in a Florida-appropriate projected CRS). Render in Web Mercator. Never let the rendering projection do the math.**

Web maps render in Web Mercator (EPSG:3857), which stretches distance with latitude. A fixed-pixel "5-mile" circle is not 5 ground miles. A degree of longitude is roughly 69 miles at the equator and shrinks going north, so treating latitude and longitude as flat graph paper produces wrong answers.

**Do:**
- **Distances.** Compute geodesically. Front end: `turf.distance` (Haversine, sub-percent error). Backend: PostGIS `geography` type; `ST_Distance` returns true meters. For highest area and distance fidelity within Florida, project to State Plane (EPSG:2236 for the three pilot counties, all of which fall in Florida East) or UTM 17N (EPSG:26917).
- **Radius rings.** Generate true geodesic buffers (`turf.buffer` or `turf.circle`, or `ST_Buffer` on geography), not pixel circles. A correct ring appears slightly non-circular on screen. That is honesty, not a bug.
- **Population within radius or drive time.** Intersect the buffer or isochrone with census geometry in a projected or equal-area CRS. Area-weight partial block groups: a tract that is 40% inside the buffer contributes 40% of its population. Never count a tract as fully in or fully out. When possible, use school-age population (ACS B01001 sum for ages 5-17) rather than total population.
- **Scale bar.** Recomputes as the map moves, using the true ground distance at the current map center latitude. When the measure tool is active, its readout uses the geodesic distance at the measurement's own segment (which may differ slightly from center-of-view). Both are shown to the user and they must agree on any local segment to within visual precision. This visible agreement is the "5 miles is 5 miles" proof.

**Never:** measure in pixels; do math on raw latitude and longitude as if planar; draw a radius as a fixed-pixel circle; trust Mercator area.

**Note on the drive-time layer.** Isochrones are already ground-truth because they run on the real road network in true distances. Only straight-line measurements need the discipline above.

## 2. Correctness at ingest

Garbage in, garbage on screen.

- **Geocode schools to rooftop accuracy.** Prefer NCES EDGE authoritative coordinates. Never ZIP or centroid. The "zoom to the building" goal demands real points. Spot-check every county sample.
- **One datum everywhere.** WGS84. Reproject on load. Store consistently.
- **Validate on load.** Grade values match the full allowed set: `{A, B, C, D, F, I, NR, NG}`. See `03_DATA_CATALOG.md` for what each means. Income is non-negative. Every school point falls inside its declared county polygon. Polygons are valid (`ST_MakeValid`). Join keys are present (MSID, GEOID, county FIPS). See `04_SAMPLE_SCHEMAS.md` for per-file validation rules.
- **Define each metric once.** The inspector's "tract median income" comes from one canonical query or derivation. Not recomputed a second way anywhere else. Have a `src/geo/` module that owns every geometric calculation and a `src/data/derive/` module that owns every non-trivial derivation.
- **Stamp provenance.** Every layer carries source and vintage. Every on-screen value can be hover-inspected for its source. Any number the analyst reads can be traced to its file, field, and vintage in one hover.

## 3. School pin encoding

The grade encoding uses **color plus letter**, always. Color alone fails for the 8% of male analysts with red-green colorblindness and fails on grayscale printing. The letter sits inside the pin at every zoom level, in white text, sized to remain legible at the smallest pin size (24px).

- A: green fill, letter A
- B: blue fill, letter B
- C: amber fill, letter C
- D: orange fill, letter D
- F: red fill, letter F
- I: gray fill, letter I
- NR: white fill with gray outline, letters NR
- NG: white fill with gray dashed outline, letters NG

The color specifications live in `02_DESIGN_SYSTEM.md`.

## 4. Performance

- **Serve polygon layers as vector tiles** at production scale. The deck.gl overlay draws from tiles, not from ever-larger GeoJSON payloads.
- **GiST spatial indexes** on all geometry in PostGIS. Point-in-polygon and nearest-school stay fast.
- **Precompute and cache** the expensive derivations: isochrones and their population-intersect values, buffer-population values for common radii.
- **Simplify geometry by zoom.** A county-wide view should not draw every flood-polygon vertex. Use `deck.gl` tile layers with per-zoom simplification, or precompute simplified copies.
- **Debounce layer toggles.** Render progressively. Never block the UI on a fetch.
- **Client-side spatial index.** For the inspector's "which layer polygon contains this point" lookups, use an in-memory `rbush` index built once when the layer loads. Naive iteration is fine for 30 polygons in sample; wrong for 4,000 tracts in production.

## 5. Automated tests (required, not optional)

The correctness claim only holds if it is enforced by tests. Ship the following as part of the MVP.

- **Unit tests on `src/geo/`.** Use Vitest.
  - Known-distance test: measure a known interstate segment (e.g. I-95 between two named exits) and assert within 1% of the published value.
  - Radius area test: a 5-mile geodesic buffer has area within 1% of 78.54 mi² (π × 25).
  - Latitude invariance: the same distance measured at Miami (~25.8°N) and at Orlando (~28.5°N) returns equal values. Catches Mercator and planar-degree bugs.
  - Area weighting: a synthetic buffer that covers exactly half of a synthetic square tract returns exactly half of that tract's population.
- **Schema tests.** Each sample file is loaded and validated against the schema in `04_SAMPLE_SCHEMAS.md`. Test fails if any required field is missing or any enum is out of range.
- **Grade domain test.** The full grade set `{A, B, C, D, F, I, NR, NG}` all render without falling through to a default case.

Tests run in CI on every PR. A red suite blocks merge. The "5 miles is 5 miles" pledge is only credible if it is machine-checked.

## 6. Professional presentation

- **Scale bar** always visible, accurate at current view.
- **Legends carry units and vintage.** Not "Income" but "Median household income, USD (ACS 2019-2023)". Not "Flood" but "FEMA flood zone (NFHL, effective YYYY-MM-DD)".
- **Explicit no-data states.** Never render "$0" for a missing value, and never a bare placeholder without context. Show "no data at this location" or "layer not loaded" with the reason.
- **Honest precision.** Respect ACS margins of error. Don't show false decimals on noisy estimates: "median $62,340 ± $4,210" is honest; "$62,340.17" from a tract estimate is not.
- **Attributions** present and correct whenever the corresponding data is on screen. See `02_DESIGN_SYSTEM.md` for the attribution strip.
- **Accessibility.** Keyboard-operable toggles. Focus rings visible. `aria-label`s on all controls. Contrast meets WCAG AA. See `02_DESIGN_SYSTEM.md` for details.

## 7. Error handling

- **Google Maps script fails to load.** Show a friendly message with the likely cause (missing key, network) and a copy of the sample data readable inline. Don't crash the app.
- **A layer fails to load.** The specific layer shows an error chip in the panel with the reason. Other layers keep working.
- **A tile request fails.** Show a placeholder tile with a small "retry" affordance. Don't spam the user with red banners.
- **The isochrone API 429s.** Fall back to a cached isochrone if available. If not, show "reach data unavailable, quota exhausted".
- **Malformed GeoJSON.** Validator refuses to load. Layer shows "data validation failed" with a console error naming the field.

Every error state has a specific message. Never a generic "Something went wrong."

## 8. Self-tests to include in the acceptance run

Beyond the automated suite:
- Measure a known segment (e.g. one mile of I-95): result within 1% of true.
- 5-mile radius around a point in Miami-Dade: contains and excludes known landmarks correctly; area shown is ~78.5 mi².
- Same distance measured at Miami and at Orlando: both correct.
- Toggle every sample layer on and off ten times: no memory leak, no console errors, no visual glitches.
- Add a fake layer to `07_LAYERS.config.json` and confirm it appears in the panel with no other code changes.
- Every legend, attribution, and vintage stamp appears.
- Every "no data" case shows a labeled empty state, never a blank or a false zero.
