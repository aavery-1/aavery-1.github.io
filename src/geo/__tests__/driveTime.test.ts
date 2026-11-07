import { describe, it, expect } from "vitest";
import { calibrate, contourPlan, blendDemographics, nextSchoolMorning, nextDeparture, departureLabel, edgePoint } from "../driveTime";

describe("drive-time Google adjustment", () => {
  it("takes one Google/Mapbox factor per school with a held-out error", () => {
    // Mapbox edges at 5/10/15; Google says each takes 20% longer.
    const s = [5, 5, 10, 10, 15, 15].map((band) => ({ band, google: band * 1.2 }));
    const c = calibrate(s)!;
    expect(c.factor).toBeCloseTo(1.2, 5);
    expect(c.samples).toBe(6);
    expect(c.typicalErrorMin).toBeCloseTo(0, 5);
  });

  it("ignores failed samples and refuses to calibrate on too few", () => {
    expect(calibrate([{ band: 5, google: 0 }, { band: 10, google: 12 }])).toBeNull();
  });

  it("clamps an implausible factor", () => {
    const c = calibrate([5, 10, 15, 15].map((band) => ({ band, google: band * 5 })))!;
    expect(c.factor).toBe(1.6);
  });

  it("brackets each band's exact target with whole minutes", () => {
    expect(contourPlan(1.0).map((x) => [x.lo, x.hi, x.w])).toEqual([[5, 5, 0], [10, 10, 0], [15, 15, 0]]);
    const p = contourPlan(1.12)[2]; // 15 / 1.12 = 13.39
    expect([p.lo, p.hi]).toEqual([13, 14]);
    expect(p.w).toBeCloseTo(0.39, 2);
  });

  it("blends figures smoothly so a small factor change cannot jump the count", () => {
    const base = { blocks: 0, total_pop: 0, total_pop_moe: 0, k8_pop: 0, k8_pop_moe: 0, pct_black: null, pct_black_moe: null, pct_hispanic: null, pct_hispanic_moe: null, median_income: null, median_income_moe: null };
    const a = { ...base, k8_pop: 14000, pct_black: 60 };
    const b = { ...base, k8_pop: 20000, pct_black: 64 };
    const at = (f: number) => { const x = contourPlan(f)[2]; return blendDemographics(a, b, x.w)!.k8_pop; };
    // Factors 1.10 and 1.12 straddle the old rounding cliff; now they differ modestly.
    expect(Math.abs(at(1.10) - at(1.12))).toBeLessThan(1500);
    expect(blendDemographics(a, b, 0.5)!.pct_black).toBe(62);
  });

  it("departs the NEXT Tuesday at 7:30am local", () => {
    const sat = nextSchoolMorning(new Date(2026, 10, 7, 3, 0)); // Sat Nov 7 2026
    expect(sat.mapbox).toBe("2026-11-10T07:30");
    const tue = nextSchoolMorning(new Date(2026, 10, 10, 9, 0)); // a Tuesday: go a week out
    expect(tue.mapbox).toBe("2026-11-17T07:30");
  });

  it("departs at any chosen day and time, always in the future", () => {
    const sat = new Date(2026, 10, 7, 3, 0); // Sat Nov 7 2026, 3:00am
    expect(nextDeparture({ day: 3, minutes: 16 * 60 }, sat).mapbox).toBe("2026-11-11T16:00"); // Wed 4pm
    expect(nextDeparture({ day: 2, minutes: 7 * 60 + 45 }, sat).mapbox).toBe("2026-11-10T07:45"); // Tue 7:45am
    // Same day, time not yet passed -> today; already passed -> next week.
    expect(nextDeparture({ day: 6, minutes: 9 * 60 }, sat).mapbox).toBe("2026-11-07T09:00");
    expect(nextDeparture({ day: 6, minutes: 2 * 60 }, sat).mapbox).toBe("2026-11-14T02:00");
    expect(departureLabel({ day: 3, minutes: 16 * 60 })).toBe("Wed 4:00pm");
    expect(departureLabel({ day: 2, minutes: 7 * 60 + 45 })).toBe("Tue 7:45am");
  });

  it("picks the farthest edge vertex near a bearing", () => {
    const sq = { type: "Polygon" as const, coordinates: [[[-1, -1], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]]] };
    expect(edgePoint(sq, 0, 0, 0)).toEqual([0, 2]);
  });
});
