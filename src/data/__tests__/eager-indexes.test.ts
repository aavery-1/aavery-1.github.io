// P0.1 regression guard: the inspector shows a school's community and district
// facts (opportunity zone, median income, board + legislative districts)
// regardless of which map layers are toggled on. That only holds if the sources
// feeding those point-in-polygon lookups are loaded eagerly on mount, never
// gated on `activeLayerIds`. If someone makes one of these layers lazy again, the
// fact would blank out when its layer is off, which is the exact bug this guards.

import { describe, it, expect } from "vitest";
import { EAGER_IDS } from "../DataContext";

// The data sources the inspector reads through the eagerly-built spatial indexes
// (ozIndex, incomeIndex, boardIndex, legislativeIndex) plus the grade/enrollment
// data it charts. Keep in step with DataContext's index memos.
const INSPECTOR_POINT_QUERY_SOURCES = [
  "school_locations",
  "historic_grades",
  "school_enrollment_history",
  "household_income",
  "opportunity_zones",
  "board_districts",
  "legislative_districts",
  "representatives",
];

describe("inspector facts are decoupled from map-layer toggles (P0.1)", () => {
  it("eagerly loads every source the inspector reads, so facts show with all layers off", () => {
    for (const id of INSPECTOR_POINT_QUERY_SOURCES) {
      expect(EAGER_IDS, `${id} must be eager-loaded for the inspector`).toContain(id);
    }
  });

  it("has no duplicate ids in the eager set", () => {
    expect(new Set(EAGER_IDS).size).toBe(EAGER_IDS.length);
  });
});
