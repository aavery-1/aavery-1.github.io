import { describe, it, expect } from "vitest";
import { matchHopeOperator } from "../derive/hopeOperators";

describe("matchHopeOperator", () => {
  it("stars the Mater Academy (Academica) network", () => {
    expect(matchHopeOperator("Mater Academy")).toBe("Mater Academy");
    expect(matchHopeOperator("Mater Gardens Academy")).toBe("Mater Academy");
    expect(matchHopeOperator("Mater Preparatory Academy")).toBe("Mater Academy");
  });

  it("stars the KIPP network (KIPP Miami)", () => {
    expect(matchHopeOperator("KIPP Miami Poinciana Campus")).toBe("KIPP");
    expect(matchHopeOperator("Kipp Miami-liberty City")).toBe("KIPP");
  });

  it("does NOT star the generic Renaissance Charter chain (Charter Schools USA)", () => {
    // These are NOT the designated Renaissance/Warrington Preparatory Academy.
    expect(matchHopeOperator("Renaissance Charter School AT Cooper City")).toBeNull();
    expect(matchHopeOperator("New Renaissance Middle School")).toBeNull();
    expect(matchHopeOperator("Renaissance Elementary Charter School")).toBeNull();
  });

  it("stars the actual Warrington Preparatory designated school", () => {
    expect(matchHopeOperator("Warrington Preparatory Academy")).toBe(
      "Renaissance/Warrington Preparatory Academy",
    );
  });

  it("recognizes the out-of-tri-county operators when their data loads", () => {
    expect(matchHopeOperator("IDEA Victory Academy")).toBe("IDEA Public Schools");
    expect(matchHopeOperator("RCMA Wimauma Academy")).toBe("RCMA");
    expect(matchHopeOperator("Success Academy Bronx 2")).toBe("Success Academy");
  });

  it("returns null for ordinary district and charter schools", () => {
    expect(matchHopeOperator("Norland Elementary School")).toBeNull();
    expect(matchHopeOperator("Orlando Science Middle High Charter")).toBeNull();
    expect(matchHopeOperator("Miami Norland Senior High School")).toBeNull();
  });
});
