# Shared geo rules: Grove and the SOH siting tool

Adopted 2026-11-10; exact match in place 2026-11-11; saved results for every school, our own routing server and 80% ranges 2026-11-11. This file lives in Grove (`platform/docs/methods/geo-ruleset.md`, the master). `scripts/sync-shared-geo.mjs` copies it to the SOH siting tool as `GEO_RULESET.md`, along with the shared engine and its data.

**Goal:** the same site, the same area and the same question give the same number in both tools, and that number matches the real world as closely as we can show.

## How the match is guaranteed

| What | Where it lives | How the SOH tool gets it | Check |
|---|---|---|---|
| All geo and census math, and the drive-time engine | `lib/shared-geo/sharedGeo.ts` (one file, no imports) | Byte-identical copy at `src/shared-geo/sharedGeo.ts` | SHA-256 fingerprints, tested in both repositories |
| Every populated 2020 block and the tract figures | `data/census_sites.json` | `npm run data:poppoints` rebuilds `population_points.json` from it, through the shared engine | Exact ring test in SOH |
| Saved drive-time results (every school, both times of day) | `data/drive/` (index plus one file per site) | Copy at `public/data/drive/` | One tree fingerprint over every file |
| Live-estimate calibration (pins with no saved result) | `data/drive_time_calibration.json` | Copy at `src/config/drive_time_calibration.json` | Fingerprints |
| This ruleset | `docs/methods/geo-ruleset.md` | Copy at `GEO_RULESET.md` | Fingerprints |

After changing any of these in Grove, run `node scripts/sync-shared-geo.mjs` (and `npm run data:poppoints && npm run data:demographics` in SOH if the census file changed). Then run `scripts/qa_cross_tool.ts`. Both repositories run their tests on every pull request (`.github/workflows/checks.yml`).

**Proof, 2026-11-11.** `scripts/qa_cross_tool.ts` ran each tool's own code path on 10 Florida sites:
- 7 measured sites at drop-off and pickup
- 3 unmeasured schools on the shared estimate
- a 2-mile radius at each site

It compared people, K-8 children, % Black, % Hispanic and median income in every area: **350 figures, 0 differences** (`docs/qa/cross-tool-check.csv`). In the browser, William Dandy MS showed the same figures in both apps; at 10 minutes, drop-off, both showed 56,893 people and 6,968 K-8 children.

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
**Definition.** A home is within N minutes if Google Maps predicts N minutes or less on a school-day Tuesday.
- **Drop-off** (default): home to campus, leaving 8:00am.
- **Pickup**: campus to home, leaving 4:00pm.

These are the only two times either tool offers.

**How a home is counted.** Every populated 2020 block is timed to (or from) the campus on OpenStreetMap roads (Valhalla). It is inside a ring when its time is at or under that ring's *cut-off*: the Valhalla minutes that equal N Google minutes for that site and time of day.

**Saved results, for every school and campus** (`scripts/drive_precompute.ts`, `data/drive/`). These are worked out ahead of time on our own routing server (`docs/runbooks/routing-server.md`): Valhalla 3.9.1 on Geofabrik extracts of Florida, New Jersey and Pennsylvania dated 2026-11-08, with the standard default-speeds table. So a school's numbers don't depend on the public server, and change only when we rebuild on purpose. Each result records the road data it used. A pin within 150 m of a saved site uses that site's result.
- **Measured sites** (`scripts/drive_measure.ts`, raw times in `data/drive_measurements.json`). 30 homes where children live (five distance bands with equal numbers of children, six homes each, a seeded draw) are timed by Google with predicted traffic. The precompute re-times those homes on our server and fits Google = a + b x Valhalla for the site and time of day. The cut-off is (N - a) / b.
- **All other schools** (labeled "Estimate"). The cut-off is the median of the measured sites' cut-offs in the region (Florida; Newark and Paterson; Camden).
- **A range on every count.** It is the same population figure counted under a low and a high cut-off. It covers the uncertainty in the drive time, not the census margin of error, which is shown separately.
  - Measured site: an 80% range, the 10th to 90th percentile of the cut-off over 400 seeded resamples of its 30 homes.
  - Estimate: the full spread of the region's measured sites. In the leave-one-site-out check it held the site's measured count at about 3 sites in 4. The 10th to 90th percentile held it at only 6 in 10, so estimates aren't given an 80% label.

Measured 2026-11-10/11, both times of day:
- Florida: KIPP Miami North, KIPP Legacy, William Dandy MS, Carol City MS, Hialeah Gardens MS, Lauderdale Lakes MS, Memorial MS.
- New Jersey: 14 KIPP Newark, Camden and Paterson campus locations, covering all 15 campuses. Paterson MS shares Paterson ES's result; they're 145 m apart.

Fits ran from 0.7x to 1.5x our server's time by site, which is why one regional number can't be exact. Measuring a site costs 30 Google lookups. `drive_measure.ts` logs them by month in `data/google_usage.json` and stops before the month passes the cap (4,500 by default).

**Accuracy** (`scripts/qa_drive_accuracy.ts`, 2026-11-11, `docs/qa/drive-accuracy-2026-11-11.csv`):
- *Against Google, out of sample.* 600 homes were timed independently by Google on 2026-11-10 at 5 Florida sites (drop-off). None of them were used in the fits.
  - Homes: 96% of sampled children live on the same side of each line as Google puts them.
  - Counts: the measured count's range overlapped the sample's 95% interval in 14 of 15 site-and-ring checks.
  - The miss was KIPP Miami North at 10 minutes: 2,759 (range 1,589-3,919) against Google's 5,550 (4,238-6,863). Few homes lie near its 10-minute line, and its 30 timed homes are all farther out. A count is most fragile where many children live right at the line.
  - At 10 minutes, measured counts ran from 50% under to 14% over the sample's estimate (Dandy: 7,244 against 7,734).
- *Estimates, leave one site out.* Each measured site was worked out as if it hadn't been measured. At 10 and 15 minutes the median miss was 35%, and 80% of sites were within 77% (10 minutes) and 63% (15 minutes). At 5 minutes the median miss was 57%. Treat an estimate as a rough guide and measure any site a decision rests on.
- *Routing setup.* Our server and the public one fit Google equally well out of sample: a typical miss of 2.15 minutes for one home on both, and 21 versus 19 of 600 homes on the wrong side of 10 minutes.

**Live estimates** (pins more than 150 m from any saved site, such as a dropped pin). These are drawn on the public FOSSGIS server as outlines at the regional cut-offs (central, low and high), counted block by block. The public server's street speeds differ from ours, so its cut-offs come from the same measured sites fitted to the public server's own times, recorded when they were measured (`data/drive_time_calibration.json`). Both tools label these "Live estimate".

**5-minute areas** hold few children, and their ranges are wide. Show them with a caveat.

### 9. Reconciliation test
Run `scripts/qa_cross_tool.ts` after any change to the engine, the census file, the saved results or either tool's area code. Pass means zero differences at displayed precision. Also: `lib/shared-geo/sync.test.ts` (Grove) and `src/shared-geo/__tests__/manifest.test.ts` (SOH) fail if a copy differs from the master.

### 10. Labels
Every figure shown or exported names its source years ("ACS 2020-24, children as of July 2025"), the time of day ("Drop-off, 8am" or "Pickup, 4pm"), and whether the site was measured or estimated.

## Open items
1. **Better samples at measured sites.** Choose the 30 Google homes near each ring's line rather than evenly by distance, or time more of them. Folding the 600 homes Google timed on 2026-11-10 into those 5 sites' fits costs nothing.
2. **Measure more sites with Google.** 21 locations are measured (rule 8). Measuring every SOH school at drop-off takes about 35,000 lookups. Under the 4,500-a-month cap that is about 8 months of free allowance; start with the sites under active consideration.
3. **Google's terms of use.** We keep Google's times indefinitely and use them to adjust another routing engine. This needs a legal review before wider use.
4. **One school table with one coordinate per campus (rule 1).**
5. **Google key for Grove.** Grove's key doesn't allow the Distance Matrix API, so `drive_measure.ts` runs with the SOH tool's key, passed as GOOGLE_MAPS_API_KEY. An organization-owned key with a quota is the fix.
6. **New Jersey district schools** have no saved results yet; they use the live estimate. Add them with `--sets nj` (about 1,900 schools, roughly 40 minutes).
