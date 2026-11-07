import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  sohMarker,
  sohMarkerLabel,
  hasKippMarker,
  isSuccessColocation,
  isKippRequestedBuilding,
  setKippRequestedMsids,
} from "../derive/sohSites";

// The real KIPP requested-building list is private (served by Supabase to an
// unlocked session), so the tests install placeholder MSIDs and district names
// that are not in the dataset.
beforeAll(() => setKippRequestedMsids(["99-0001", "99-0002", "99-0003"]));
afterAll(() => setKippRequestedMsids([]));

// The classifier is the single source of truth for the map marker layers, the
// legend meaning, and the hover card, so these lock its four outcomes and the
// exact MSID registries the deck designates.

describe("sohMarker", () => {
  it("stars Mater Academy schools (existing operator behavior)", () => {
    expect(sohMarker("Mater Academy Sole Mia", "13-5414")).toBe("star");
    expect(sohMarker("Mater Brickell Academy High", "13-5422")).toBe("star");
  });

  it("stars Success Academy approved co-location hosts (by MSID)", () => {
    // Host district high schools; their names are not Success Academy names.
    expect(sohMarker("North Miami Senior High School", "13-7591")).toBe("star");
    expect(sohMarker("Homestead Senior High School", "13-7151")).toBe("star");
    expect(sohMarker("Miami Jackson Senior High School", "13-7341")).toBe("star");
  });

  it("draws current KIPP campuses as a solid dot, not a star", () => {
    expect(sohMarker("KIPP Legacy Middle", "KIPP-LEGMID")).toBe("kipp-current");
    expect(sohMarker("KIPP Miami Technical High School", "KIPP-TECHHS")).toBe("kipp-current");
  });

  it("draws KIPP requested district buildings as an open dot", () => {
    // These are district host schools, matched by MSID; the requested designation
    // wins over the school's own district identity.
    expect(sohMarker("Test District Middle School", "99-0001")).toBe("kipp-requested");
    expect(sohMarker("Test District K-8 Center", "99-0002")).toBe("kipp-requested");
    expect(sohMarker("Test District K-8 Academy", "99-0003")).toBe("kipp-requested");
  });

  it("leaves ordinary schools unmarked", () => {
    expect(sohMarker("Miami Springs Senior High", "13-7351")).toBeNull();
  });
});

describe("sohMarkerLabel", () => {
  it("names each School of Hope designation for the hover card", () => {
    expect(sohMarkerLabel("Mater Academy Sole Mia", "13-5414")).toBe(
      "School of Hope · Mater Academy",
    );
    expect(sohMarkerLabel("North Miami Senior High School", "13-7591")).toBe(
      "School of Hope · Success Academy co-location",
    );
    expect(sohMarkerLabel("KIPP Legacy Middle", "KIPP-LEGMID")).toBe(
      "School of Hope · KIPP Miami",
    );
    expect(sohMarkerLabel("Test District Middle School", "99-0001")).toBe(
      "Requested building · KIPP Miami",
    );
    expect(sohMarkerLabel("Miami Springs Senior High", "13-7351")).toBeNull();
  });
});

describe("registries and corner ownership", () => {
  it("exposes the exact designated MSID sets", () => {
    expect(isSuccessColocation("13-7049")).toBe(true); // Westland Hialeah Senior High
    expect(isSuccessColocation("13-5414")).toBe(false); // a Mater school, not a co-location
    expect(isKippRequestedBuilding("99-0003")).toBe(true); // a placeholder requested building
    expect(isKippRequestedBuilding("13-7591")).toBe(false); // a Success host, not a KIPP request
  });

  it("gives a KIPP dot the upper-right corner (teal co-location dot yields)", () => {
    expect(hasKippMarker("KIPP Legacy Middle", "KIPP-LEGMID")).toBe(true);
    expect(hasKippMarker("Test District Middle School", "99-0001")).toBe(true);
    expect(hasKippMarker("Mater Academy Sole Mia", "13-5414")).toBe(false); // a star, not a KIPP dot
    expect(hasKippMarker("North Miami Senior High School", "13-7591")).toBe(false);
  });
});
