// The ring build and the browser run the same shared functions on the same file, so the same disk must give the
// same figures exactly, not approximately.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePoints, demographicsFor, pointInPolygon, type PointsFile } from "../populationPoints";
import { distanceMi, weightsFromBlocks } from "../../shared-geo/sharedGeo";
import type { SchoolDemographicsFile } from "../../data/types";

const DATA = join(__dirname, "..", "..", "..", "public", "data");
const points = decodePoints(JSON.parse(readFileSync(join(DATA, "population_points.json"), "utf8")) as PointsFile);
const demo = JSON.parse(readFileSync(join(DATA, "school_demographics.json"), "utf8")) as SchoolDemographicsFile;

describe("population points aggregation", () => {
  it.each([
    ["06-1701", 2], // Lauderdale Lakes Middle, Broward
    ["06-1071", 1], // William Dandy Middle
    ["13-1681", 5], // Lillie C. Evans K-8, Miami-Dade
  ])("reproduces the precomputed %s ring at %i mi exactly", (msid, miles) => {
    const entry = demo.schools[msid];
    const ring = entry.rings.find((r) => r.r === miles)!;
    const b = points.blocks, idx: number[] = [];
    for (let i = 0; i < b.lon.length; i++) if (distanceMi([entry.lon, entry.lat], [b.lon[i], b.lat[i]]) <= miles) idx.push(i);
    const got = demographicsFor(points, weightsFromBlocks(b, idx));
    const { r: _r, ...want } = ring;
    expect(got).toEqual(want);
  });

  it("treats polygon holes as outside", () => {
    const sq = (x0: number, y0: number, s: number) => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]];
    const donut = { type: "Polygon" as const, coordinates: [sq(0, 0, 10), sq(4, 4, 2)] };
    expect(pointInPolygon(1, 1, donut)).toBe(true);
    expect(pointInPolygon(5, 5, donut)).toBe(false);
    expect(pointInPolygon(11, 5, donut)).toBe(false);
  });
});
