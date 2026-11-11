import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { valhallaSettings, driveRegion, windowLabel, driveMethodNote } from "../driveTime";
import {
  findSaved, findSavedEntry, fitLine, packResult, quantile, regionalCutoffs, siteCutoffs, unpackResult,
  type DriveResult, type SavedIndex, type SavedSiteFile, type SavedSource,
} from "../../shared-geo/sharedGeo";

const DIR = join(__dirname, "..", "..", "..", "public", "data", "drive");
const index = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8")) as SavedIndex;
const saved: SavedSource = { index, load: async (f) => JSON.parse(readFileSync(join(DIR, "sites", f), "utf8")) as SavedSiteFile };

describe("drive times (shared engine)", () => {
  it("offers the two shared times of day", () => {
    expect(windowLabel("dropoff")).toBe("Drop-off, 8am");
    expect(windowLabel("pickup")).toBe("Pickup, 4pm");
  });

  it("has regional cut-offs with a range, from the measured sites", () => {
    expect(driveRegion(25.87)).toBe("florida");
    expect(driveRegion(39.94)).toBe("camden");
    expect(driveRegion(40.73)).toBe("newark");
    const fl = valhallaSettings(25.87, "dropoff");
    expect(fl[10].contourLow!).toBeLessThanOrEqual(fl[10].contour!);
    expect(fl[10].contourHigh!).toBeGreaterThanOrEqual(fl[10].contour!);
    expect(fl[10].basis).toMatch(/measured Florida sites/);
  });

  it("has a saved result for every school in this tool", () => {
    const schools = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "public", "data", "schools.sample.geojson"), "utf8")).features as { properties: { msid: string }; geometry: { coordinates: [number, number] } }[];
    const missing = schools.filter((f) => !findSavedEntry(index, f.geometry.coordinates[0], f.geometry.coordinates[1]));
    expect(missing.map((f) => f.properties.msid)).toEqual([]);
  });

  it("finds a measured campus from any pin within 150 m, at the right time of day", async () => {
    // KIPP Royalty: Grove's pin and this tool's pin are about 35 m apart; both must reach the same measurement.
    const grove = await findSaved(saved, -80.24904, 25.873358, "dropoff");
    const soh = await findSaved(saved, -80.24874, 25.873518, "dropoff");
    expect(grove?.status).toBe("measured");
    expect(soh).toEqual(grove);
    expect((await findSaved(saved, -80.24874, 25.873518, "pickup"))?.window).toBe("pickup");
    expect(await findSaved(saved, -80.2601, 25.9433, "dropoff")).toBeNull(); // an empty field: no school within 150 m
  });

  it("fits Google = a + b x Valhalla, with a range from resampling the timed homes", () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ lng: 0, lat: 0, valhalla: i, google: 1 + 1.5 * i + ((i * 7) % 5) - 2 }));
    const f = fitLine(pts)!;
    expect(f.b).toBeGreaterThan(1.3);
    expect(fitLine(pts.slice(0, 10))).toBeNull(); // too few homes timed
    const c = siteCutoffs(pts, "test")!;
    for (const x of c.cutoffs) { expect(x.low).toBeLessThanOrEqual(x.mid); expect(x.high).toBeGreaterThanOrEqual(x.mid); }
    expect(siteCutoffs(pts, "test")).toEqual(c); // seeded: the same every run, in either tool
  });

  it("takes regional cut-offs as the median and 10th-90th percentile of the sites", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 9);
    const [c5] = regionalCutoffs([{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 1 }], [5]);
    expect(c5.mid).toBe(4);
    expect(c5.low).toBeLessThan(c5.mid);
  });

  it("packs and unpacks saved results without changing them", async () => {
    const r = (await findSaved(saved, -80.24904, 25.873358, "dropoff")) as DriveResult;
    expect(unpackResult(packResult(r))).toEqual(r);
  });

  it("labels measured, saved-estimate and live results", () => {
    const base = { window: "dropoff" as const, fit: null, measuredOn: null, basis: "median of 7 measured Florida sites" };
    expect(driveMethodNote({ ...base, status: "estimate", source: "saved" })).toMatch(/^Drop-off.*Estimate: this site hasn't been timed by Google/);
    expect(driveMethodNote({ ...base, status: "estimate", source: "live" })).toMatch(/Live estimate/);
    expect(driveMethodNote({ ...base, status: "measured", source: "saved", fit: { a: 0, b: 1.2, n: 30, rmse: 1.5 }, measuredOn: "2026-11-10" })).toMatch(/Measured for this site on 2026-11-10/);
  });
});
