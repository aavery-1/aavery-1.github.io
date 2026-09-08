# Data Catalog

Pilot counties: Miami-Dade, Broward, Orange. This catalog names datasets and publishers rather than deep URLs. It reflects Claude's knowledge through roughly January 2026 with no live web access. **Confirm URLs, current pricing, free-tier quotas, and continued availability before scoping or committing budget.**

A spreadsheet version is included as `FL_school_facilities_data_catalog.xlsx`. Field-level schemas for each committed sample file are in `04_SAMPLE_SCHEMAS.md`.

## Layer inventory

| Layer | Phase | Source | Publisher | Access | Format | Resolution | Join key | Refresh | Cost |
|---|---|---|---|---|---|---|---|---|---|
| Base map + imagery | MVP | Google Maps Platform (Maps JS API; satellite/hybrid) | Google | API key | Tiles | Basemap | spatial | Continuous | Metered (see cost notes) |
| School locations | MVP | Master School ID (MSID) file; NCES CCD/EDGE geocodes | FL DOE (+NCES) | Download | XLS/CSV to points | Point (school) | MSID | Annual | Free |
| School letter grades (historic) | MVP | School Grades files, by year (roughly 1999 to present) | FL DOE (Accountability) | Download | XLS/XLSX | Point (school) | MSID | Annual (fall) | Free |
| Household income + demographics | MVP | ACS 5-year estimates | U.S. Census Bureau | API (free key) + TIGER | JSON + shapefile | Block group / tract | GEOID | Annual | Free |
| School board member districts | MVP | County GIS / Supervisor of Elections files | Miami-Dade, Broward, Orange | Download | shapefile/GeoJSON | Polygon | spatial | Per redistricting | Free |
| Flood zones | P1 | National Flood Hazard Layer (NFHL) | FEMA | Download / WMS | shapefile/WMS/tiles | Polygon | spatial | Periodic | Free |
| Drive-time reach (isochrones) | P2 | OSM via OpenRouteService or self-hosted Valhalla/pgRouting | ORS / OSM | Hosted (see quota note) or self-host | GeoJSON polygon | Polygon | spatial | On demand, cache | See cost notes |
| Births | P3 | FLHealthCHARTS (Vital Statistics) | FL Dept. of Health | Web query / CSV | Tabular | County | County FIPS | Annual | Free |
| Migration | P3 | County-to-county migration (IRS SOI) or ACS flows | IRS / Census | Download | CSV | County | County FIPS | Annual | Free |
| Opportunity Zones | P4 | Designated QOZ tracts | U.S. Treasury / CDFI Fund | Download | shapefile | Tract | GEOID | See OZ notes | Free |
| Legislative districts | P5 | TIGER/Line CD + SLDU + SLDL; FL redistricting | Census / FL Legislature | Download | shapefile | Polygon | spatial | Per redistricting | Free |
| Representatives | P5 | OpenStates (state) + Congress data (federal); Cicero for one-stop | OpenStates / others | API | Tabular | keyed to district | District ID | After elections | Free to paid |
| Parcels (optional) | Opt. | County Property Appraiser parcel files (three separate) | Miami-Dade, Broward, Orange PAs | Download | shapefile/GeoJSON | Parcel | folio | Varies | Free (but see scale note) |

## Cost notes (verify before committing budget)

**Google Maps Platform.** Pricing changed materially in early 2025 (session-based Map Loads billing, deprecation of the previous per-tile model). For an internal analyst tool with a handful of users, expect low four-figure monthly cost at most; the monthly platform credit may fully cover it. **Get a current quote before onboarding a paying customer's key**. Set up budget alerts and quota caps day one.

**OpenRouteService free tier.** The free tier is roughly 40 isochrone requests per day per key, and 500 directions requests. Three counties with hundreds of schools cannot backfill isochrones inside that quota in a reasonable timeframe. **Two viable paths:**
1. Precompute isochrones for a subset (e.g. 50 top-priority sites), commit as GeoJSON, refresh manually.
2. Self-host Valhalla against OSM. Cheap on a small VM. This is the answer if the tool grows.

Do not plan the P2 launch around free-tier ORS at scale.

## Data caveats and gotchas

**School grades: multiple era breaks, not one.** Florida revised its school-grading formula around 2010, 2012, 2015, and again in 2022 (baseline reset for the B.E.S.T. standards transition). Grades are not cleanly comparable across any of these breaks. In the inspector timeline: show a subtle vertical divider at each break year with a hover note. **Never draw a single continuous trend line across all years.**

**Grade domain includes more than A-F.** FL DOE issues:
- A, B, C, D, F: standard letter grades
- **I** (Incomplete): assigned when a school did not meet minimum participation requirements for grading
- **NR** (Not Rated): specific school types (some alternative schools, ESE centers, adult schools) are not rated
- **NG** (No Grade): schools too new to have a full year of data, or otherwise ungraded

Any validator that rejects rows outside {A,B,C,D,F} drops real schools. Validate against the full set above.

**ACS margins of error.** Block-group estimates are noisy. Prefer tract level for any single value shown to the analyst in the inspector. For choropleth display, block group is fine at close zoom.

**Three-in-one layers.** Board districts and parcels are three separate county sources each. There is no single feed. Every county has its own portal, schema, and refresh cadence. Plan one adapter per county per layer, not one adapter per layer.

**Representatives data.** Google Civic Information API's representatives endpoint is on a deprecation path (VERIFY). At a 3-county scope, a manually maintained representatives table refreshed after each election is a viable, cheap alternative. OpenStates provides state-level data reliably; Congress.gov and Clerk of the House provide federal.

**Geocoding.** Use the free U.S. Census Geocoder or Nominatim (OSM) to avoid Google geocoding charges. Prefer NCES EDGE authoritative coordinates when available. NCES EDGE lags 1 to 2 years behind reality; schools opened in the last cycle may need address geocoding fallback. This matters especially for this tool, which is about siting new schools; the newest schools have the worst geocode data.

**Opportunity Zones.** The 2018 designations are static and remain in effect through 12/31/2028 for tax-benefit purposes. The 2025 One Big Beautiful Bill Act (OBBBA) reauthorized the program with new tract designations taking effect in 2027. **Verify current status before shipping the P4 layer.** Plan to swap the designated-tract file when the new designations publish.

**Licensing.** OSM-derived data (routing, some geocoding) requires ODbL attribution. Google terms prohibit caching or exporting Google tiles beyond ordinary browser display. All Census data is public domain.

**Parcels: not a "commit as GeoJSON" layer.** Miami-Dade alone has roughly 800,000 parcels. Broward and Orange are similar order-of-magnitude. Parcel data does not fit the sample-GeoJSON pattern the other layers use. If you build P-optional parcels, plan for PostGIS storage and vector tiles from day one. This is the reason parcels stays optional.

## Join keys, nail these early

- Schools → **MSID** (FL DOE Master School ID, unique per school)
- Census layers (income, tracts, OZ) → **GEOID** (Census 12-digit geographic identifier)
- County data (births, migration) → **county FIPS** (5-digit)
- Parcels → **folio** (per-county unique parcel identifier)
- Boundary layers (flood, board districts, legislative) → **spatial point-in-polygon**

Fuzzy keys create silent mismatches that no one can debug later. Use canonical identifiers only.

## Region generalization

The pilot is 3 counties. The first expansion request will almost certainly be Palm Beach, Hillsborough, or Duval. Layers that carry a canonical statewide join key (MSID for schools, GEOID for Census) generalize with zero adapter work. Layers that are per-county (board districts, parcels, some Supervisor-of-Elections files) require a new per-county adapter for every new county added. Budget for this friction in expansion planning.

## Verification list

Before committing budget or scheduling launch, verify:
- Google Maps Platform current pricing and monthly credit
- Representatives data source (Google Civic deprecation status)
- Opportunity Zone program status (2018 designations vs 2027 refresh)
- FLHealthCHARTS export path (portal changes are common)
- Each county's board-district and parcel file location and format
- OpenRouteService free-tier quota (or commit to self-hosted Valhalla)
