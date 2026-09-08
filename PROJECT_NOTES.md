# Project Notes: sample vs real, and the ordered plan to wire real data

## Accuracy and comprehension pass (September 2026)

Map comprehension: grade owns pin color + letter; school TYPE owns marker SHAPE
(circle District, square Charter, diamond Magnet, triangle Virtual, hexagon
Alternative); utilization moved to a neutral up/down mark, off the grade color
channel. A full `MapLegend` explains every encoding. "Schools in view" and the map
summary are now viewport-limited. Terminology is "District" everywhere; the school
list gained a Type column.

Data made real (each step is a re-runnable `npm run data:*` script):

- Charters reconciled against `SchoolList.xls` (`data:charters`): 274 charters, log
  in `scripts/out/charter-reconciliation.log.txt`.
- Florida House + Senate representative names (`data:legislators`) from the roster
  files; U.S. Senators removed (statewide, no district value).
- Real school-board districts for Miami-Dade + Broward with current member names
  (`data:board`). Orange publishes board-member districts only as a PDF map, so its
  boundary is a documented gap.
- Title I eligibility (`data:titlei`) from NCES CCD (tri-state yes/no/unknown),
  wired into the filter, inspector, and School of Hope eligibility.
- Per-school FEMA flood status (`data:flood`) from the FEMA National Flood Hazard
  Layer; the inspector's flood Yes/No is now authoritative. The map flood overlay
  is still a small sample and is labeled as such.
- FISH capacity matching improved (`data:fish`): 592 -> 695 schools via
  level-disambiguation and conservative token matching (~62% coverage).

Attendance zones (deliberate gap): the School of Hope siting area is the greatest
of an Opportunity Zone, the attendance zone, or the 5-mile PLP radius. In these
three dense urban counties a school attendance zone is always far smaller than the
5-mile radius (~78 sq mi), so it never expands the eligible area beyond what the
Opportunity Zone + 5-mile radius already cover. NCES SABS boundaries are 2015-2016,
experimental, and keyed by NCES id (no MSID). Integrating them carries regression
risk to validated statutory logic for zero practical change in eligible area, so
attendance zones are documented here rather than wired.

This build is a runnable front end on committed sample data. The architecture is
built to receive real sources without a rewrite: swapping sample for real is a
one-file edit per layer, inside its adapter in `src/data/adapters/`. Nothing in
the UI changes.

## What is real vs sample in this build

Everything on screen is **sample data**, committed in `public/data/` and
generated deterministically by `scripts/generate-sample-data.mjs`. The sample is
labeled "Sample data" in the top bar and every layer row shows its vintage.

The coordinates, grades, incomes, districts, flood zones, and isochrones are
plausible but invented for the pilot geography. They are not published values. Do
not use them for any real siting decision. The one true external dependency is the
Google Maps base imagery, which needs your own API key.

## Layer status

| Layer / dataset | Config id | Sample committed | Real source to wire | Adapter |
|---|---|---|---|---|
| School locations | `school_locations` | Yes | FL DOE MSID + NCES EDGE geocodes | `adapters/schools.ts` |
| Historic grades (inspector) | `historic_grades` | Yes | FL DOE School Grades files, per year | `adapters/grades.ts` |
| Median household income | `household_income` | Yes | Census ACS 5-year (B19013, B01001) + TIGER tracts | `adapters/income.ts` |
| School board districts | `board_districts` | Yes (Miami-Dade, simplified) | Three county GIS / SOE sources | `adapters/boardDistricts.ts` |
| FEMA flood zones | `flood_zones` | Yes | FEMA National Flood Hazard Layer | `adapters/flood.ts` |
| Drive-time reach | `drive_time_reach` | Yes (one per county) | ORS (demo) or self-hosted Valhalla | `adapters/isochrones.ts` |
| Population growth | `population_growth` | **Yes (REAL)** | Census PEP Vintage 2024 (births/deaths/net migration) + ACS 2019-2023 + TIGERweb counties | `adapters/populationGrowth.ts` |
| Opportunity zones | `opportunity_zones` | **Yes (REAL)** | HUD Opportunity Zones (Treasury/IRS designated QOZ tracts, 2018) | `adapters/opportunityZones.ts` |
| Legislative districts | `legislative_districts` | **Yes (REAL)** | Census TIGERweb: 119th CD + 2024 SLDU/SLDL, clipped to the 3 counties | `adapters/legislative.ts` |
| Representatives (inspector) | `representatives` | **Yes (REAL, federal)** | unitedstates/congress-legislators (US House/Senate); state + board names pending OpenStates / county rosters | `adapters/reps.ts` |
| Enrollment history (inspector) | `school_enrollment_history` | **Yes (REAL)** | NCES CCD via Urban Institute (annual PK-12 membership) | `adapters/enrollment.ts` |
| Parcels (optional) | `parcels` | No, and never a committed GeoJSON | Three county Property Appraisers, via PostGIS + vector tiles | `adapters/parcels.ts` |

**Update (this pass):** the five layers/datasets above marked "REAL" were populated
from authoritative sources by `scripts/fetch-real-layers.mjs` (`npm run data:layers`).
They now render on the map / in the inspector. Only `parcels` remains deliberately
un-committed (it needs PostGIS + vector tiles). The `income`, `board_districts`,
`flood_zones`, and `drive_time_reach` layers still ship the earlier synthetic samples
and are the remaining "make it real" work (income is now a one-script step away, since
the Census API key is wired for build-time use). The old `adapters/births.ts` and
`adapters/migration.ts` stubs are superseded by the single `populationGrowth.ts`
adapter (the PEP file carries both components).

**Building capacity / FISH (co-location pathway).** Real per-school capacity is
now wired from the Florida Inventory of School Houses (FISH, FL DOE, May 2026)
via `scripts/parse-fish-capacity.mjs` (`npm run data:fish`). Because FL DOE files
are Akamai-gated, the FISH workbook (`0074722-summary.xls`, `FacilityData` sheet)
is a manual download; the script parses its `Capacity` column and patches
`schools.sample.geojson` (592 of ~1,116 schools matched by normalized name within
district; charters/virtual/ambiguous are left `null`, never guessed). This lights
up the building-utilization read across the map, list, status strip, and inspector
(FUR = real NCES enrollment / real FISH capacity), and feeds the backend
`fish_capacity` table for the co-location eligibility view. FISH facility numbers
are NOT the NCES MSID, so matching is by name, not number - see the script header.

Layers without a committed sample still appear in the panel, disabled with a
"Sample not yet included" note. That is intentional and is one of the acceptance
checks.

## Ordered plan to wire real data (second pass)

Follow the phase order from `01_PRODUCT_SPEC.md`.

1. **MVP hardening.** Replace `SAMPLE_URL` in `schools.ts`, `income.ts`,
   `boardDistricts.ts`, and `grades.ts` with real endpoints. Geocode schools to
   rooftop accuracy (prefer NCES EDGE; fall back to the free Census Geocoder for
   the newest schools EDGE lags on). Keep the full grade domain
   `{A, B, C, D, F, I, NR, NG}`. Board districts need three per-county adapters,
   not one. Replace the coarse county polygons in `src/geo/countyBounds.ts` with
   real TIGER county geometry.
2. **P1 flood zones.** Wire FEMA NFHL by county effective date. Highest value in
   coastal Miami-Dade and Broward.
3. **P2 drive-time reach.** Stand up self-hosted Valhalla on a small VM. Do not
   plan the launch around the ORS free tier (roughly 40 isochrones/day).
   Precompute isochrones and their area-weighted population and store both.
4. **P3 population growth.** Add births (FLHealthCHARTS) and migration (IRS SOI or
   ACS flows), county level. Add a `population_growth.sample.geojson` matching the
   diverging-ramp style already in the config, then swap for real.
5. **P4 opportunity zones.** Small, mostly static. VERIFY 2018 vs 2027 (OBBBA)
   designation status before shipping and plan to swap the tract file when the
   2027 designations publish.
6. **P5 legislative districts + representatives.** Boundaries are free (TIGER).
   Representatives are a separate table; a manually maintained table refreshed
   after each election is viable at 3-county scope (Google Civic reps endpoint is
   deprecating, VERIFY).
7. **Optional parcels.** Only if site-level land context is wanted. Requires
   PostGIS storage and vector tiles from day one (Miami-Dade alone is ~800k
   parcels). The layer's high minZoom prevents accidental county-view loads.

## Backend (documented, not built here)

PostgreSQL + PostGIS (geography type, GiST indexes), vector tiles for large
polygon layers, a cached isochrone service. See `06_ARCHITECTURE.md`. The
front-end adapter interface is unchanged when these ship: an adapter fetches a
tile or GeoJSON endpoint instead of a sample file.

## Verify before committing budget or scheduling launch

- Google Maps Platform current pricing and monthly credit.
- OpenRouteService free-tier quota, or commit to self-hosted Valhalla.
- Opportunity Zone program status (2018 designations vs 2027 refresh).
- FLHealthCHARTS export path (portal changes are common).
- Each county's board-district and parcel file location and format.
- Representatives data source (Google Civic deprecation status).

## Not done in this pass (by design)

- Live ingestion of the 13 datasets, a hosted database, deployment, auth.
- A Playwright smoke test. The architecture names one (map loads, toggle two
  layers, open the inspector). It is not wired here to avoid a browser download in
  the one-shot. Vitest covers the geo correctness, schema validation, CSV, grade
  domain, and the em-dash rule. Adding Playwright later is a small, isolated step.

## Known sample simplifications

- County polygons in `src/geo/countyBounds.ts` are coarse rectangles used only
  for point-in-county validation, not authoritative boundaries.
- Board districts sample is a 4-way quadrant partition of Miami-Dade, not the real
  nine districts, and covers only one county. Enough to exercise the spatial join.
- Income tracts are a 4x4 grid per county with plausible ACS-style values, sized
  so every sample school falls inside a tract.
- Isochrones are rough blobs with precomputed population, one per county.
