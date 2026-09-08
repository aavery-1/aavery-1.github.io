-- ============================================================================
-- Florida Schools of Hope (SOH) Site Selection Tool - PostGIS schema
-- ============================================================================
-- Target: PostgreSQL 15+ with PostGIS 3.3+.
--
-- Design notes
-- - Storage SRID is 4326 (WGS84 lon/lat) so everything ingests and serves as
--   GeoJSON/MVT without reprojection. DISTANCE and BUFFER operations must NOT
--   run in 4326 (degrees); use geography casts (::geography, meters) or a
--   projected CRS. Florida GDL Albers (EPSG:3086, meters) is the right planar
--   CRS for the 5-mile buffer - see the generated column and the notes below.
-- - Geometry types: MultiPolygon for boundaries/parcels, Point for schools.
--   Parcels and district-drawn boundaries are frequently multipart, so we do
--   not use plain Polygon anywhere a real-world source can be multipart.
-- - The legal thresholds live in `soh_config` as data, not baked into a view,
--   so a policy change (or a corrected reading of the statute) is one UPDATE,
--   not a migration. VERIFY these against F.S. 1002.333, Rule 6A-1.0998271, and
--   the 2025 General Appropriations Act expansion (as amended by the State Board
--   in Feb 2026) before relying on them. See ../SCHOOLS_OF_HOPE_LEGAL_BASIS.md
--   for the full citation trail and the source-vs-tool reconciliation.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Tunable legal / policy constants (single source of truth). One row.
-- ---------------------------------------------------------------------------
CREATE TABLE soh_config (
  id                      smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  buffer_miles            numeric  NOT NULL DEFAULT 5,       -- "within a 5-mile radius of such school"
  fur_max_pct             numeric  NOT NULL DEFAULT 75,      -- co-location if FUR < this
  surplus_seats_min       integer  NOT NULL DEFAULT 400,     -- OR surplus stations >= this
  min_facility_age_years  integer  NOT NULL DEFAULT 4,       -- co-location target must be > this many years old
  buffer_from_property    boolean  NOT NULL DEFAULT false,   -- statute says "of such school"; property-line buffer is opt-in
  notes                   text     DEFAULT 'VERIFY vs. F.S. 1002.333 / Rule 6A-1.0998271 / 2025 GAA expansion (amended Feb 2026). See SCHOOLS_OF_HOPE_LEGAL_BASIS.md.'
);
INSERT INTO soh_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- FDOR land-use codes that qualify a private parcel for the sole-occupancy
-- "fast-track" (rezoning-exempt) pathway. Stored as a lookup so the eligible
-- set is auditable and editable. CODES BELOW ARE BEST-KNOWN DOR "DOR_UC"
-- VALUES AND MUST BE VERIFIED against the current DOR Uniform Use Code table
-- and the facility types the rule actually enumerates.
-- ---------------------------------------------------------------------------
CREATE TABLE fdor_fasttrack_use_codes (
  dor_uc      char(2) PRIMARY KEY,     -- FDOR two-digit use code
  description text NOT NULL,
  verified    boolean NOT NULL DEFAULT false
);
INSERT INTO fdor_fasttrack_use_codes (dor_uc, description) VALUES
  ('71', 'Churches / religious facilities'),
  ('72', 'Private schools and colleges (colleges/universities)'),
  ('79', 'Cultural organizations / museums'),
  ('75', 'Non-profit / charitable / community service facilities'),
  ('32', 'Enclosed theaters / auditoriums / cinemas'),
  ('84', 'Colleges (public)')
ON CONFLICT DO NOTHING;
-- NOTE: libraries, community centers, and cinemas may carry different or
-- county-specific codes. Confirm each against the source county's NAL layout.

-- ---------------------------------------------------------------------------
-- All public schools (the co-location universe + PLPS live here). Point geom.
-- ---------------------------------------------------------------------------
CREATE TABLE schools (
  msid            varchar(16) PRIMARY KEY,          -- FL DOE Master School ID (district-school)
  ncessch         varchar(12),                      -- NCES 12-digit id (join to federal data)
  name            text NOT NULL,
  district        varchar(64),
  county_fips     char(5),
  level           varchar(16),                      -- Elementary/Middle/High/Combination/...
  type            varchar(16),                      -- Traditional/Charter/Magnet/...
  is_public       boolean NOT NULL DEFAULT true,
  current_grade   varchar(3),                       -- A|B|C|D|F|I|NR|NG
  grade_year      varchar(9),
  title_i         boolean,
  opened_year     integer,                          -- for the >4-year co-location criterion (null = unknown)
  geom            geometry(Point, 4326) NOT NULL
);
CREATE INDEX schools_geom_gix ON schools USING GIST (geom);
CREATE INDEX schools_county_ix ON schools (county_fips);

-- ---------------------------------------------------------------------------
-- FISH capacity + FTE enrollment, one row per school-year per school.
-- FK -> schools.msid. FUR and surplus are computed downstream (see the view).
-- ---------------------------------------------------------------------------
CREATE TABLE fish_capacity (
  id                    bigserial PRIMARY KEY,
  msid                  varchar(16) NOT NULL REFERENCES schools(msid) ON DELETE CASCADE,
  survey_year           varchar(9)  NOT NULL,       -- e.g. '2024-2025'
  permanent_capacity    integer,                    -- FISH permanent student stations
  relocatable_capacity  integer,                    -- FISH relocatable stations
  satisfactory_capacity integer NOT NULL,           -- the operative "capacity" for FUR
  fte_enrollment        integer NOT NULL,           -- current membership (FTE)
  UNIQUE (msid, survey_year)
);
CREATE INDEX fish_msid_ix ON fish_capacity (msid);

-- ---------------------------------------------------------------------------
-- Persistently Low-Performing Schools (authoritative FL DOE list). A PLPS is a
-- school; we also store its PROPERTY footprint so the 5-mile buffer can be
-- drawn from the property line (per the statute) rather than the point.
-- ---------------------------------------------------------------------------
CREATE TABLE plps (
  msid            varchar(16) PRIMARY KEY REFERENCES schools(msid) ON DELETE CASCADE,
  designated_year varchar(9) NOT NULL,
  reason          text,
  property_geom   geometry(MultiPolygon, 4326)      -- parcel footprint; null -> fall back to point
);
CREATE INDEX plps_property_gix ON plps USING GIST (property_geom);

-- ---------------------------------------------------------------------------
-- Attendance zones (local district GIS / NCES EDGE). One PLPS zone is one of
-- the three eligibility geographies.
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_zones (
  id          bigserial PRIMARY KEY,
  msid        varchar(16) REFERENCES schools(msid) ON DELETE SET NULL,
  district    varchar(64),
  level       varchar(16),
  geom        geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX attendance_zones_gix ON attendance_zones USING GIST (geom);

-- ---------------------------------------------------------------------------
-- Federally designated Florida Opportunity Zones (tract polygons).
-- ---------------------------------------------------------------------------
CREATE TABLE opportunity_zones (
  geoid       varchar(11) PRIMARY KEY,              -- 11-digit tract GEOID
  county_fips char(5),
  rural       boolean,
  geom        geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX opportunity_zones_gix ON opportunity_zones USING GIST (geom);

-- ---------------------------------------------------------------------------
-- FDOR statewide parcels (NAL + GIS). This is the large table (Miami-Dade
-- alone is ~800k rows); it is only ever queried spatially and by use code.
-- ---------------------------------------------------------------------------
CREATE TABLE parcels (
  parcel_id   varchar(30) PRIMARY KEY,              -- folio / PIN
  county_fips char(5) NOT NULL,
  dor_uc      char(2),                              -- FDOR use code (-> fdor_fasttrack_use_codes)
  owner_name  text,
  site_addr   text,
  just_value  numeric,
  land_area_sqft numeric,
  geom        geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX parcels_geom_gix ON parcels USING GIST (geom);
CREATE INDEX parcels_dor_ix   ON parcels (dor_uc);
CREATE INDEX parcels_county_ix ON parcels (county_fips);

-- ---------------------------------------------------------------------------
-- ACS 5-year tract demographics (Title I income context).
-- ---------------------------------------------------------------------------
CREATE TABLE acs_demographics (
  geoid                   varchar(11) PRIMARY KEY,
  county_fips             char(5),
  median_household_income integer,
  moe                     integer,
  school_age_population    integer,
  geom                    geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX acs_geom_gix ON acs_demographics USING GIST (geom);

-- ===========================================================================
-- Derived: the union of the three eligibility geographies. Materialized so the
-- front-end and the parcel/co-location queries hit one indexed polygon set.
-- Refresh after any ingest: REFRESH MATERIALIZED VIEW soh_eligibility_zones;
--
-- The 5-mile buffer is computed in geography (meters) for correctness, then
-- cast back to geometry(4326). 5 miles = 8046.72 meters.
-- ===========================================================================
CREATE MATERIALIZED VIEW soh_eligibility_zones AS
  SELECT 'plps_buffer'::text AS source, p.msid AS ref_id,
         ST_Multi(
           ST_Buffer(
             COALESCE(p.property_geom, s.geom)::geography,
             (SELECT buffer_miles FROM soh_config) * 1609.344
           )::geometry
         )::geometry(MultiPolygon, 4326) AS geom
  FROM plps p JOIN schools s USING (msid)
  UNION ALL
  SELECT 'attendance_zone', az.msid, az.geom
  FROM attendance_zones az
  JOIN plps p ON p.msid = az.msid
  UNION ALL
  SELECT 'opportunity_zone', oz.geoid, oz.geom
  FROM opportunity_zones oz
WITH NO DATA;
CREATE INDEX soh_eligibility_zones_gix ON soh_eligibility_zones USING GIST (geom);

-- ===========================================================================
-- Derived: co-location targets. A public school that is (a) inside an
-- eligibility zone AND (b) under-utilized per soh_config. FUR = FTE / capacity.
-- ===========================================================================
CREATE OR REPLACE VIEW soh_colocation_targets AS
  WITH cfg AS (SELECT * FROM soh_config WHERE id = 1),
  util AS (
    SELECT f.msid, f.survey_year, f.satisfactory_capacity, f.fte_enrollment,
           ROUND(100.0 * f.fte_enrollment / NULLIF(f.satisfactory_capacity, 0), 1) AS fur_pct,
           (f.satisfactory_capacity - f.fte_enrollment) AS surplus_seats
    FROM fish_capacity f
  )
  SELECT s.msid, s.name, s.district, s.county_fips, s.geom,
         u.survey_year, u.fur_pct, u.surplus_seats
  FROM schools s
  JOIN util u USING (msid)
  CROSS JOIN cfg
  WHERE s.is_public
    AND (u.fur_pct < cfg.fur_max_pct OR u.surplus_seats >= cfg.surplus_seats_min)
    -- Feb 2026 rule: brand-new facilities are excluded (> 4 years old). Unknown
    -- opened_year is left in rather than silently dropped; verify per school.
    AND (s.opened_year IS NULL
         OR (EXTRACT(YEAR FROM CURRENT_DATE) - s.opened_year) > cfg.min_facility_age_years)
    AND EXISTS (
      SELECT 1 FROM soh_eligibility_zones z
      WHERE ST_Intersects(z.geom, s.geom)
    );

-- ===========================================================================
-- Derived: sole-occupancy (fast-track) candidate parcels. A private parcel in
-- an eligibility zone whose DOR use code is on the fast-track list.
-- ===========================================================================
CREATE OR REPLACE VIEW soh_soleoccupancy_parcels AS
  SELECT pa.parcel_id, pa.county_fips, pa.dor_uc, fc.description AS use_type,
         pa.owner_name, pa.site_addr, pa.just_value, pa.geom
  FROM parcels pa
  JOIN fdor_fasttrack_use_codes fc ON fc.dor_uc = pa.dor_uc
  WHERE EXISTS (
    SELECT 1 FROM soh_eligibility_zones z
    WHERE ST_Intersects(z.geom, pa.geom)
  );
