// Filter composition tests. Every surface (map, list, status strip) filters
// the same schools through the same function, so we lock down the semantics
// here with property tests rather than at any single view.

import { describe, it, expect } from "vitest";
import { buildFilterContext, passesFilters, formatCoLocationReason, type SchoolFilterInput } from "../derive/filters";
import type { SchoolFeature, SchoolCollection, GradesFile, CountyName, SchoolLevel, SchoolType, TitleIState } from "../types";
import type { Grade } from "../../map/gradeEncoding";
import type { FacilityUseKey } from "../../store";

const ALL_COUNTIES: CountyName[] = ["Miami-Dade", "Broward", "Orange"];

type FeatOpts = {
  msid: string;
  name?: string;
  county?: CountyName;
  grade?: Grade;
  level?: SchoolLevel;
  type?: SchoolType;
  titleI?: TitleIState;
  enrollment?: number | null;
  capacity?: number | null;
  cofte?: number | null;
  fishSurplus?: number | null;
  lng?: number;
  lat?: number;
};

const school = (o: FeatOpts): SchoolFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [o.lng ?? -80.25, o.lat ?? 25.85] },
  properties: {
    msid: o.msid,
    name: o.name ?? `School ${o.msid}`,
    level: (o.level ?? "High") as SchoolLevel,
    type: (o.type ?? "Traditional") as SchoolType,
    operator: null,
    county: o.county ?? "Miami-Dade",
    county_fips: o.county === "Broward" ? "12011" : o.county === "Orange" ? "12095" : "12086",
    board_district: null,
    current_grade: o.grade ?? "B",
    current_grade_year: "2024-2025",
    enrollment: o.enrollment === undefined ? 1000 : o.enrollment,
    enrollment_year: "2024-2025",
    capacity: o.capacity === undefined ? 1200 : o.capacity,
    cofte: o.cofte === undefined ? null : o.cofte,
    fish_surplus: o.fishSurplus === undefined ? null : o.fishSurplus,
    title_i: o.titleI ?? "yes",
    title_i_schoolwide: false,
    title_i_eligible: (o.titleI ?? "yes") === "yes",
    address: "n/a",
    geocode_source: "test",
  },
});

const collection = (features: SchoolFeature[]): SchoolCollection => ({
  type: "FeatureCollection",
  features,
});

// Grades that make a school PLP: 3+ below C in last 5 graded years AND
// recent 2 graded years are not B or higher.
const plpHistory = [
  { year: "2020-2021", grade: "F" as Grade },
  { year: "2021-2022", grade: "D" as Grade },
  { year: "2022-2023", grade: "F" as Grade },
  { year: "2023-2024", grade: "C" as Grade },
  { year: "2024-2025", grade: "D" as Grade },
];

// Grades that make a school clearly NOT PLP (all As).
const cleanHistory = [
  { year: "2020-2021", grade: "A" as Grade },
  { year: "2021-2022", grade: "A" as Grade },
  { year: "2022-2023", grade: "A" as Grade },
  { year: "2023-2024", grade: "A" as Grade },
  { year: "2024-2025", grade: "A" as Grade },
];

describe("filterSchools composition", () => {
  const anchor = school({ msid: "P1", grade: "D", lng: -80.25, lat: 25.85 });
  const nearAnchor = school({ msid: "N1", grade: "A", lng: -80.28, lat: 25.86 }); // ~2 mi away
  const farFromAnchor = school({ msid: "F1", grade: "A", lng: -80.10, lat: 25.50 }); // >5 mi
  const brw = school({ msid: "BW1", grade: "B", county: "Broward", lng: -80.20, lat: 26.15 });

  const schools = collection([anchor, nearAnchor, farFromAnchor, brw]);
  const grades: GradesFile = {
    vintage: "test",
    formula_change_years: [],
    schools: { P1: plpHistory, N1: cleanHistory, F1: cleanHistory, BW1: cleanHistory },
  };
  const ctx = buildFilterContext(schools, grades);

  it("identifies P1 as the only PLP anchor", () => {
    expect(ctx.plp.has("P1")).toBe(true);
    expect(ctx.plp.has("N1")).toBe(false);
    expect(ctx.plp.has("F1")).toBe(false);
    expect(ctx.plp.has("BW1")).toBe(false);
  });

  it("marks the anchor itself and schools within 5 miles as SoH-eligible", () => {
    expect(ctx.sohEligibleMsids.has("P1")).toBe(true);
    expect(ctx.sohEligibleMsids.has("N1")).toBe(true);
    expect(ctx.sohEligibleMsids.has("F1")).toBe(false);
    expect(ctx.sohEligibleMsids.has("BW1")).toBe(false);
  });

  const base: SchoolFilterInput = {
    counties: new Set(ALL_COUNTIES),
    grades: new Set<Grade>(),
    levels: new Set<SchoolLevel>(),
    types: new Set<SchoolType>(),
    titleI: new Set<TitleIState>(),
    plpOnly: false,
    coLocationOnly: false,
    facilityUse: new Set<FacilityUseKey>(),
    utilMin: null,
    utilMax: null,
    boundary: null,
    districtMsids: null,
  };

  it("with no filters, every school passes", () => {
    for (const f of schools.features) expect(passesFilters(f, base, ctx)).toBe(true);
  });

  it("county selection narrows to only the selected counties", () => {
    const input: SchoolFilterInput = { ...base, counties: new Set<CountyName>(["Broward"]) };
    expect(passesFilters(brw, input, ctx)).toBe(true);
    expect(passesFilters(anchor, input, ctx)).toBe(false);
  });

  it("empty county selection drops everything", () => {
    const input: SchoolFilterInput = { ...base, counties: new Set<CountyName>() };
    for (const f of schools.features) expect(passesFilters(f, input, ctx)).toBe(false);
  });

  it("grade selection keeps only the selected ratings", () => {
    const input: SchoolFilterInput = { ...base, grades: new Set<Grade>(["A"]) };
    expect(passesFilters(anchor, input, ctx)).toBe(false); // D
    expect(passesFilters(nearAnchor, input, ctx)).toBe(true); // A
    expect(passesFilters(farFromAnchor, input, ctx)).toBe(true); // A
    expect(passesFilters(brw, input, ctx)).toBe(false); // B
  });

  it("level selection keeps only the selected grade spans", () => {
    const elem = school({ msid: "E1", level: "Elementary" });
    const high = school({ msid: "H1", level: "High" });
    const fc = collection([elem, high]);
    const c = buildFilterContext(fc, grades);
    const input: SchoolFilterInput = { ...base, levels: new Set<SchoolLevel>(["Elementary"]) };
    expect(passesFilters(elem, input, c)).toBe(true);
    expect(passesFilters(high, input, c)).toBe(false);
  });

  it("type selection keeps only the selected types", () => {
    const charter = school({ msid: "C1", type: "Charter" });
    const trad = school({ msid: "T1", type: "Traditional" });
    const fc = collection([charter, trad]);
    const c = buildFilterContext(fc, grades);
    const input: SchoolFilterInput = { ...base, types: new Set<SchoolType>(["Charter"]) };
    expect(passesFilters(charter, input, c)).toBe(true);
    expect(passesFilters(trad, input, c)).toBe(false);
  });

  it("facility-use tier keeps only schools in the selected tiers (OR) and drops unknowns", () => {
    const overUtil = school({ msid: "OV", enrollment: 1500, capacity: 1000 }); // 150% -> fully used
    const underUtil = school({ msid: "UN", enrollment: 500, capacity: 1000 }); // 50% -> underused
    const targetUtil = school({ msid: "TG", enrollment: 850, capacity: 1000 }); // 85% -> in use
    const unknown = school({ msid: "NA", enrollment: 500, capacity: null });
    const fc = collection([overUtil, underUtil, targetUtil, unknown]);
    const ctx2 = buildFilterContext(fc, grades);
    // Underused only
    const underInput: SchoolFilterInput = { ...base, facilityUse: new Set<FacilityUseKey>(["under"]) };
    expect(passesFilters(underUtil, underInput, ctx2)).toBe(true);
    expect(passesFilters(targetUtil, underInput, ctx2)).toBe(false);
    expect(passesFilters(overUtil, underInput, ctx2)).toBe(false);
    expect(passesFilters(unknown, underInput, ctx2)).toBe(false); // unknown never matches a chosen tier
    // Empty selection keeps unknowns
    expect(passesFilters(unknown, base, ctx2)).toBe(true);
    // Multiple tiers compose as OR within the facet
    const multiInput: SchoolFilterInput = { ...base, facilityUse: new Set<FacilityUseKey>(["full", "under"]) };
    expect(passesFilters(overUtil, multiInput, ctx2)).toBe(true);
    expect(passesFilters(underUtil, multiInput, ctx2)).toBe(true);
    expect(passesFilters(targetUtil, multiInput, ctx2)).toBe(false);
  });

  it("plpOnly keeps only PLP anchors", () => {
    const input: SchoolFilterInput = { ...base, plpOnly: true };
    expect(passesFilters(anchor, input, ctx)).toBe(true);
    expect(passesFilters(nearAnchor, input, ctx)).toBe(false);
  });

  it("coLocationOnly keeps underused district buildings in a siting area, and drops full schools, charters, and out-of-area buildings", () => {
    // A PLP anchor at the shared default coords puts co-located buildings inside
    // a 5-mile siting area (the statutory geographic gate for co-location).
    const plpAnchor = school({ msid: "AP", type: "Traditional", enrollment: 1000, capacity: 1000, lng: -80.25, lat: 25.85 });
    const underDistrict = school({ msid: "CO1", type: "Traditional", enrollment: 500, capacity: 1000 }); // 50%, same coords -> in area
    const fullDistrict = school({ msid: "CO2", type: "Traditional", enrollment: 1100, capacity: 1200 }); // 92%, +100 stations
    const surplusDistrict = school({ msid: "CO3", type: "Traditional", enrollment: 2000, capacity: 2500 }); // 80% but +500 stations
    const underCharter = school({ msid: "CO4", type: "Charter", enrollment: 500, capacity: 1000 }); // underused but not district-operated
    const outOfArea = school({ msid: "CO5", type: "Traditional", enrollment: 500, capacity: 1000, lng: -80.10, lat: 25.50 }); // underused but >5 mi from any PLP
    const fc = collection([plpAnchor, underDistrict, fullDistrict, surplusDistrict, underCharter, outOfArea]);
    const g: GradesFile = { vintage: "test", formula_change_years: [], schools: { AP: plpHistory } };
    const c = buildFilterContext(fc, g);
    const input: SchoolFilterInput = { ...base, coLocationOnly: true };
    expect(c.coLocationMsids.has("CO1")).toBe(true);
    expect(c.coLocationMsids.has("CO3")).toBe(true); // qualifies on the 400-station surplus alone
    expect(c.coLocationMsids.has("CO5")).toBe(false); // underused district building, but outside the siting area
    expect(passesFilters(underDistrict, input, c)).toBe(true);
    expect(passesFilters(surplusDistrict, input, c)).toBe(true);
    expect(passesFilters(fullDistrict, input, c)).toBe(false);
    expect(passesFilters(underCharter, input, c)).toBe(false); // co-location is district-operated only
    expect(passesFilters(outOfArea, input, c)).toBe(false); // co-location requires the siting-area gate
  });

  it("AND-composes coLocationOnly with county selection", () => {
    const mdAnchor = school({ msid: "MDP", type: "Traditional", enrollment: 1000, capacity: 1000, county: "Miami-Dade", lng: -80.25, lat: 25.85 });
    const bwAnchor = school({ msid: "BWP", type: "Traditional", enrollment: 1000, capacity: 1000, county: "Broward", lng: -80.20, lat: 26.15 });
    const mdUnder = school({ msid: "MD1", type: "Traditional", enrollment: 500, capacity: 1000, county: "Miami-Dade", lng: -80.25, lat: 25.85 });
    const bwUnder = school({ msid: "BW2", type: "Traditional", enrollment: 500, capacity: 1000, county: "Broward", lng: -80.20, lat: 26.15 });
    const g: GradesFile = { vintage: "test", formula_change_years: [], schools: { MDP: plpHistory, BWP: plpHistory } };
    const c = buildFilterContext(collection([mdAnchor, bwAnchor, mdUnder, bwUnder]), g);
    const input: SchoolFilterInput = { ...base, coLocationOnly: true, counties: new Set<CountyName>(["Broward"]) };
    expect(passesFilters(mdUnder, input, c)).toBe(false); // dropped by county
    expect(passesFilters(bwUnder, input, c)).toBe(true);
  });

  it("does not count a PLP anchor across a county line (same-district rule, Rule 6A-1.0998271(3))", () => {
    // A Miami-Dade PLP and two neighbors at the same point ~1 mile away: one in
    // Broward, one in Miami-Dade. Both are geographically inside the 5-mile ring,
    // but a School of Hope must be in the same district as the Notice of Intent
    // (filed where the PLP is identified), and Florida districts are counties. So
    // only the same-county neighbor is in the siting area / a co-location candidate.
    const mdPlp = school({ msid: "MDX", type: "Traditional", enrollment: 1000, capacity: 1000, county: "Miami-Dade", lng: -80.25, lat: 25.85 });
    const bwNear = school({ msid: "BWN", type: "Traditional", enrollment: 500, capacity: 1000, county: "Broward", lng: -80.26, lat: 25.86 });
    const mdNear = school({ msid: "MDN", type: "Traditional", enrollment: 500, capacity: 1000, county: "Miami-Dade", lng: -80.26, lat: 25.86 });
    const g: GradesFile = { vintage: "test", formula_change_years: [], schools: { MDX: plpHistory } };
    const c = buildFilterContext(collection([mdPlp, bwNear, mdNear]), g);
    expect(c.sohEligibleMsids.has("MDN")).toBe(true);   // same county: in the siting area
    expect(c.sohEligibleMsids.has("BWN")).toBe(false);  // across the county line: excluded
    expect(c.coLocationMsids.has("MDN")).toBe(true);
    expect(c.coLocationMsids.has("BWN")).toBe(false);
  });

  it("coLocationOnly depends on facility use and siting, not the building's own grades", () => {
    const plpAnchor = school({ msid: "AP2", type: "Traditional", enrollment: 1000, capacity: 1000, lng: -80.25, lat: 25.85 });
    const underNoGrades = school({ msid: "NG1", type: "Traditional", enrollment: 500, capacity: 1000 }); // same coords; no grade history of its own
    const g: GradesFile = { vintage: "test", formula_change_years: [], schools: { AP2: plpHistory } };
    const c = buildFilterContext(collection([plpAnchor, underNoGrades]), g);
    const input: SchoolFilterInput = { ...base, coLocationOnly: true };
    expect(passesFilters(underNoGrades, input, c)).toBe(true);
  });

  it("gives each co-location candidate a reason: utilization plus the nearest same-county PLP by name and distance", () => {
    const plpAnchor = school({ msid: "AP3", name: "Anchor High", type: "Traditional", enrollment: 1000, capacity: 1000, lng: -80.25, lat: 25.85 });
    const under = school({ msid: "U1", type: "Traditional", enrollment: 500, capacity: 1000, lng: -80.28, lat: 25.86 }); // ~2 mi from anchor, 50%
    const g: GradesFile = { vintage: "test", formula_change_years: [], schools: { AP3: plpHistory } };
    const c = buildFilterContext(collection([plpAnchor, under]), g);
    const r = c.coLocationReasons.get("U1");
    expect(r).toBeDefined();
    expect(r!.utilPct).toBe(50);
    expect(r!.nearestPlp?.name).toBe("Anchor High");
    // The anchor's MSID rides along so the tooltip can make its name a link that
    // selects that school (fly-to + inspector).
    expect(r!.nearestPlp?.msid).toBe("AP3");
    // Distance matches the 5-mile eligibility geodesic (the two coords are ~2 mi apart).
    expect(r!.nearestPlp!.miles).toBeGreaterThan(1);
    expect(r!.nearestPlp!.miles).toBeLessThan(3);
    expect(r!.inOpportunityZone).toBe(false);
    const text = formatCoLocationReason(r!);
    expect(text).toContain("Underused at 50% of capacity");
    expect(text).toContain("within 5 miles of Anchor High");
    expect(text).toMatch(/\(\d\.\d mi\)/);
  });

  it("formatCoLocationReason lists the Opportunity Zone first when both pathways apply", () => {
    const both = formatCoLocationReason({
      utilPct: 62, basis: "cofte", isPlpAnchor: false, inOpportunityZone: true,
      nearestPlp: { msid: "J1", name: "Jackson Senior High", miles: 2.34 },
    });
    expect(both).toBe("Underused at 62% of capacity, in a Qualified Opportunity Zone and within 5 miles of Jackson Senior High (2.3 mi)");
    // OZ appears before the PLP clause.
    expect(both.indexOf("Opportunity Zone")).toBeLessThan(both.indexOf("Jackson"));
  });

  it("treats a COFTE of 0 as missing (bad FISH value) and uses enrollment, so a full school is not a false co-location candidate", () => {
    // Same coords as a PLP anchor (in the siting area). By enrollment the building
    // is 86% used with only 162 spare stations, so it is NOT underused. Its FISH
    // COFTE is 0 (a mis-parsed value) and its surplus is the full capacity, both
    // derived from that bad figure; trusting them would flag it underused at 0%.
    const plpAnchor = school({ msid: "APX", type: "Traditional", enrollment: 1000, capacity: 1000, lng: -80.25, lat: 25.85 });
    const badCofte = school({ msid: "ZC1", type: "Traditional", enrollment: 999, capacity: 1161, cofte: 0, fishSurplus: 1161, lng: -80.25, lat: 25.85 });
    const g: GradesFile = { vintage: "test", formula_change_years: [], schools: { APX: plpHistory } };
    const c = buildFilterContext(collection([plpAnchor, badCofte]), g);
    expect(c.coLocationMsids.has("ZC1")).toBe(false);
    // A real low COFTE (credible statutory numerator) still qualifies.
    const lowCofte = school({ msid: "ZC2", type: "Traditional", enrollment: 999, capacity: 1161, cofte: 400, fishSurplus: 761, lng: -80.25, lat: 25.85 });
    const c2 = buildFilterContext(collection([plpAnchor, lowCofte]), g);
    expect(c2.coLocationMsids.has("ZC2")).toBe(true);
  });

  it("formatCoLocationReason flags the enrollment proxy and never invents a PLP for the OZ-only case", () => {
    const ozOnly = formatCoLocationReason({
      utilPct: 40, basis: "enrollment", isPlpAnchor: false, inOpportunityZone: true, nearestPlp: null,
    });
    expect(ozOnly).toBe("Underused at 40% of capacity (enrollment estimate), in a Qualified Opportunity Zone");
    expect(ozOnly).not.toMatch(/within 5 miles/);
  });

  it("a drawn boundary keeps only schools whose point falls inside it", () => {
    // Box covering the anchor/nearAnchor cluster but not the far or Broward school.
    const boundary = [
      { lat: 25.80, lng: -80.32 },
      { lat: 25.92, lng: -80.32 },
      { lat: 25.92, lng: -80.18 },
      { lat: 25.80, lng: -80.18 },
    ];
    const input: SchoolFilterInput = { ...base, boundary };
    expect(passesFilters(anchor, input, ctx)).toBe(true);       // -80.25, 25.85 inside
    expect(passesFilters(nearAnchor, input, ctx)).toBe(true);   // -80.28, 25.86 inside
    expect(passesFilters(farFromAnchor, input, ctx)).toBe(false); // -80.10 east of box
    expect(passesFilters(brw, input, ctx)).toBe(false);         // 26.15 north of box
  });
});
