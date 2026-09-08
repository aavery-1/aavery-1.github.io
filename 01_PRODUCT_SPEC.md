# Product Spec: Florida School Facilities Explorer

## Purpose
An internal analyst tool for exploring where to open new schools in Florida. The tool shows facts on a map. The analyst forms the judgment. **The tool never scores, ranks, or recommends a site.** Any weighting or comparison logic belongs in the analyst's own spreadsheet, downstream, using data this tool exports.

Pilot geography: Miami-Dade, Broward, Orange. Two very different growth stories in one product (dense coastal South Florida and inland high-growth Orlando).

## Users
Internal analysts, data-literate. Optimize for information density, precise numbers, layer control, and trust in the data. Not a public-facing product.

## Core UX: a layered map explorer

**Base map.** Google Maps hybrid/satellite. Zoom to individual school rooftops.

**Schools.** Every school is a pin. Pin encodes two things at once:
- **Fill color** = current letter grade (A green, B blue, C amber, D orange, F red).
- **Letter inside the pin** = the same grade, so the encoding survives grayscale printing, colorblind viewers, and small zoom levels.
- Non-standard grades render distinctly: **I** (Incomplete, gray fill), **NR** (Not Rated, white fill with gray outline), **NG** (No Grade, dashed outline, for schools too new to have a grade). Never coerce these to A-F.

**Overlays.** Each dataset is an independent, toggleable layer, grouped in a right-side panel:
- Schools: locations by grade
- Demand: household income, population growth
- Risk: flood zones
- Boundaries: school board member districts, legislative districts
- Context: opportunity zones, drive-time reach

**Tools.**
- **Measure distance** (geodesic; see 05_ACCURACY_STANDARDS.md).
- **Radius from a point** (N-mile geodesic buffer; not a pixel circle).
- **Compare sites.** Pin up to 4 locations. The inspector opens as a stacked comparison view showing the same rows for each site. **No composite score, no aggregate ranking. Rows are laid out for the analyst to read across.**
- **Export.** Every inspector view, every radius selection, every comparison exports to CSV. What the analyst does with the CSV (weighting, scoring, memo prep) is their business. Giving them a clean export means their downstream analysis is at least based on this tool's data, not a hand-typed re-entry.

**Scale bar.** Always visible, always accurate at the current map latitude. Measurements from the tool and the scale bar are the same units and agree on any test segment.

## The school inspector

Opens when the analyst clicks a school pin. Three sections.

### Identity
- School name, level (Elementary / Middle / High / Combination / Adult / Other)
- County and school board sub-district
- Type: Traditional / Charter / Magnet / Virtual / Other
- Operator name (for charters). Seeing which nearby schools are already run by which operators signals competition and saturation.

### Performance
- **Current letter grade** shown as a labeled badge (letter + color + word: "B, Grade B").
- **Historic grade timeline.** One pill per school year the school has a grade. Pills are placed on a horizontal year axis so gaps read as gaps. **Do not connect the pills with a trend line.** Florida changed its grading formula around 2010, 2012, 2015, and again in 2022 (B.E.S.T. standards baseline reset). Any trend line across those breaks is misleading. Instead, show subtle vertical dividers at the formula-change years with a hover note explaining the change.
- Enrollment (current), and if available: enrollment trend over the last 5 years, and utilization vs. capacity.

### Context (spatial reads from active layers)
Rows populate from whichever overlays are currently loaded. Rows for un-loaded overlays show "layer not loaded" (with a one-click enable), not a fake zero.

- **Tract median household income** with source and vintage: e.g. "$62,340 (ACS 2019-2023, tract 12086.005600)"
- **FEMA flood zone** at the point: e.g. "AE (1% annual chance)"
- **Drive-time reach**: population within 15 minutes by car (only after the isochrone layer ships)
- **In an Opportunity Zone?** Yes/No with tract GEOID
- **Legislative districts** (state house, state senate, congressional) with district numbers only. Representative names are a P5 add.

Every value carries its source and vintage on hover. The analyst can copy any single value to clipboard.

## Compare mode

The analyst pins 2-4 locations (existing schools or arbitrary map points). A side-by-side inspector opens showing the same rows for each pinned site. Rows are aligned so the analyst can read across. No column is highlighted as "best." No aggregate. The analyst reads and decides.

## Missing data behavior

- Pin with no grade: gray outline with "NG" letter, not omitted.
- Context row with no source loaded: "layer not loaded" plus an enable button.
- Context row with source loaded but no value at that point: "no data at this location", not "$0" or "unknown".
- Every empty state names why it is empty. The analyst always knows whether they are looking at a real value, a missing value, or a not-yet-loaded value.

## Delivery: production architecture, shipped in slices

Build the architecture to production standards. Ship one layer at a time.

- **MVP:** base map + grade-encoded pins + inspector + household income + board districts + measure + radius + compare + CSV export.
- **P1:** flood zones (highest value in coastal Miami-Dade and Broward).
- **P2:** drive-time reach (isochrones).
- **P3:** population growth (births + migration).
- **P4:** opportunity zones (small layer; can jump the queue).
- **P5:** legislative districts + representative names.
- **Optional:** parcels (three per-county pipelines; only if site-level land context is wanted).

## What this product is not
- Not a scoring or ranking engine.
- Not a public-facing tool.
- Not a real-estate search product.
- Not a replacement for on-the-ground diligence.
- Not a data warehouse. It reads from committed sample data now and canonical published sources later. The analyst does not curate data here.

## Design intent
See `02_DESIGN_SYSTEM.md`. The visual goal is clean, minimal, dense-but-readable, with the map itself as the primary surface and everything else floating over it in small purposeful panels.
