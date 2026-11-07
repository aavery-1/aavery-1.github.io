// The in-browser aggregator (used for drive-time polygons) must reproduce the
// precomputed radius-ring demographics when handed the same disk. If these
// drift, a 15-minute figure and a 2-mile figure would no longer be comparable.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePoints, aggregateDecoded, pointInPolygon, type PointsFile } from "../populationPoints";
import { geodesicBufferMiles } from "../buffer";
import type { SchoolDemographicsFile } from "../../data/types";

const DATA = join(__dirname, "..", "..", "..", "public", "data");
const points = decodePoints(JSON.parse(readFileSync(join(DATA, "population_points.json"), "utf8")) as PointsFile);
const demo = JSON.parse(readFileSync(join(DATA, "school_demographics.json"), "utf8")) as SchoolDemographicsFile;

describe("population points aggregation", () => {
  it.each([
    ["06-1701", 2], // Lauderdale Lakes Middle, Broward
    ["06-1071", 1], // William Dandy Middle
    ["13-1681", 5], // Lillie C. Evans K-8, Miami-Dade
  ])("matches the precomputed %s ring at %i mi", (msid, miles) => {
    const entry = demo.schools[msid];
    const ring = entry.rings.find((r) => r.r === miles)!;
    const disk = geodesicBufferMiles([entry.lon, entry.lat], miles, 512).geometry;
    const got = aggregateDecoded(points, disk);
    // A polygonal disk vs an exact geodesic distance test differ only for the
    // odd block sitting on the edge, so totals agree to well under 1%.
    expect(Math.abs(got.total_pop - ring.total_pop) / ring.total_pop).toBeLessThan(0.01);
    expect(Math.abs(got.k8_pop - ring.k8_pop) / ring.k8_pop).toBeLessThan(0.01);
    expect(Math.abs((got.pct_black ?? 0) - (ring.pct_black ?? 0))).toBeLessThan(0.5);
  });

  it("treats polygon holes as outside", () => {
    const sq = (x0: number, y0: number, s: number) => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]];
    const donut = { type: "Polygon" as const, coordinates: [sq(0, 0, 10), sq(4, 4, 2)] };
    expect(pointInPolygon(1, 1, donut)).toBe(true);
    expect(pointInPolygon(5, 5, donut)).toBe(false);
    expect(pointInPolygon(11, 5, donut)).toBe(false);
  });
});
