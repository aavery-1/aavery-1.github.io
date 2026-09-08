// Fail-loud schema validators. Every adapter runs its file through the matching
// validator before rendering. On failure the validator throws a specific error
// naming the field that failed, and the layer refuses to load. We never render
// partial or corrupt data as if it were real, and we never silently drop a row.
//
// These functions are pure (they take already-parsed JSON), so the app runtime
// and the schema tests share exactly the same validation logic.

import { booleanPointInPolygon } from "@turf/turf";
import {
  SCHOOL_LEVELS,
  SCHOOL_TYPES,
  type SchoolCollection,
  type GradesFile,
  type IncomeCollection,
  type BoardDistrictCollection,
  type IsochroneCollection,
  type CountyName,
  type PopulationGrowthCollection,
  type OpportunityZoneCollection,
  type LegislativeCollection,
} from "./types";
import { GRADE_DOMAIN } from "../map/gradeEncoding";
import { isInFloridaBbox, countyPolygon } from "../geo/countyBounds";

export class SchemaError extends Error {
  constructor(file: string, field: string, detail: string) {
    super(`Data validation failed in ${file}: field "${field}" ${detail}. See console and 04_SAMPLE_SCHEMAS.md.`);
    this.name = "SchemaError";
  }
}

function requireFeatureCollection(file: string, data: unknown): asserts data is { features: unknown[] } {
  if (!data || typeof data !== "object") throw new SchemaError(file, "<root>", "is not an object");
  const d = data as Record<string, unknown>;
  if (d.type !== "FeatureCollection") throw new SchemaError(file, "type", 'is not "FeatureCollection"');
  if (!Array.isArray(d.features)) throw new SchemaError(file, "features", "is not an array");
}

function checkCoord(file: string, lon: number, lat: number, field: string) {
  if (typeof lon !== "number" || typeof lat !== "number") throw new SchemaError(file, field, "has non-numeric coordinates");
  if (!isInFloridaBbox(lon, lat)) throw new SchemaError(file, field, `[${lon}, ${lat}] is outside the Florida bounding box`);
}

// Every polygon vertex must sit inside the Florida bounding box.
function checkPolygonInFlorida(file: string, coords: number[][][], field: string) {
  for (const ring of coords) {
    for (const [lon, lat] of ring) {
      checkCoord(file, lon, lat, field);
    }
  }
}

// Accepts a Polygon or MultiPolygon and validates every vertex is in Florida.
// Authoritative TIGER/HUD boundaries include MultiPolygons (barrier islands,
// water-split tracts), so the real-data layers cannot assume a single Polygon.
function checkAreaInFlorida(file: string, geom: unknown, field: string): "Polygon" | "MultiPolygon" {
  const g = geom as { type?: string; coordinates?: unknown };
  if (g?.type === "Polygon") {
    checkPolygonInFlorida(file, g.coordinates as number[][][], field);
    return "Polygon";
  }
  if (g?.type === "MultiPolygon") {
    for (const poly of g.coordinates as number[][][][]) checkPolygonInFlorida(file, poly, field);
    return "MultiPolygon";
  }
  throw new SchemaError(file, field, "is not a Polygon or MultiPolygon");
}

export function validateSchools(data: unknown, file = "schools.sample.geojson"): SchoolCollection {
  requireFeatureCollection(file, data);
  const fc = data as SchoolCollection;
  const seen = new Set<string>();
  fc.features.forEach((f, i) => {
    const where = `features[${i}]`;
    if (f.geometry?.type !== "Point") throw new SchemaError(file, `${where}.geometry`, "is not a Point");
    const [lon, lat] = f.geometry.coordinates as [number, number];
    checkCoord(file, lon, lat, `${where}.geometry.coordinates`);
    const p = f.properties;
    if (!p) throw new SchemaError(file, `${where}.properties`, "is missing");
    for (const req of ["msid", "name", "level", "type", "county", "county_fips", "current_grade", "current_grade_year", "address", "geocode_source"]) {
      if (p[req as keyof typeof p] == null) throw new SchemaError(file, `${where}.${req}`, "is required but missing");
    }
    if (seen.has(p.msid)) throw new SchemaError(file, `${where}.msid`, `duplicate MSID "${p.msid}"`);
    seen.add(p.msid);
    if (!(GRADE_DOMAIN as readonly string[]).includes(p.current_grade)) throw new SchemaError(file, `${where}.current_grade`, `"${p.current_grade}" is outside {${GRADE_DOMAIN.join(", ")}}`);
    if (!(SCHOOL_LEVELS as readonly string[]).includes(p.level)) throw new SchemaError(file, `${where}.level`, `"${p.level}" is not an allowed level`);
    if (!(SCHOOL_TYPES as readonly string[]).includes(p.type)) throw new SchemaError(file, `${where}.type`, `"${p.type}" is not an allowed type`);
    if (p.enrollment != null && (typeof p.enrollment !== "number" || p.enrollment < 0)) throw new SchemaError(file, `${where}.enrollment`, "is negative or non-numeric");
    if (p.capacity != null && (typeof p.capacity !== "number" || p.capacity < 0)) throw new SchemaError(file, `${where}.capacity`, "is negative or non-numeric");
    // Every school must fall inside its declared county polygon.
    const county = p.county as CountyName;
    if (!(county in { "Miami-Dade": 1, Broward: 1, Orange: 1 })) throw new SchemaError(file, `${where}.county`, `"${county}" is not a pilot county`);
    if (!booleanPointInPolygon([lon, lat], countyPolygon(county))) {
      throw new SchemaError(file, `${where}.geometry`, `school "${p.name}" at [${lon}, ${lat}] is not inside its declared county (${county})`);
    }
  });
  return fc;
}

export function validateGrades(data: unknown, file = "grades.sample.json"): GradesFile {
  if (!data || typeof data !== "object") throw new SchemaError(file, "<root>", "is not an object");
  const d = data as GradesFile;
  if (!Array.isArray(d.formula_change_years)) throw new SchemaError(file, "formula_change_years", "is not an array");
  if (!d.schools || typeof d.schools !== "object") throw new SchemaError(file, "schools", "is missing or not an object");
  for (const [msid, history] of Object.entries(d.schools)) {
    if (!Array.isArray(history)) throw new SchemaError(file, `schools.${msid}`, "is not an array");
    history.forEach((entry, i) => {
      if (!entry.year) throw new SchemaError(file, `schools.${msid}[${i}].year`, "is missing");
      if (!(GRADE_DOMAIN as readonly string[]).includes(entry.grade)) throw new SchemaError(file, `schools.${msid}[${i}].grade`, `"${entry.grade}" is outside the grade domain`);
    });
  }
  return d;
}

export function validateIncome(data: unknown, file = "income.sample.geojson"): IncomeCollection {
  requireFeatureCollection(file, data);
  const fc = data as IncomeCollection;
  fc.features.forEach((f, i) => {
    const where = `features[${i}]`;
    if (f.geometry?.type !== "Polygon") throw new SchemaError(file, `${where}.geometry`, "is not a Polygon");
    checkPolygonInFlorida(file, f.geometry.coordinates as number[][][], `${where}.geometry`);
    const p = f.properties;
    if (!p?.geoid) throw new SchemaError(file, `${where}.geoid`, "is required but missing");
    if (p.median_household_income != null && (typeof p.median_household_income !== "number" || p.median_household_income < 0)) {
      throw new SchemaError(file, `${where}.median_household_income`, "is negative or non-numeric");
    }
    if (typeof p.population !== "number" || p.population < 0) throw new SchemaError(file, `${where}.population`, "is negative or non-numeric");
    if (typeof p.school_age_population !== "number" || p.school_age_population < 0) throw new SchemaError(file, `${where}.school_age_population`, "is negative or non-numeric");
  });
  return fc;
}

export function validateBoardDistricts(data: unknown, file = "board_districts.sample.geojson"): BoardDistrictCollection {
  requireFeatureCollection(file, data);
  const fc = data as BoardDistrictCollection;
  fc.features.forEach((f, i) => {
    const where = `features[${i}]`;
    if (f.geometry?.type !== "Polygon") throw new SchemaError(file, `${where}.geometry`, "is not a Polygon");
    checkPolygonInFlorida(file, f.geometry.coordinates as number[][][], `${where}.geometry`);
    const p = f.properties;
    if (!p?.district_number) throw new SchemaError(file, `${where}.district_number`, "is required but missing");
    if (!p?.county) throw new SchemaError(file, `${where}.county`, "is required but missing");
  });
  return fc;
}

export function validatePopulationGrowth(data: unknown, file = "population_growth.geojson"): PopulationGrowthCollection {
  requireFeatureCollection(file, data);
  const fc = data as PopulationGrowthCollection;
  fc.features.forEach((f, i) => {
    const where = `features[${i}]`;
    checkAreaInFlorida(file, f.geometry, `${where}.geometry`);
    const p = f.properties;
    if (!p?.county) throw new SchemaError(file, `${where}.county`, "is required but missing");
    if (typeof p.growth_rate !== "number") throw new SchemaError(file, `${where}.growth_rate`, "is non-numeric");
    if (typeof p.pop_2024 !== "number" || p.pop_2024 < 0) throw new SchemaError(file, `${where}.pop_2024`, "is negative or non-numeric");
  });
  return fc;
}

export function validateOpportunityZones(data: unknown, file = "opportunity_zones.geojson"): OpportunityZoneCollection {
  requireFeatureCollection(file, data);
  const fc = data as OpportunityZoneCollection;
  fc.features.forEach((f, i) => {
    const where = `features[${i}]`;
    checkAreaInFlorida(file, f.geometry, `${where}.geometry`);
    const p = f.properties;
    if (!p?.geoid) throw new SchemaError(file, `${where}.geoid`, "is required but missing");
    if (p.designated !== true) throw new SchemaError(file, `${where}.designated`, "must be true (file lists designated tracts only)");
  });
  return fc;
}

export function validateLegislative(data: unknown, file = "legislative.geojson"): LegislativeCollection {
  requireFeatureCollection(file, data);
  const fc = data as LegislativeCollection;
  const chambers = new Set(["CD", "SLDU", "SLDL"]);
  fc.features.forEach((f, i) => {
    const where = `features[${i}]`;
    checkAreaInFlorida(file, f.geometry, `${where}.geometry`);
    const p = f.properties;
    if (!chambers.has(p?.chamber)) throw new SchemaError(file, `${where}.chamber`, `"${p?.chamber}" is not CD/SLDU/SLDL`);
    if (!p?.district_number) throw new SchemaError(file, `${where}.district_number`, "is required but missing");
  });
  return fc;
}

export function validateIsochrones(data: unknown, file = "isochrone.sample.geojson"): IsochroneCollection {
  requireFeatureCollection(file, data);
  const fc = data as IsochroneCollection;
  fc.features.forEach((f, i) => {
    const where = `features[${i}]`;
    if (f.geometry?.type !== "Polygon") throw new SchemaError(file, `${where}.geometry`, "is not a Polygon");
    checkPolygonInFlorida(file, f.geometry.coordinates as number[][][], `${where}.geometry`);
    const p = f.properties;
    if (!p?.origin_msid) throw new SchemaError(file, `${where}.origin_msid`, "is required but missing");
    if (typeof p.minutes !== "number" || p.minutes <= 0) throw new SchemaError(file, `${where}.minutes`, "is not a positive number");
    if (typeof p.population_within !== "number" || p.population_within < 0) throw new SchemaError(file, `${where}.population_within`, "is negative or non-numeric");
  });
  return fc;
}
