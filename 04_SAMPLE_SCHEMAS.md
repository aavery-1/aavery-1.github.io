# Sample Data Schemas

Every committed sample file must follow one of these schemas exactly. The schemas match the field names and shapes of the real published sources so that swapping sample data for real data is a one-file edit inside the adapter, with no changes required in the UI or the inspector.

All coordinates are WGS84 (EPSG:4326). Longitude first in GeoJSON per the spec.

---

## `schools.sample.geojson`

Real source: FL DOE Master School ID (MSID) file plus NCES CCD/EDGE geocodes.

```jsonc
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-80.1918, 25.7617] },
      "properties": {
        "msid": "13-3001",                 // FL DOE Master School ID, string
        "name": "Miami Central Senior High School",
        "level": "High",                    // one of: Elementary | Middle | High | Combination | Adult | Other
        "type": "Traditional",              // one of: Traditional | Charter | Magnet | Virtual | Alternative | Other
        "operator": null,                   // string for charters; null for traditional
        "county": "Miami-Dade",             // one of: Miami-Dade | Broward | Orange
        "county_fips": "12086",             // 5-digit
        "board_district": "2",              // string; joined via spatial in production, but denormalized in sample
        "current_grade": "B",               // one of: A | B | C | D | F | I | NR | NG (see 03_DATA_CATALOG.md)
        "current_grade_year": "2024-2025",  // school year of current_grade
        "enrollment": 2103,                 // integer, current year; null if unknown
        "enrollment_year": "2024-2025",
        "capacity": null,                   // integer; null if unknown
        "address": "1781 NW 95th St, Miami, FL 33147",
        "geocode_source": "NCES EDGE 2023-2024" // string; provenance stamp
      }
    }
  ]
}
```

Notes:
- `current_grade` is denormalized here for MVP pin rendering. Historic grades live in `grades.sample.json`.
- Sample should include ~10 schools per county across a mix of grades (including at least one `I` and one `NR` to prove the encoding).
- All schools must fall inside their declared county polygon (validate on load).

---

## `grades.sample.json`

Real source: FL DOE School Grades files, one per school year.

```jsonc
{
  "vintage": "1999-2000 through 2024-2025",
  "formula_change_years": ["2009-2010", "2011-2012", "2014-2015", "2021-2022"],
  "schools": {
    "13-3001": [
      { "year": "2018-2019", "grade": "C" },
      { "year": "2019-2020", "grade": "NG" },  // COVID-year: many schools were NG
      { "year": "2020-2021", "grade": "NG" },
      { "year": "2021-2022", "grade": "B" },   // post-B.E.S.T. reset
      { "year": "2022-2023", "grade": "B" },
      { "year": "2023-2024", "grade": "B" },
      { "year": "2024-2025", "grade": "B" }
    ]
  }
}
```

Notes:
- Keyed by MSID. Missing year = grade unknown, not "no grade". `NG` is an explicit no-grade value.
- Sample should include at least 5 years of history per school, with at least one school spanning a formula-change year.
- Formula-change years drive the inspector's timeline dividers.

---

## `income.sample.geojson`

Real source: American Community Survey 5-year estimates (Census B19013) joined to TIGER tract polygons.

```jsonc
{
  "type": "FeatureCollection",
  "vintage": "ACS 2019-2023 (5-year)",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [ /* tract polygon */ ] },
      "properties": {
        "geoid": "12086005600",             // 11-digit tract GEOID
        "state_fips": "12",
        "county_fips": "12086",
        "tract": "0056.00",
        "median_household_income": 62340,   // integer USD; null if not published
        "moe": 4210,                        // margin of error; null if unavailable
        "population": 4108,                 // total tract population
        "school_age_population": 812        // ages 5-17 (ACS B01001 sum)
      }
    }
  ]
}
```

Notes:
- Sample should cover ~30-50 tracts across the pilot counties (enough to draw a visible choropleth but not so many the file is huge).
- `moe` is displayed on hover to warn against over-precision.
- `school_age_population` is denormalized here to enable the "population within X miles" calculation without a second data source.

---

## `board_districts.sample.geojson`

Real source: County GIS / Supervisor of Elections files (three separate sources).

```jsonc
{
  "type": "FeatureCollection",
  "vintage": "As of 2022 redistricting",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [ /* district polygon */ ] },
      "properties": {
        "county": "Miami-Dade",
        "county_fips": "12086",
        "district_number": "2",
        "member_name": null,                // string; null if the reps layer hasn't shipped
        "source": "Miami-Dade County GIS",
        "source_url": null                  // populated when real data wires in
      }
    }
  ]
}
```

Notes:
- Sample should include all districts for at least one of the three counties, to exercise the spatial join in the inspector.
- `member_name` is `null` in sample; the reps layer (P5) populates it in production.

---

## `flood.sample.geojson`

Real source: FEMA National Flood Hazard Layer (NFHL).

```jsonc
{
  "type": "FeatureCollection",
  "vintage": "NFHL as of latest county effective date",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [ /* zone polygon */ ] },
      "properties": {
        "zone_code": "AE",                  // one of: AE | VE | A | AH | AO | X | 0.2 PCT ANNUAL CHANCE | AREA NOT INCLUDED
        "subtype": "1% annual chance flood",
        "is_sfha": true,                    // Special Flood Hazard Area (regulatory floodplain)
        "bfe": 8,                           // Base Flood Elevation in feet; null if not applicable
        "source": "FEMA NFHL",
        "effective_date": "2020-09-11"
      }
    }
  ]
}
```

Notes:
- Sample should include at least one AE, one VE, and one X zone in a coastal area (Miami-Dade or Broward waterfront), plus at least one inland X zone in Orange for contrast.
- `zone_code` drives the fill color and legend chip.

---

## `isochrone.sample.geojson`

Real source: OpenRouteService (or self-hosted Valhalla) run against OSM.

```jsonc
{
  "type": "FeatureCollection",
  "vintage": "OSM snapshot YYYY-MM-DD via ORS",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [ /* isochrone polygon */ ] },
      "properties": {
        "origin_msid": "13-3001",           // school this isochrone originates from
        "origin_lon": -80.1918,
        "origin_lat": 25.7617,
        "mode": "driving",                  // driving | walking | cycling
        "minutes": 15,                      // isochrone duration
        "computed_at": "2025-11-01T14:00:00Z",
        "population_within": 142000         // area-weighted from ACS; see 05_ACCURACY_STANDARDS.md
      }
    }
  ]
}
```

Notes:
- Sample should include one 15-minute driving isochrone from one school per county.
- `population_within` is precomputed for the sample. In production, this is a stored value refreshed with the isochrone.

---

## Non-committed schemas (documented for the adapters, no sample file yet)

### Opportunity Zones (`opportunity_zones.sample.geojson`, not shipped in v1 sample)
```jsonc
{
  "properties": {
    "geoid": "12086005600",
    "designation": "2018",                  // "2018" | "2027" (post-OBBBA refresh)
    "still_active": true,                   // sunsets 12/31/2028 for 2018 designations
    "source": "U.S. Treasury / CDFI Fund"
  }
}
```

### Legislative districts (`legislative.sample.geojson`, not shipped in v1 sample)
```jsonc
{
  "properties": {
    "chamber": "SLDU",                      // "CD" | "SLDU" | "SLDL"
    "district_number": "37",
    "state": "FL",
    "current_representative": null,         // populated by reps table
    "party": null,
    "source": "TIGER/Line 2024"
  }
}
```

### Parcels (do not commit as GeoJSON at scale, see 03_DATA_CATALOG.md)

---

## Validation on load

Every adapter validates its file against its schema before rendering. On validation failure, the layer refuses to load and logs a specific error naming the field that failed. Never render partial or corrupt data as if it were real.

Minimum checks per file:
- Geometry type matches expected type
- Required properties present
- Coordinates within Florida bounding box (roughly -87.6 to -80.0 longitude, 24.5 to 31.0 latitude)
- Enumerated values (grade, level, type, zone_code) match the allowed set
- Numeric values non-negative where applicable
- All schools fall inside their declared county polygon

Failure surfaces as a layer-panel error state ("Data validation failed: see console"), not a silent drop.
