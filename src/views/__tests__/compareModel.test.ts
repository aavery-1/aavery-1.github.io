// Compare model tests. The Compare view renders whatever these sections say, and
// its "Differences only" filter keys entirely off each row's `diff` flag, so the
// row model is where the behavior is locked down.

import { describe, it, expect } from "vitest";
import { buildCompareSections, operatorLabel } from "../compareModel";
import type { SchoolFeature, CountyName, SchoolLevel, SchoolType } from "../../data/types";
import type { SchoolFilterContext } from "../../data/derive/filters";
import type { DataContextValue } from "../../data/DataContext";
import type { Grade } from "../../map/gradeEncoding";

function school(o: {
  msid: string; name?: string; county?: CountyName; grade?: Grade;
  enrollment?: number | null; capacity?: number | null; operator?: string | null;
}): SchoolFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-80.25, 25.85] },
    properties: {
      msid: o.msid,
      name: o.name ?? `School ${o.msid}`,
      level: "High" as SchoolLevel,
      type: "Traditional" as SchoolType,
      operator: o.operator === undefined ? null : o.operator,
      county: o.county ?? "Miami-Dade",
      county_fips: "12086",
      board_district: null,
      current_grade: o.grade ?? "B",
      current_grade_year: "2024-2025",
      enrollment: o.enrollment === undefined ? 1000 : o.enrollment,
      enrollment_year: "2024-2025",
      capacity: o.capacity === undefined ? 1200 : o.capacity,
      cofte: null,
      fish_surplus: null,
      title_i: "yes",
      title_i_schoolwide: false,
      title_i_eligible: true,
      address: "n/a",
      geocode_source: "test",
    },
  } as SchoolFeature;
}

// Minimal context and data: the model only reads three MSID sets from ctx and the
// (here null) spatial indexes from data, which every reader tolerates.
const ctx = (over: Partial<SchoolFilterContext> = {}): SchoolFilterContext =>
  ({
    plp: new Set<string>(),
    sohEligibleMsids: new Set<string>(),
    coLocationMsids: new Set<string>(),
    ...over,
  }) as SchoolFilterContext;

const data = {
  legislativeIndex: null,
  boardIndex: null,
  incomeIndex: null,
  ozIndex: null,
  reps: null,
} as unknown as DataContextValue;

const rowByKey = (sections: ReturnType<typeof buildCompareSections>, key: string) =>
  sections.flatMap((s) => s.rows).find((r) => r.key === key);

describe("buildCompareSections", () => {
  it("returns no sections for an empty set", () => {
    expect(buildCompareSections([], ctx(), data)).toEqual([]);
  });

  it("lays out the five decision sections in order", () => {
    const secs = buildCompareSections([school({ msid: "A" }), school({ msid: "B" })], ctx(), data);
    expect(secs.map((s) => s.title)).toEqual([
      "Overview",
      "School of Hope eligibility",
      "Enrollment and capacity",
      "Districts and representation",
      "Community context",
    ]);
  });

  it("marks a row as differing only when the values are not all identical", () => {
    const secs = buildCompareSections(
      [school({ msid: "A", grade: "A", county: "Miami-Dade" }), school({ msid: "B", grade: "C", county: "Miami-Dade" })],
      ctx(),
      data,
    );
    expect(rowByKey(secs, "grade")!.diff).toBe(true);   // A vs C
    expect(rowByKey(secs, "county")!.diff).toBe(false); // both Miami-Dade
    expect(rowByKey(secs, "level")!.diff).toBe(false);  // both High
  });

  it("reads yes/no eligibility rows from the context sets, per site", () => {
    const secs = buildCompareSections(
      [school({ msid: "A" }), school({ msid: "B" })],
      ctx({ plp: new Set(["A"]), sohEligibleMsids: new Set(["A", "B"]) }),
      data,
    );
    expect(rowByKey(secs, "plp")!.values).toEqual(["Yes", "No"]);
    expect(rowByKey(secs, "plp")!.diff).toBe(true);
    expect(rowByKey(secs, "soh")!.values).toEqual(["Yes", "Yes"]);
    expect(rowByKey(secs, "soh")!.diff).toBe(false);
  });

  it("formats enrollment and capacity, and labels missing values", () => {
    const secs = buildCompareSections(
      [school({ msid: "A", enrollment: 1234, capacity: 1500 }), school({ msid: "B", enrollment: null, capacity: null })],
      ctx(),
      data,
    );
    expect(rowByKey(secs, "enroll")!.values[0]).toBe("1,234 (2024-2025)");
    expect(rowByKey(secs, "enroll")!.values[1]).toBe("Not reported");
    expect(rowByKey(secs, "capacity")!.values[0]).toBe("1,500 stations");
  });
});

describe("operatorLabel", () => {
  it("shows a properly cased county for a district school and the operator otherwise", () => {
    expect(operatorLabel(school({ msid: "A", operator: null }))).toBe("Miami-Dade County");
    expect(operatorLabel(school({ msid: "B", operator: "KIPP Miami" }))).toBe("KIPP Miami");
  });
});
