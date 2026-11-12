# Shared geo rules: Grove and the SOH siting tool

Adopted 2026-11-10; exact match in place 2026-11-11; saved results for every school and our own routing server 2026-11-11; school day, 5 and 10 minutes only, 90% ranges and the shared projection 2026-11-11. This file lives in Grove (`platform/docs/methods/geo-ruleset.md`, the master). `scripts/sync-shared-geo.mjs` copies it to the SOH siting tool as `GEO_RULESET.md`, along with the shared engine and its data.

**Goal:** the same site, the same area and the same question give the same number in both tools, and that number matches the real world as closely as we can show.

## How the match is guaranteed

| What | Where it lives | How the SOH tool gets it | Check |
|---|---|---|---|
| All geo and census math, and the drive-time engine | `lib/shared-geo/sharedGeo.ts` (one file, no imports) | Byte-identical copy at `src/shared-geo/sharedGeo.ts` | SHA-256 fingerprints, tested in both repositories |
| Every populated 2020 block and the tract figures | `data/census_sites.json` | `npm run data:poppoints` rebuilds `population_points.json` from it, through the shared engine | Exact ring test in SOH |
| Saved drive-time results (every school, drop-off and pickup; the school day is blended when read) | `data/drive/` (index plus one file per site) | Copy at `public/data/drive/` | One tree fingerprint over every file |
| Live-estimate calibration and the 90% range model | `data/drive_time_calibration.json` | Copy at `src/config/drive_time_calibration.json` | Fingerprints |
| Projection parts per tract (children 5-17, five years on) | `data/projection_parts.json` | Copy at `public/data/projection_parts.json` | Fingerprints |
| This ruleset | `docs/methods/geo-ruleset.md` | Copy at `GEO_RULESET.md` | Fingerprints |

After changing any of these in Grove, run `node scripts/sync-shared-geo.mjs` (and `npm run data:poppoints && npm run data:demographics` in SOH if the census file changed). Then run `scripts/qa_cross_tool.ts`. Both repositories run their tests on every pull request (`.github/workflows/checks.yml`).

**Proof, 2026-11-11 (after the school day, 5/10-minute and 90%-range changes).** `scripts/qa_cross_tool.ts` ran each tool's own code path on every measured Florida site, a seeded sample of saved estimates and two live-estimate pins, for the school day, drop-off and pickup, plus a 2-mile radius at each. It compared people, K-8 children, % Black, % Hispanic, median income, the Census margins, the 90% range of every population and K-8 count, and the projected change in children 5-17: **3,608 figures, 0 differences** (`docs/qa/cross-tool-check-2026-11-11b.csv`).

## The rules

### 1. One location per campus
Each campus has one coordinate both tools use. Source order: an address geocode that the Census geocoder and NCES EDGE agree on (within 100 m), then NCES EDGE, then a hand-placed point with a note. A saved drive-time measurement applies to any pin within 150 m of where it was measured, so two pins for one campus get the same areas.
*Open:* the tools' pins still differ by 35-70 m for KIPP Miami North and KIPP Legacy. Measured sites match regardless; for unmeasured sites, align the pins when the tools share one school table.

### 2. Distance is straight-line on the WGS84 ellipsoid
Vincenty's formulas (`distanceMi`). Label it "straight-line". Never mix it with driving distance.

### 3. Radius rings are true circles
An N-mile ring has 128 vertices, each exactly N miles out (`geodesicCircle`). A home is inside when its block's internal point is within N miles.

### 4. Areas use one formula
Square miles come from turf.area's spherical formula (`ringAreaSqMi`), reported to 0.1 sq mi. It reads up to 0.15% high at Newark's latitude.

### 5. People are placed at every 2020 Census block
Every populated 2020 block (POP100), at its internal point, sorted by block GEOID within its tract. A block is in an area when its internal point is inside the area, with holes and separate pieces counted as drawn. No pooling: Grove used to group blocks into 32 points per tract, which caused the last 3% gap.

### 6. One census file, tract level, scaled to July 2025
`data/census_sites.json`: ACS 2020-2024 5-year by tract, children's age groups scaled to each county's July 2025 Census estimate. Each tract's figures are spread over its blocks by population share (`weightsFromBlocks`, shares rounded to 1e-9 so saved and recomputed areas agree exactly).

Why tracts, not block groups: the Census API publishes no block-group values for B09001 (children by age) or B01001B/I (race by age); checked 2026-11-10. Projections are tract-based too.

Counties with figures: Miami-Dade, Broward, Palm Beach, Orange, Seminole, Osceola, Lake, Polk, the New Jersey counties and Philadelphia. Lake and Polk were added 2026-11-11 because west Orange County drive times reach them. They are left out of the projection backtest, so the error band every site's projection range uses didn't move. Adding them changed one thing in existing data: the 2015-19 base of 5 Orange tracts on the Lake line, which straddled the line on 2010 tracts, by at most 9 people.

### 7. Definitions (all in `sharedGeo.ts`)
| Measure | Definition | Source |
|---|---|---|
| K-8 children | Ages 5-13 (grade g = age g + 5), each published age group spread evenly over its single years (`agePop`) | ACS B09001, July 2025 |
| School-age children | Ages 5-17 | same |
| % Black, % Hispanic | Of children ages 5-14. Black = Black alone of any ethnicity; Hispanic = any race; they overlap | ACS B01001B, B01001I |
| Race mix adding to 100% | Children 5-17, mutually exclusive groups, labeled as 2020 | 2020 Census DHC P12 series |
| Total population | ACS total scaled to July 2025 where available | ACS B01003 |
| Median household income | Interpolated from the area's summed brackets (`medianFromBins`); never an average of medians | ACS B19001 |
| Margin of error | 90% ACS margins, root-sum-of-squares of apportioned parts; shares use the derived-proportion formula | ACS |
| Coverage | Share of the area's 2020 people living in tracts with figures; warn below 99.5% | 2020 blocks |

### 8. Drive time
**Definition.** A home is within N minutes if Google Maps predicts N minutes or less on a school-day Tuesday. Only 5 and 10 minutes are offered (15 was dropped 2026-11-11: decisions use 5 and 10, and those are the rings checked against Google).
- **School day** (default): the drop-off and pickup areas averaged. Each tract's share is the mean of its two shares, so a home inside both areas counts fully and a home inside one counts half; every figure then aggregates from one set of shares (`blendResults`). The map shows both outlines.
- **Drop-off**: home to campus, leaving 8:00am. **Pickup**: campus to home, leaving 4:00pm.

**How a home is counted.** Every populated 2020 block is timed to (or from) the campus on OpenStreetMap roads (Valhalla). It is inside a ring when its time is at or under that ring's *cut-off*: the Valhalla minutes that equal N Google minutes for that site and direction.

**Saved results, for every school and campus** (`scripts/drive_precompute.ts`, `data/drive/`), worked out on our own routing server (`docs/runbooks/routing-server.md`): Valhalla 3.9.1 on Geofabrik extracts of Florida, New Jersey and Pennsylvania dated 2026-11-08, with the standard default-speeds table. A pin within 150 m of a saved site uses that site's result.
- **Measured sites** (`scripts/drive_measure.ts`, raw times in `data/drive_measurements.json`): 30 homes where children live (five distance bands with equal numbers of children, six homes each, a seeded draw) timed by Google with predicted traffic, plus 20 to 60 homes chosen right at the lines by the edge check (below). The precompute re-times them on our server and fits Google = a + b x Valhalla per site and direction; the cut-off is (N - a) / b.
- **All other schools** ("Estimate"): the median of the measured sites' cut-offs in the region (Florida; Newark and Paterson; Camden).

Measured 2026-11-10/11, both directions: Florida: KIPP Miami North, KIPP Legacy, William Dandy MS, Carol City MS, Hialeah Gardens MS, Lauderdale Lakes MS, Memorial MS, Larkdale ES. New Jersey: 14 KIPP Newark, Camden and Paterson campus locations (all 15 campuses). Fits ran from 0.7x to 1.5x our server's time by site. In Florida the cut-offs split by county (10 minutes, drop-off: Broward 13.2-14.5 Valhalla minutes, Miami-Dade 10.4-12.0), so the Florida median moves with each site measured (open item 1).

**Edge check: each line within 2 minutes of Google** (`scripts/qa_drive_edges.ts`; `docs/qa/drive-edges-2026-11-11*.csv`; raw times `data/drive_edge_checks.json`). For each line, Google timed 10 homes where children live that our model put within 2 minutes of it; the line's offset is the median gap.
- KIPP's 16 campus locations, Dandy and Carol City: after adding the edge homes to the fits, every line is within 2 minutes; scored with each line's own homes held out, all but two (a 15-minute ring, now dropped).
- Larkdale ES: all 5 and 10-minute lines within 0.4 minutes of Google from the start.
- Lauderdale Lakes MS (2026-11-11): all four 5 and 10-minute lines within 0.8 minutes, also held out.
- 75-90% of single homes near a line are within 2 minutes; Google's own times vary by a few minutes between homes our model rates the same.

**Counts against Google** (`scripts/qa_drive_accuracy.ts`). The independent sample of 2026-11-10 (600 homes, 5 Florida sites, drop-off, none used in any fit) is scored *paired*: our line and Google's on the same homes, so the sample's own noise cancels. A random-effects meta-analysis (DerSimonian-Laird) separates real model error from sampling noise:

| Ring | Mean difference (Google vs ours) | Model error between sites (tau) |
|---|---|---|
| 5 min | +22% (SE 11%): our 5-minute counts run low | 22% |
| 10 min | +5% (SE 5%, not significant) | 8% |

The 5-minute bias is the expected effect of a sharp line on a noisy time: more children live just outside a line than just inside, so Google's scatter puts more in than out. KIPP Miami North's 10-minute line sat within a minute of Google's yet its count ran low by about 40%, which is why the ranges below are set from counts, not from line offsets.

Evaluated and not adopted (2026-11-11):
- *A probabilistic catchment* (each home counted by its chance of being inside, from the site's residual spread; `scripts/qa_drive_smooth.ts`): fixed the 5-minute bias at Miami North and Dandy but moved others the wrong way; it needs more Google data per site to fit the spread.
- *A count survey per site* (stratified PPS sample of homes by predicted time, design-based estimator; `lib/drive/survey.ts`, `scripts/qa_drive_survey_sim.ts`): at 90 homes per site and direction it pins the 10-minute count only to +-20-30% and under-covers, so it can't beat the range below without far more lookups.

**90% ranges** (`countRange`, one shared function; model in `data/drive_time_calibration.json` `rangeModel`, written by `scripts/qa_drive_accuracy.ts --write-range-model`). Each population and K-8 count shows a 90% range that combines, as independent errors on the log scale:
- *Measured site*: the fit's resampling spread (400 seeded resamples), the model error tau (floored at 10% because only five independent sites check it), centered on the measured bias (5 minutes: +22%; 10 minutes: none).
- *Estimate*: the 5th-95th percentile of leave-one-site-out errors for its state (10 minutes: Florida -62% to +92%, New Jersey -31% to +59%).
- *Census*: the count's ACS 90% margin of error (tract margins times shares, root-sum-of-squares).
Holding out each of the five independent sites in turn, the measured-site interval agreed with Google at 9 of 10 checks. Percentages and medians keep their Census margins.

**Live estimates** (pins more than 150 m from any saved site): drawn on the public FOSSGIS server at the regional cut-offs, fitted to each Google-timed home's public-server time (`public` in `data/drive_measurements.json`, `scripts/drive_public_times.ts`). Labeled "Live estimate".

**5-minute areas** hold few children and carry the widest ranges. Show them with a caveat.

### 8a. Children 5-17, five years on
Both tools show the same projection for any drive-time area (`projectChildren`, from `data/projection_parts.json`, equal to Grove's site report to 1e-9). Hamilton-Perry cohort-change ratios by single year of age from county Census estimates (July 2020-2025, gains from moves halved), on the July 2025 base, with the area's age mix and own trend shrunk toward its county's by backtested weights. Each figure shows its typical miss and a 90% band by area size from the backtest. Audit and direction check against University of Florida (BEBR), NJ Department of Labor and Census figures: `docs/qa/2026-11-11-projection-audit.md`.

### 9. Reconciliation test
Run `scripts/qa_cross_tool.ts` after any change to the engine, the census file, the saved results or either tool's area code. Pass means zero differences at displayed precision. Also: `lib/shared-geo/sync.test.ts` (Grove) and `src/shared-geo/__tests__/manifest.test.ts` (SOH) fail if a copy differs from the master.

### 10. Labels
Every figure shown or exported names its source years ("ACS 2020-24, children as of July 2025"), the time of day ("Drop-off, 8am" or "Pickup, 4pm"), and whether the site was measured or estimated.

## Open items
1. **Split Florida into Miami-Dade and Broward regions** for estimates (rule 8): the measured cut-offs split by county. Tested 2026-11-11 (`scripts/qa_drive_accuracy.ts --loo-only --split-florida`; `docs/qa/drive-loo-2026-11-11-*.csv`). Over the 7 South Florida sites, the median 10-minute miss fell from 54% to 16% (worst 139% to 36%), and at 15 minutes from 52% to 14%. Ranges spanning only the county's 2-3 sites held the count 6 times in 14, so keep the range across all Florida sites, which held it 11 times in 14. Not adopted yet. Central Florida has one measured site (Memorial, missed by 45-70%), and Palm Beach has none, so it would borrow Broward's setting.
2. **Edge-check the remaining measured sites.** Hialeah Gardens and Memorial MS haven't had homes timed at their lines (40 lookups each). Decide whether to fold the 600 Nov 10 homes into the fits for Miami North, Legacy and Dandy (they are the only independent check today).
3. **Measure more sites with Google.** 22 locations are measured (rule 8). Measuring every SOH school at drop-off takes about 35,000 lookups. Under the 4,500-a-month cap that is about 8 months of free allowance; start with the sites under active consideration.
4. **Google's terms of use (blocking more Google work).** Google's policy pages for Distance Matrix and Routes say to store results only as their terms expressly allow and not to create content based on Google Maps content; we keep Google's times and use them to adjust another engine. Distance Matrix is also a legacy product that new projects can't enable (October 2026). Needs counsel's read, or a provider licensed for stored analytics (TravelTime, HERE, TomTom, Esri).
8. **Tighter count ranges for the named schools.** Today's 90% ranges are about +-20-25% at 10 minutes for a measured school, set by model error and the Census margin (about +-12%, the floor). Timing every block near the lines with a licensed traffic provider (or Google, with counsel's OK) would remove the model error and leave about the Census margin.
9. **KIPP Paterson projection** reads +5% at 10 minutes against flat-to-down state and Census figures for Passaic, driven by a high ACS under-5 count; treat it as weak (`docs/qa/2026-11-11-projection-audit.md`).
5. **One school table with one coordinate per campus (rule 1).**
6. **Google key for Grove.** Grove's key doesn't allow the Distance Matrix API, so `drive_measure.ts` runs with the SOH tool's key, passed as GOOGLE_MAPS_API_KEY. An organization-owned key with a quota is the fix.
7. **New Jersey district schools** have no saved results yet; they use the live estimate. Add them with `--sets nj` (about 1,900 schools, roughly 40 minutes).
