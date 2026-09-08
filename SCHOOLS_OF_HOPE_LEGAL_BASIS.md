# Schools of Hope: legal basis for the tool's eligibility logic

This document is the single authoritative reference for every legal constant and
rule the tool encodes. It is drawn from primary sources (Florida Statutes, the
Florida Administrative Code) and contemporaneous reporting on the 2025-2026
rulemaking. Where the tool's code hard-codes a threshold, it cites this file, and
this file cites the law. **Verify against the live sources before any production
or real-money use; this is a developer reference, not legal advice.**

Last reconciled: 2026-09-06.

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

Statutory definition: a school that has **earned three grades lower than "C" in
at least 3 of the previous 5 years** AND has **not earned a "B" or higher in the
most recent 2 school years**.

- The authoritative PLPS list is published by FL DOE. The tool prefers that list
  (`public/data/plp.sample.json`) over any recomputation.
- Tool note: the front-end's fallback computation approximates this; the official
  list governs when present.

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
