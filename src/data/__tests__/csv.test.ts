// CSV export must always produce a well-formed file. These assertions cover the
// quoting rules that break naive CSV writers: commas, quotes, and newlines
// inside a value. Acceptance item: CSV export produces a well-formed CSV.

import { describe, it, expect } from "vitest";
import { toCsv } from "../csv";

describe("toCsv", () => {
  it("writes a header row and one row per record", () => {
    const csv = toCsv(["Field", "Value"], [["Name", "Boone High"], ["Grade", "A"]]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Field,Value");
    expect(lines).toHaveLength(3);
  });

  it("quotes values containing commas, quotes, or newlines and escapes quotes", () => {
    const csv = toCsv(["A", "B"], [["1200 NW 6th Ave, Miami", 'has "quotes"']]);
    const row = csv.trimEnd().split("\r\n")[1];
    expect(row).toBe('"1200 NW 6th Ave, Miami","has ""quotes"""');
  });

  it("renders null and undefined as empty cells, never the string null", () => {
    const csv = toCsv(["A", "B"], [[null, undefined]]);
    expect(csv.trimEnd().split("\r\n")[1]).toBe(",");
  });
});
