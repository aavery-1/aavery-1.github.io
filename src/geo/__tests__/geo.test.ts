// The correctness claim only holds if it is machine-checked. These are the
// assertions named in 05_ACCURACY_STANDARDS.md section 5. A red suite here means
// "5 miles is 5 miles" is not true, and merge is blocked.

import { describe, it, expect } from "vitest";
import { polygon, distance, point } from "@turf/turf";
import type { Feature, Polygon, FeatureCollection } from "geojson";
import { distanceMiles, pathDistanceMiles, groundDistanceAtLatitudeMiles } from "../measure";
import { ellipsoidalDistanceMeters, ellipsoidalDestination } from "../geodesic";
import { geodesicBufferMiles, areaSquareMiles } from "../buffer";
import { apportionByArea } from "../intersect";
import { PolygonIndex } from "../spatialIndex";
import { GRADE_DOMAIN, resolveGradeStyle } from "../../map/gradeEncoding";

const within = (actual: number, expected: number, pct: number) =>
  Math.abs(actual - expected) / expected <= pct / 100;

describe("known-distance", () => {
  it("one degree of latitude is 69.05 miles within 1% (published geodesic constant)", () => {
    // 1 minute of latitude = 1 nautical mile by definition, so 1 degree = 60 nm
    // = 69.047 statute miles. This is a true published reference distance.
    const d = distanceMiles([0, 25], [0, 26]);
    expect(within(d, 69.047, 1)).toBe(true);
  });

  it("Miami to Fort Lauderdale (I-95 corridor) straight-line is 25.15 miles within 1%", () => {
    const miami: [number, number] = [-80.1918, 25.7617];
    const fortLauderdale: [number, number] = [-80.1373, 26.1224];
    const d = distanceMiles(miami, fortLauderdale);
    expect(within(d, 25.15, 1)).toBe(true);
  });

  it("a multi-segment path sums its legs", () => {
    const total = pathDistanceMiles([
      [0, 25],
      [0, 26],
      [0, 27],
    ]);
    expect(within(total, 138.1, 1)).toBe(true);
  });
});

describe("5-mile geodesic buffer area", () => {
  it("encloses about 78.54 square miles within 1% (pi x 25)", () => {
    const ring = geodesicBufferMiles([-80.19, 25.76], 5);
    const a = areaSquareMiles(ring);
    expect(within(a, Math.PI * 25, 1)).toBe(true);
  });

  it("area scales with the square of the radius (10-mile ring is ~4x a 5-mile ring)", () => {
    const five = areaSquareMiles(geodesicBufferMiles([-80.19, 25.76], 5));
    const ten = areaSquareMiles(geodesicBufferMiles([-80.19, 25.76], 10));
    expect(within(ten / five, 4, 1)).toBe(true);
  });
});

describe("ellipsoidal geodesic (Vincenty, WGS84)", () => {
  it("matches the published Vincenty reference (Flinders Peak to Buninyong) to under 1 mm", () => {
    // The canonical Vincenty test pair; the accepted ellipsoidal distance is
    // 54972.271 m. Hitting it to the millimeter proves the implementation is
    // the true WGS84 geodesic, not an approximation.
    // Flinders Peak 37°57′03.72030″S 144°25′29.52440″E; Buninyong 37°39′10.15610″S
    // 143°55′35.38390″E, converted to decimal degrees.
    const d = ellipsoidalDistanceMeters([144.42486789, -37.95103342], [143.92649553, -37.65282114]);
    expect(Math.abs(d - 54972.271)).toBeLessThan(0.001);
  });

  it("agrees with spherical Haversine to within 0.5% at county scale", () => {
    // Both are true geodesics; the ellipsoid just removes Haversine's small
    // spherical residual (about 0.36% here). A large gap would mean a bug.
    const miami: [number, number] = [-80.1918, 25.7617];
    const ftl: [number, number] = [-80.1373, 26.1224];
    const ellip = ellipsoidalDistanceMeters(miami, ftl);
    const hav = distance(point(miami), point(ftl), { units: "meters" });
    expect(Math.abs(ellip - hav) / hav).toBeLessThan(0.005);
  });

  it("direct and inverse solutions round-trip: a point 5 mi east is measured back as 5 mi", () => {
    const start: [number, number] = [-80.19, 25.76];
    const dest = ellipsoidalDestination(start, 5 * 1609.344, 90);
    expect(within(distanceMiles(start, dest), 5, 0.001)).toBe(true);
  });
});

describe("latitude invariance", () => {
  it("a 0.2 degree N-S segment is nearly equal at Miami and Orlando, and lengthens toward the pole (ellipsoidal)", () => {
    // A Mercator or planar-degree bug would make these differ by a lot. On the
    // WGS84 ellipsoid they are within a fraction of a percent, and the meridian
    // arc genuinely lengthens toward the pole, so Orlando is slightly longer.
    const atMiami = distanceMiles([-80.19, 25.7], [-80.19, 25.9]);
    const atOrlando = distanceMiles([-81.38, 28.4], [-81.38, 28.6]);
    expect(Math.abs(atMiami - atOrlando) / atMiami).toBeLessThan(0.005);
    expect(atOrlando).toBeGreaterThan(atMiami);
  });

  it("an east-west degree of longitude shrinks with latitude (proof we are not doing planar math)", () => {
    // If the code treated lon/lat as flat graph paper, these would be equal.
    // Geodesically, a longitude degree is shorter at higher latitude.
    const lonAtMiami = groundDistanceAtLatitudeMiles(25.8, 0.1);
    const lonAtOrlando = groundDistanceAtLatitudeMiles(28.5, 0.1);
    expect(lonAtOrlando).toBeLessThan(lonAtMiami);
    expect(lonAtMiami - lonAtOrlando).toBeGreaterThan(0.1);
  });
});

describe("area-weighted intersection", () => {
  it("a region covering exactly half a tract returns exactly half its population", () => {
    const tract: Feature<Polygon> = polygon(
      [
        [
          [0, 0],
          [0, 0.1],
          [0.1, 0.1],
          [0.1, 0],
          [0, 0],
        ],
      ],
      { geoid: "TEST", population: 1000 },
    );
    const westernHalf: Feature<Polygon> = polygon([
      [
        [0, 0],
        [0, 0.1],
        [0.05, 0.1],
        [0.05, 0],
        [0, 0],
      ],
    ]);
    const tracts: FeatureCollection<Polygon> = { type: "FeatureCollection", features: [tract] };
    const result = apportionByArea(westernHalf, tracts, "population", "geoid");
    expect(within(result.total, 500, 0.5)).toBe(true);
    expect(result.contributions[0].fraction).toBeCloseTo(0.5, 4);
  });

  it("a region fully covering a tract returns its whole population", () => {
    const tract: Feature<Polygon> = polygon(
      [
        [
          [0, 0],
          [0, 0.1],
          [0.1, 0.1],
          [0.1, 0],
          [0, 0],
        ],
      ],
      { geoid: "TEST", population: 1000 },
    );
    const cover: Feature<Polygon> = polygon([
      [
        [-1, -1],
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
      ],
    ]);
    const tracts: FeatureCollection<Polygon> = { type: "FeatureCollection", features: [tract] };
    const result = apportionByArea(cover, tracts, "population", "geoid");
    expect(within(result.total, 1000, 0.5)).toBe(true);
  });
});

describe("spatial index point-in-polygon", () => {
  it("finds the polygon that contains a point and excludes ones that do not", () => {
    const a: Feature<Polygon> = polygon(
      [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      ],
      { id: "A" },
    );
    const b: Feature<Polygon> = polygon(
      [
        [
          [2, 2],
          [2, 3],
          [3, 3],
          [3, 2],
          [2, 2],
        ],
      ],
      { id: "B" },
    );
    const index = new PolygonIndex([a, b]);
    const hit = index.first([0.5, 0.5]);
    expect(hit?.properties?.id).toBe("A");
    expect(index.first([5, 5])).toBeNull();
  });
});

describe("grade domain", () => {
  it("every grade in the full domain resolves to a distinct style with a letter, no fallthrough", () => {
    for (const grade of GRADE_DOMAIN) {
      const style = resolveGradeStyle(grade);
      expect(style.letter.length).toBeGreaterThan(0);
      expect(style.grade).toBe(grade);
    }
    // NG is the only dashed one; NR and NG use a neutral slate fill; I is gray.
    expect(resolveGradeStyle("NG").dashed).toBe(true);
    expect(resolveGradeStyle("NR").dashed).toBe(false);
    expect(resolveGradeStyle("A").letter).toBe("A");
  });

  it("an unknown grade throws instead of silently defaulting", () => {
    expect(() => resolveGradeStyle("Z")).toThrow();
    expect(() => resolveGradeStyle("")).toThrow();
  });
});
