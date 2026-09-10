# Schools of Hope: legal basis for the tool's eligibility logic

This document is the single authoritative reference for every legal constant and
rule the tool encodes. It is drawn from primary sources (Florida Statutes, the
Florida Administrative Code) and contemporaneous reporting on the 2025-2026
rulemaking. Where the tool's code hard-codes a threshold, it cites this file, and
this file cites the law. **Verify against the live sources before any production
or real-money use; this is a developer reference, not legal advice.**

Last reconciled: 2026-09-09.

## Sources

- **F.S. 1002.333, Schools of Hope** - primary statute.
  https://www.flsenate.gov/Laws/Statutes/2024/1002.333
- **Rule 6A-1.0998271, F.A.C.** - State Board of Education implementing rule
  ("requirements for designation as a School of Hope operator and for
  establishment of Schools of Hope pursuant to s. 1002.333, F.S.").
  https://www.flrules.org/gateway/ruleNo.asp?id=6A-1.0998271
- **2025 expansion** - inserted into the **General Appropriations Act (GAA)** at
  the end of the 2025 session (NOT a standalone "SB 2510"; see correction below),
  implemented through State Board rulemaking.
- **Feb 2026 rule amendment** - the State Board "trimmed" the co-location rule;
  the thresholds below are the operative ones after that amendment.

> **Citation correction.** The project's original seed prompt referenced
> "Senate Bill 2510 (2025)." Primary sources and reporting indicate the 2025
> expansion was enacted through the **General Appropriations Act**, not a bill by
> that number, and then implemented via Rule 6A-1.0998271. The tool cites the GAA
> + rule accordingly. If a specific bill number is needed for a filing, confirm
> it directly with the Legislature's records.

## 1. Persistently Low-Performing School (PLPS)

Statutory definition, s. 1002.333(1)(c), F.S. (current through the 2025
amendment, s. 5, ch. 2025-203) - a "persistently low-performing school" meets **at
least one** of three criteria:

1. earned a grade lower than "C" (s. 1008.34) in **at least 3 of the previous 5
   graded years** AND has **not earned a "B" or higher in the most recent 2 school
   years**;
2. was **closed** under s. 1008.33(4) within 2 years after a notice of intent; or
3. in the **bottom 10%** in at least 2 of the previous 3 years on the grade-3 ELA
   or grade-4 math coordinated screening (s. 1008.22(3)(a)2.).

Coverage and accuracy in the tool:

- The authoritative PLPS list is published by FL DOE. The tool loads it
  (`public/data/plp.sample.json`, key `plp_designations`) and uses it as the
  source of truth, so **every loaded school has a determinate PLP verdict**: on
  the list = PLP, absent = not PLP. The official list captures all three criteria
  (2 and 3 are not derivable from grade history alone). The tri-county join is
  exact (44/44 listed schools present in the dataset, 0 orphans), so coverage is
  100%.
- `src/data/derive/plp.ts` implements criterion 1 only, as a fallback used **just
  when the official list is absent**; it can only under-count relative to the
  list, so it never overrides it. Verified 2026-09-09 against the statute text
  reproduced in "Copy of Schools of Hope Resources.pdf".

## 1a. Designated hope operators (who may run a School of Hope)

A "school of hope" is a charter operated by a **hope operator** designated by the
State Board of Education under s. 1002.333(2), F.S. FL DOE publishes the roster;
as reproduced in "Copy of Schools of Hope Resources.pdf" (p.2), the six Florida
designated hope operators are:

1. **Mater Academy**
2. **RCMA** (Redlands Christian Migrant Association)
3. **IDEA Public Schools**
4. **Success Academy**
5. **Renaissance/Warrington Preparatory Academy**
6. **KIPP New Jersey**

The tool stars every loaded school run by one of these operators (gold star,
"Schools of Hope" map layer), alongside the Revolving Loan Fund sites of section
1001.292. The name-to-operator mapping is an explicit registry in
`src/data/derive/hopeOperators.ts`, precise on purpose:

- Only **Mater Academy** (29 schools) and **KIPP** (2 schools, KIPP Miami) have
  schools in the loaded tri-county data today; the other four operate elsewhere
  in Florida, so their rules match nothing here but keep the roster complete.
- The generic **"Renaissance Charter"** chain in Broward is run by Charter Schools
  USA and is **explicitly excluded**: it is not the designated
  "Renaissance/Warrington Preparatory Academy" (a single Escambia school), so a
  bare "renaissance" match would falsely star 13 schools that are not schools of
  hope.

Limitation: designation is an operator-network attribution by school name, not a
per-school School-of-Hope contract lookup, so a Mater/KIPP charter that predates
the SOH program is still starred as an operator school. The star tooltip labels
these "Hope Operator: <operator>" rather than asserting each site is itself a
contracted school of hope; the Revolving Loan Fund ledger sites are labeled
"Existing School of Hope" because those are the funded, contracted schools. So the
two things the tool can state with certainty are kept distinct in the copy:

- **A funded School of Hope** = a site on the Revolving Loan Fund ledger (F.S.
  1001.292). Authoritative list; 100% certain.
- **A Hope Operator site** = a loaded school whose name matches a designated
  operator's network (registry above). Certain that the operator is designated;
  not a claim that this specific building holds a School of Hope contract.

## 2. Geographic eligibility (where a School of Hope may open)

A School of Hope may open in the area that is the **greater** of:

1. the **attendance zone** of a persistently low-performing school, OR
2. **within a 5-mile radius of such school**, OR
3. inside a **Florida Opportunity Zone**.

Implementation notes:
- The statute says "within a 5-mile radius of **such school**." It does **not**
  specify measuring from the parcel/property line. The tool therefore defaults to
  measuring from the school location and treats "from the property line" as an
  optional, off-by-default refinement (`soh_config.buffer_from_property = false`).
- Buffers are computed in a meter-based CRS (EPSG:3086); 5 mi = 8046.72 m.
- Opportunity Zones are the real HUD/Treasury designated tracts already loaded.

## 3. Co-location pathway (underused public facilities)

Under the 2025 GAA expansion and Rule 6A-1.0998271 (as amended Feb 2026), a
public school is a **co-location target** when it is in an eligibility geography
(section 2) AND is underused, defined as **either**:

- **Facility Utilization Rate (FUR) below 75%**, OR
- **400 or more surplus student stations** (FISH capacity minus FTE enrollment).

Additional operative criteria from the Feb 2026 rule:

- The school must be **more than 4 years old** (brand-new facilities are excluded).
- **Cost:** the charter operates **rent-free**, but pays **maintenance** on the
  days it operates, and the district **may charge incremental utility costs**.
  (The older statutory ceiling for surplus-facility use is up to **$600 per
  student**; the co-location rule's rent-free-plus-maintenance model is the
  operative one for co-location specifically.)
- **Process limits (not spatial):** an operator may send **no more than 5
  co-location notices in any 12-month period**, and a notice must be filed **at
  least 1 year, and not more than 2 years, before the proposed opening**.

FUR = current FTE enrollment / FISH satisfactory student-station capacity x 100.

### 3a. Co-location candidate determination framework

This is the exact rule the tool applies, and what it can and cannot verify, so a
"co-location candidate" flag means one precise thing. A school is flagged **only
when every data-testable criterion below is met**; the remaining criteria are
named as desk-research checks rather than silently assumed.

**Data-derived (the tool decides these with the loaded data):**

1. **District-operated building.** Any public school the district runs, i.e. every
   type except charter (not district-operated) and virtual (no building).
2. **Underused.** FUR <= 75% OR >= 400 surplus student stations (section 3). The
   tool uses the FISH COFTE-based FUR when a credible COFTE is reported and falls
   back to an enrollment proxy otherwise; the proxy is flagged in the UI.
3. **In a siting area.** Within 5 miles of a same-county persistently
   low-performing school, OR inside a Florida Opportunity Zone, OR itself a PLP
   school (section 2). Same-county because the Notice of Intent is filed in the
   district where the PLP school sits (Rule 6A-1.0998271(3)).

**Desk-research checks (NOT in the data; must be confirmed before acting):**

4. **Facility age > 4 years** (Rule 6A-1.0998271(5)(f)). No building-age data is
   loaded. In these three mature counties nearly every district building is well
   over 4 years old, so the false-positive risk from omitting this is small but
   nonzero; the inspector discloses it on every candidate.
5. **Attendance-zone pathway** (section 2, the "greater of" the zone). Attendance
   zone boundaries are not loaded, so the tool tests only the 5-mile radius and
   Opportunity Zone. Because the siting area is the GREATER of the three, omitting
   zones can only UNDER-count (miss a school just outside 5 miles but inside a PLP
   school's zone); it never over-counts. To recover those, pull the district's
   attendance-zone GIS layer.

**Accuracy guarantee.** With this framework the flag has **no spatial or facility
false positives**: any flagged school genuinely is an underused, district-operated
building inside a mapped siting area. The only positive-side residual is criterion
4 (age), disclosed per candidate. The set is intentionally **conservative** on
criterion 5, which keeps it reliable for building an option set: every flagged
school is worth diligence, and the two named checks are the finite, known work
left to confirm one.

**To reach 100% determinacy** (what desk research would add): (a) a building
place-in-service date per school (district FISH or capital records) closes
criterion 4; (b) the district attendance-zone layer closes criterion 5; (c) the
per-school School-of-Hope contract roster would let a candidate be distinguished
from an already-operating School of Hope. None are required to build the option
set; each removes one caveat.

## 4. Sole-occupancy pathway (private real estate, rezoning-exempt)

A School of Hope is exempt from special exceptions / rezoning when it locates
**within existing institutional facilities**. The statute enumerates categories
including **libraries, community centers, museums, performing-arts venues
(theaters), churches / religious facilities, and college / university
facilities**.

Implementation note: the statute lists facility **categories**, not FDOR use
codes. The tool bridges categories to **FDOR "DOR_UC" land-use codes** in
`backend/fdor_fasttrack_use_codes` / `FAST_TRACK_DOR_CODES`. Those code mappings
are best-known values and **must be verified** against the current DOR Uniform
Use Code table and each county's NAL layout before use.

## 5. Other requirements

- **Title I eligibility:** a School of Hope must be a **Title I eligible school**.
  The tool carries `title_i_eligible` on each school point.
- **Exemptions** (context, not siting logic): ad valorem taxes, most building
  permit fees, occupational license fees, impact/service-availability fees.

## 6. Where each rule is encoded

| Legal rule | Encoded in | Constant |
|---|---|---|
| 5-mile radius / OZ / attendance zone | `backend/schema.sql` (`soh_eligibility_zones`), `backend/spatial_join.py` | `buffer_miles = 5` |
| FUR < 75% or >= 400 surplus | `backend/schema.sql` (`soh_colocation_targets`), `backend/capacity.py` | `fur_max_pct = 75`, `surplus_seats_min = 400` |
| School > 4 years old | `backend/schema.sql` (`soh_colocation_targets`) | `min_facility_age_years = 4` |
| Fast-track facility categories | `backend/schema.sql` (`fdor_fasttrack_use_codes`), `backend/spatial_join.py` | `FAST_TRACK_DOR_CODES` |
| Title I | `schools.title_i` | - |

Change a threshold in one place (`soh_config` for the DB, the module constants
for the scripts) and the whole tool follows.
