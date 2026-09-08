// Unit tests for the Persistently Low-Performing (PLP) calculator. The rule
// comes straight from F.S. 1002.333 and drives the Schools of Hope siting
// eligibility, so its correctness matters more than any single UI decision.

import { describe, it, expect } from "vitest";
import { evaluatePlp } from "../derive/plp";
import type { GradeHistoryEntry } from "../types";

const H = (rows: Array<[string, string]>): GradeHistoryEntry[] =>
  rows.map(([year, grade]) => ({ year, grade: grade as GradeHistoryEntry["grade"] }));

describe("evaluatePlp: F.S. 1002.333", () => {
  it("flags PLP when 3 of last 5 graded years are below C and recent 2 are not B or higher", () => {
    const history = H([
      ["2020-2021", "F"],
      ["2021-2022", "D"],
      ["2022-2023", "F"],
      ["2023-2024", "C"],
      ["2024-2025", "D"],
    ]);
    const r = evaluatePlp(history);
    expect(r.isPlp).toBe(true);
    expect(r.belowCInLast5).toBe(4);
    expect(r.recent2).toEqual(["D", "C"]);
  });

  it("is NOT PLP when the most recent graded year is B or higher, even if 3 of 5 are below C", () => {
    const history = H([
      ["2020-2021", "F"],
      ["2021-2022", "D"],
      ["2022-2023", "F"],
      ["2023-2024", "C"],
      ["2024-2025", "B"], // recent B disqualifies
    ]);
    const r = evaluatePlp(history);
    expect(r.isPlp).toBe(false);
    expect(r.reason).toMatch(/recent 2 include B or higher/);
  });

  it("is NOT PLP when fewer than 3 of the last 5 graded years are below C", () => {
    const history = H([
      ["2020-2021", "C"],
      ["2021-2022", "C"],
      ["2022-2023", "D"],
      ["2023-2024", "F"],
      ["2024-2025", "C"],
    ]);
    const r = evaluatePlp(history);
    expect(r.isPlp).toBe(false);
    expect(r.belowCInLast5).toBe(2);
    expect(r.reason).toMatch(/only 2 of last 5/);
  });

  it("skips non-standard grades (I, NR, NG) when picking the last 5 graded years", () => {
    // COVID years commonly show NG. Those are not graded years per the
    // statute, so a school with a strong pre-COVID record and D/F afterward
    // can still be PLP if 3 of the actual graded years are below C.
    const history = H([
      ["2016-2017", "F"],
      ["2017-2018", "F"],
      ["2018-2019", "D"],
      ["2019-2020", "NG"],
      ["2020-2021", "NG"],
      ["2021-2022", "D"],
      ["2022-2023", "C"],
      ["2023-2024", "C"],
    ]);
    // Last 5 graded years: 2016-17 F, 17-18 F, 18-19 D, 21-22 D, 22-23 C, 23-24 C
    // Wait: 5 most recent graded: 17-18 F, 18-19 D, 21-22 D, 22-23 C, 23-24 C = 3 below C
    // Recent 2 graded: 22-23 C, 23-24 C = neither B or higher => PLP
    const r = evaluatePlp(history);
    expect(r.isPlp).toBe(true);
    expect(r.belowCInLast5).toBe(3);
  });

  it("returns not-PLP with a clear reason when the school has no graded years", () => {
    const r = evaluatePlp(H([["2019-2020", "NG"], ["2020-2021", "NG"]]));
    expect(r.isPlp).toBe(false);
    expect(r.reason).toMatch(/No graded years/);
  });

  it("handles fewer than 5 graded years (uses whatever is available)", () => {
    const history = H([
      ["2022-2023", "F"],
      ["2023-2024", "D"],
      ["2024-2025", "F"],
    ]);
    // 3 of last 3 are below C; recent 2 (F, D) are not B or higher.
    const r = evaluatePlp(history);
    expect(r.isPlp).toBe(true);
  });
});
