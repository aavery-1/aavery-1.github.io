// Data sources & accuracy reference, opened from the AppBar help menu. This is a
// trust surface: for a tool used to make siting decisions, every value on screen
// must be traceable to a named source with its vintage AND an honest note on
// coverage/confidence. Kept in sync with the vintage stamps in public/data/*.
//
// Confidence tags are deliberate and honest: "Verified" means checked against the
// primary source; "Official" means the authoritative government dataset;
// "Derived" means computed by the tool (spatial join or formula) and therefore
// dependent on the inputs; a coverage figure means the field is not populated for
// every school.

import { Modal, Tag } from "@carbon/react";
import "./AttributionStrip.carbon.css";

type Confidence = "Verified" | "Official" | "Derived" | "Coverage" | "Reference";

interface Entry {
  label: string;
  source: string;
  vintage?: string;
  note?: string;        // honest coverage / confidence caveat
  tag: Confidence;
  tagText?: string;     // overrides the tag label (e.g. a coverage percentage)
}

interface Group { heading: string; entries: Entry[]; }

const GROUPS: Group[] = [
  {
    heading: "Per-school data",
    entries: [
      { label: "School directory & MSID", tag: "Official",
        source: "NCES Common Core of Data, via Urban Institute Education Data Portal",
        vintage: "2023-2024 directory",
        note: "1,149 schools, each with a unique MSID (district-school, e.g. 13-0801), rebuilt from the 2023-24 CCD directory (open and operating schools in Miami-Dade, Broward, and Orange). Closed and consolidated schools are excluded; any school with a current A-F grade is retained even if the directory lags. 13 K-8 schools missing from the directory but present in the FL DOE county school lists (new campuses and charters) were reconciled in and geocoded to their street address." },
      { label: "Letter grades (current & history)", tag: "Verified",
        source: "Florida Department of Education, School Grades files",
        vintage: "1999-2000 through 2025-2026",
        note: "Cross-checked cell-for-cell against the FL DOE spreadsheet: 992 graded schools, every year, 0 discrepancies. 'Current grade' is the most recent A-F year. 992 schools carry a current A-F grade; 157 (charter/alternative/virtual/ESE centers) are ungraded and show NR." },
      { label: "Persistently Low-Performing (PLP)", tag: "Official",
        source: "FL DOE PLP designations list per F.S. 1002.333",
        vintage: "2024-2025 (latest published)",
        note: "We use the official DOE list directly, not inferred, and it captures all three statutory criteria. It remains the current determination: DOE has released SY25-26 letter grades but has not yet published a 2025-26 PLP list. In these three counties every listed school qualifies on the grade-3 ELA or grade-4 math bottom-10% screening (criterion c3), not on letter grades, so the new grades do not change the roster." },
      { label: "Title I eligibility", tag: "Official",
        source: "NCES Common Core of Data (Title I eligibility flag)",
        vintage: "2023-2024 directory",
        note: "879 eligible / 216 not, from the CCD directory. 41 recently added or reopened schools have no Title I flag yet and show 'unknown', which the tool counts as possibly eligible. A school's Title I status can change year to year." },
      { label: "Enrollment (current & history)", tag: "Official",
        source: "FL DOE Membership by School by Grade, Final Survey 2 (October count); Broward SY2026-27 from the Broward County Tenth Day Enrollment Count",
        vintage: "2020-2021 through 2024-2025 (Broward through 2026-2027)",
        note: "The authoritative enrollment used for FEFP funding. For Miami-Dade and Orange, each school's number is its most recent Final Survey 2 total (2024-25 for nearly all), with the year shown per school; the inspector trend spans all five years. Broward County carries a fresher figure: its SY2026-27 headline (and newest trend point) is the district's official Tenth Day Enrollment Count, a PK-12 headcount taken on the tenth day of school (Aug 21, 2026) rather than the October Survey 2. The two surveys differ only marginally, and every figure is year-stamped, so a school reading SY2026-2027 is the Tenth Day count. Broward schools that closed or converted for 2026-27 (e.g. Plantation Middle, folded into Plantation 6-12) correctly report 0. Schools with no membership record (adult/technical colleges, detention centers, planned or placeholder entries, and multi-campus charters under a single shared MSID such as KIPP Miami) show enrollment as N/A rather than a fabricated or carried-forward value." },
      { label: "Capacity, COFTE & surplus", tag: "Official",
        source: "FL DOE FISH Level of Service reports, SY2025-26, per county: Miami-Dade (reported 2026-04-10), Broward (2026-04-01), Orange (2026-04-01)",
        note: "Authoritative student stations, capital-outlay FTE enrollment (COFTE), and surplus for 746 district-operated schools, matched by name (all three counties now on the current SY2025-26 report). Capacity is the FISH SCHOOL CAPACITY = total student stations (permanent plus portable), which is the statute's 'total student stations' (Rule 6A-1.0998271(1)(n),(f)) and the denominator for every utilization and co-location test. The inspector and Compare view also disclose PERMANENT CAPACITY (the permanent building's stations, excluding portables) as a reference; it is never used in the statutory tests. Charters/virtual and a few unmatched schools show 'not reported' (co-location applies only to district facilities). Seven Broward campuses renamed in the 2024-25 K-8 conversion (e.g. Hollywood Central Elementary, now Hollywood Central Preparatory K-8) are matched to their current FISH facility by MSID." },
    ],
  },
  {
    heading: "Districts & boundaries",
    entries: [
      { label: "Congressional / State House / State Senate", tag: "Derived",
        source: "U.S. Census Bureau TIGERweb (119th Congress; 2024 state legislative districts)",
        note: "Each school is assigned by a spatial join against the official district boundaries. Confirm any school within a few hundred feet of a district line against its address." },
      { label: "Representatives", tag: "Reference",
        source: "unitedstates/congress-legislators (U.S. House) + Florida House & Senate chamber rosters",
        vintage: "retrieved 2026-09-06",
        note: "Names reflect the roster at retrieval. Verify after any election or appointment." },
      { label: "School board districts", tag: "Derived",
        source: "Miami-Dade & Broward county GIS boundaries + Supervisor-of-Elections rosters; Orange from OCPS per-district school lists",
        note: "Miami-Dade and Broward are assigned by spatial join against official polygons. Orange has no open boundary GIS, so its schools are matched to a board district by the district's own school list (195 of 202 matched); Orange has no boundary overlay." },
    ],
  },
  {
    heading: "Map overlays",
    entries: [
      { label: "Opportunity Zones", tag: "Official",
        source: "HUD spatial representation of Treasury/IRS-designated Qualified Opportunity Zones",
        vintage: "2018 designations, in effect through 12/31/2028",
        note: "Used as one of the statutory siting pathways (F.S. 1002.333(1)(d)1.b)." },
      { label: "Median household income", tag: "Official",
        source: "U.S. Census Bureau ACS 5-year (B19013) + TIGERweb tracts",
        vintage: "2019-2023",
        note: "Tract-level estimate. Respect the ACS margin of error for small tracts." },
      { label: "Population growth", tag: "Official",
        source: "U.S. Census Bureau Population Estimates Program (Vintage 2024) + ACS 5-year",
        vintage: "2023 to 2024",
        note: "County level." },
      { label: "Schools of Hope", tag: "Official",
        source: "FL DOE designated hope operators (s. 1002.333(2), F.S.)",
        note: "A School of Hope is a charter run by a state-designated hope operator (Mater, KIPP, IDEA, RCMA, Success, Renaissance/Warrington). These schools are charters for every filter and count, and carry a gold star on their marker. No longer a separate map layer." },
    ],
  },
  {
    heading: "Computed by the tool",
    entries: [
      { label: "Co-location candidate", tag: "Derived",
        source: "F.S. 1002.333(7) and Rule 6A-1.0998271(5)",
        note: "A district facility that is underused (statutory COFTE-based Facility Utilization Rate at or below 75%, or 400+ surplus student stations from FISH) AND inside a School of Hope siting area. Labeled 'candidate', not 'eligible', because the rule also bars co-location at buildings placed into service within the last 4 years, and per-building age is not in the available data." },
      { label: "School of Hope siting area", tag: "Derived",
        source: "F.S. 1002.333(1)(d)1.b",
        note: "The greater of a PLP school's attendance zone, a 5-mile radius of a PLP school (same district), or a Florida Opportunity Zone, and Title I eligible. Attendance zones are not modeled (always smaller than the 5-mile radius in these counties)." },
      { label: "Distances, radii, and areas", tag: "Verified",
        source: "WGS84 ellipsoidal geodesic (Vincenty); areas on the WGS84 ellipsoid",
        note: "Validated against the canonical Vincenty reference to under 1 mm and machine-checked in the test suite. Rendered in Web Mercator but never measured in it." },
    ],
  },
];

// Per-tag confidence colors carry meaning (not chrome), so they stay literal.
// alpha() from MUI is inlined here as rgba() tints of the same source hues.
const TAG_STYLE: Record<Confidence, { bg: string; fg: string }> = {
  Verified: { bg: "rgba(13,148,136,0.14)", fg: "#0F766E" },
  Official: { bg: "rgba(15,98,254,0.12)", fg: "#1E40AF" },
  Derived: { bg: "rgba(217,119,6,0.14)", fg: "#B45309" },
  Coverage: { bg: "rgba(217,119,6,0.14)", fg: "#B45309" },
  Reference: { bg: "rgba(82,82,82,0.14)", fg: "var(--text-secondary)" },
};

export function AttributionStrip({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      onRequestSubmit={onClose}
      modalHeading="Data sources & accuracy"
      primaryButtonText="Done"
      size="sm"
      aria-label="Data sources and accuracy"
    >
      <p className="attribution-intro">
        Every value on the map traces to a named source. Tags say how far we can vouch for it:
        {" "}<b>Verified</b> (checked against the source), <b>Official</b> (authoritative dataset),
        {" "}<b>Derived</b> (computed by the tool), or a coverage figure.
      </p>

      {GROUPS.map((group) => (
        <section key={group.heading} className="attribution-group">
          <h3 className="attribution-group__heading">{group.heading}</h3>
          {group.entries.map((e) => {
            const t = TAG_STYLE[e.tag];
            return (
              <div key={e.label} className="attribution-entry">
                <div className="attribution-entry__head">
                  <span className="attribution-entry__label">{e.label}</span>
                  <Tag size="sm" className="attribution-tag" style={{ backgroundColor: t.bg, color: t.fg }}>
                    {e.tagText ?? e.tag}
                  </Tag>
                </div>
                <p className="attribution-entry__source">
                  {e.source}{e.vintage ? <span className="attribution-entry__vintage"> · {e.vintage}</span> : null}
                </p>
                {e.note && <p className="attribution-entry__note">{e.note}</p>}
              </div>
            );
          })}
        </section>
      ))}

      <p className="attribution-footer">
        Base map imagery © Google. This tool supports siting analysis. Confirm any specific eligibility determination against the primary FL DOE and county records before acting.
      </p>
    </Modal>
  );
}
