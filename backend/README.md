# SOH site-selection backend (PostGIS + Python)

This is the server-side layer that `06_ARCHITECTURE.md` describes as "documented,
not built." It holds the large geospatial datasets, runs the legal eligibility
logic, and serves the front-end. The existing React/deck.gl app in `src/` is the
client; nothing here changes that client's adapter contract.

## What is here

| File | Deliverable | Purpose |
|---|---|---|
| `schema.sql` | PostGIS schema | Tables, geometry columns, indexes, FKs, and the derived eligibility/co-location/parcel views. |
| `spatial_join.py` | GeoPandas join | 5-mile PLPS buffer -> parcels-in-buffer -> fast-track use-code filter. |
| `capacity.py` | FUR function | Facility Utilization Rate + mandatory co-location eligibility. |
| `load_from_public_data.py` | DB seeder | Loads the already-fetched `public/data/` files into PostGIS (no re-download). |
| `requirements.txt` | deps | Python env for the scripts + PostGIS loaders. |

Legal accuracy is governed by [`../SCHOOLS_OF_HOPE_LEGAL_BASIS.md`](../SCHOOLS_OF_HOPE_LEGAL_BASIS.md),
which reconciles every encoded threshold against F.S. 1002.333, Rule
6A-1.0998271, and the 2025 GAA expansion (amended Feb 2026).

## Quick start

```bash
# 1. database
createdb soh && psql soh -f schema.sql

# 2. python env
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

# 3. seed from the data the front-end already fetched (no re-download)
python load_from_public_data.py --dry-run          # validate parsing first
SOH_DATABASE_URL=postgresql:///soh python load_from_public_data.py

# 4. run the parcel eligibility join on real FDOR/PLPS downloads
python spatial_join.py --plps data/plps.shp --parcels data/fdor_parcels.shp \
                       --out data/soh_candidate_parcels.gpkg

# 5. co-location eligibility (importable; smoke test built in)
python capacity.py
```

## Authoritative data sources (download targets)

- **PLPS_List** - FL DOE (Persistently Low-Performing Schools).
- **School_Attendance_Boundaries** - local district GIS / NCES EDGE (SABS).
- **FL_Opportunity_Zones** - FloridaCommerce / U.S. Treasury CDFI Fund.
- **FISH_Capacity_Database** - FL DOE Office of Educational Facilities (FISH).
  Already wired: `npm run data:fish` parses the FISH `FacilityData` sheet into
  `public/data/fish_capacity.json` (592 schools, matched by name within
  district); `load_from_public_data.py` seeds `fish_capacity` from it, joining
  real NCES enrollment for the FTE side of the utilization rate.
- **FDOR_Statewide_Parcels** - FL Dept. of Revenue NAL + GIS (per county).
- **ACS_5YR_Demographics** - U.S. Census Bureau (Title I income context).

The front-end already ships REAL Opportunity Zones (HUD/Treasury) and Census
data via `scripts/fetch-real-layers.mjs`; those same outputs can seed
`opportunity_zones` and `acs_demographics` here rather than re-downloading.

## CRS discipline (important)

Store everything in **EPSG:4326** for ingest and MVT/GeoJSON serving. Do every
**distance or buffer** in a meter-based projection - **EPSG:3086 (Florida GDL
Albers)**. Buffering in 4326 (degrees) makes a "5-mile" radius wrong by a large,
latitude-dependent margin. `schema.sql` casts to `geography` for the buffer;
`spatial_join.py` reprojects to 3086. Do not mix these up.

## Legal constants must be verified

The thresholds and code lists are **configurable, not settled law**. Confirm
against **F.S. 1002.333**, **Rule 6A-1.0998271**, and the **2025 General
Appropriations Act** expansion (amended by the State Board Feb 2026) before
production use. Full citation trail: [`../SCHOOLS_OF_HOPE_LEGAL_BASIS.md`](../SCHOOLS_OF_HOPE_LEGAL_BASIS.md).
The original "SB 2510 (2025)" reference was a misattribution; the 2025 change
came through the GAA, not a bill by that number.

- `buffer_miles = 5`, and whether it is measured from the **property line** vs.
  the school point (`soh_config.buffer_from_property`).
- `fur_max_pct = 75` and `surplus_seats_min = 400`, and whether "capacity" means
  FISH **satisfactory** vs. **permanent** stations.
- `fdor_fasttrack_use_codes` - the enumerated exempt facility types mapped to the
  current **DOR Uniform Use Code** table. The seeded codes are best-known values
  flagged `verified = false`; a GIS analyst should confirm each per county NAL.

## #4 - Front-end mapping stack recommendation

Short version: **you have already made the right call.** `package.json` uses
`@deck.gl/core`, `@deck.gl/layers`, and `@deck.gl/google-maps` - deck.gl renders
on the GPU and is the only one of the common options that draws hundreds of
thousands of parcels smoothly.

Recommended shape for this data:

- **Large polygon layers (parcels, attendance zones): vector tiles, not GeoJSON.**
  Serve MVT straight from PostGIS with **Martin** or **pg_tileserv**, and render
  with deck.gl's **`MVTLayer`**. A statewide parcel layer must never be a
  committed GeoJSON (Miami-Dade alone is ~800k parcels); the layer's high
  `minZoom` already guards against loading it at county view.
- **Small computed layers (5-mile buffers, PLPS pins, co-location targets):**
  deck.gl **`GeoJsonLayer` / `ScatterplotLayer`** from a plain GeoJSON endpoint,
  exactly as the current adapters do.
- **Static, rarely-changing large layers:** pre-bake tiles with **Tippecanoe**
  and serve as `.pmtiles` / an MVT directory.
- **Base map:** keep Google (already wired) or, to go fully open-source, pair
  deck.gl with **MapLibre GL JS** (the token-free MapLibre fork) via
  `@deck.gl/mapbox`.

Not recommended here: **Leaflet** (DOM/Canvas, no GPU - fine for a few hundred
features, not for statewide parcels). **Mapbox GL JS** is capable but adds a
token/licensing dependency that MapLibre avoids, and deck.gl already owns the
data-heavy rendering either way.
