# BUILD PROMPT: paste this to Claude

You are building a **professional-grade, layered web map tool** for exploring school-facilities data across three Florida counties: Miami-Dade, Broward, and Orange. It is an internal analyst tool for evaluating where to open new schools. The analyst reads the map and makes the judgment. **The tool does not compute a score or a ranking. Ever.**

**Read every file in this folder before writing code:**
- `01_PRODUCT_SPEC.md`: the product, the UX, the school inspector, compare mode, export.
- `02_DESIGN_SYSTEM.md`: the visual system, component patterns, color, typography, accessibility.
- `03_DATA_CATALOG.md`: every data layer, source, format, resolution, join key, and caveats.
- `04_SAMPLE_SCHEMAS.md`: the exact shape and fields of every committed sample file.
- `05_ACCURACY_STANDARDS.md`: mandatory correctness, performance, presentation, and test rules.
- `06_ARCHITECTURE.md`: the stack, folder structure, state model, error handling, testing.
- `07_LAYERS.config.json`: the config that drives the layer panel, legends, deck.gl layers, and inspector.

Before writing any code, output a brief (5-8 sentence) understanding check confirming: the intended UX, the "no scoring" constraint, the "color + letter" pin encoding, the "5 miles is 5 miles" pledge, and how the config maps to `layers[]` vs `datasets[]`. If any of those seven files is missing or unclear, stop and ask.

## What to build (scope of this one-shot)

A runnable, professional front end that launches with sample data and looks and behaves like a finished tool:

1. **Google Maps JS API base map** in hybrid/satellite. Zoom to a school rooftop.
2. **Layer panel** on the right with grouped toggles from `07_LAYERS.config.json`. Layers render via deck.gl over the Google base (`GoogleMapsOverlay`, `GeoJsonLayer`, `ScatterplotLayer`), not Google's native data layer.
3. **School inspector** that opens on pin click. Identity, Performance, Context sections per `01_PRODUCT_SPEC.md`. Includes the historic letter-grade timeline with formula-change dividers.
4. **Compare mode**: pin 2 to 4 sites and open a side-by-side drawer showing the same rows. No aggregate. No score.
5. **Measure + radius tools**, both geodesically correct per `05_ACCURACY_STANDARDS.md`. Scale bar always visible and always matches the measure tool at any local segment. This is the "5 miles is 5 miles" guarantee, and it is enforced by automated tests in `src/geo/__tests__/`.
6. **CSV export** from the inspector, from compare mode, and from a radius selection.
7. **Sample data** committed in `/public/data/` following the schemas in `04_SAMPLE_SCHEMAS.md` exactly. A handful of schools per county with multi-year grades, a small income choropleth, board-district polygons, a flood-zone polygon, and one isochrone per county. Clearly marked as sample in the layer panel.
8. **Data-adapter module per layer** in `src/data/adapters/`, typed, with a `TODO` pointing at the real source from the catalog. Swapping sample for real must be a one-file edit per layer.
9. **Automated tests** for `src/geo/` and sample-file validation, wired into `npm test`. See `05_ACCURACY_STANDARDS.md` section 5 for the specific assertions.

## Hard requirements

- **Geospatial correctness is non-negotiable.** Follow `05_ACCURACY_STANDARDS.md` exactly: store WGS84, measure geodesically (turf.js Haversine, true buffers), never pixel or planar-degree math, scale bar equals real ground distance, tests enforce all of this.
- **Grade domain is the full set:** `A, B, C, D, F, I, NR, NG`. See `03_DATA_CATALOG.md`. Pins encode grade with color plus letter, never color alone.
- **Config-driven:** adding a rendered layer means editing `07_LAYERS.config.json` and adding an adapter and sample file. Nothing else in the UI.
- **Layers vs datasets are separate.** Things that render on the map go in `layers[]`. Things that only feed the inspector (historic grades, representatives, enrollment history) go in `datasets[]`.
- **Design fidelity:** follow `02_DESIGN_SYSTEM.md`. Clean, minimal, information-dense. Floating panels over a full-bleed map. All labels state what they mean (units and vintage).
- **State model:** Zustand store as specified in `06_ARCHITECTURE.md`. URL hash persistence for active layers, selected school, compare pins, map center, and zoom.
- **Error handling:** RootErrorBoundary, MapErrorBoundary, per-layer error state. Never a white screen.
- **Missing key behavior:** if `VITE_GOOGLE_MAPS_API_KEY` is missing from `.env`, show a specific, friendly setup message. Do not crash. Do not blank-page.
- **TypeScript, Node 20, npm.** Ship `.nvmrc`, `.env.example`, `package-lock.json`. No pnpm/yarn requirement.
- **Ship a README** with exact run steps and a `PROJECT_NOTES.md` listing what is sample vs real and the ordered TODO to wire real data.
- **Prose style:** no em dashes anywhere in code comments, UI copy, or docs. Use commas, periods, colons, or parentheses. UI copy is purposeful and concrete (never "Data" alone; always "Median household income (ACS 2019-2023)" or similar).

## Explicit non-goals (do not attempt in this pass)

- No live download or ingestion of the 13 datasets.
- No hosted database, no auth, no deployment.
- No scoring, ranking, or "best fit" logic anywhere.
- Do not invent data URLs or values. Use committed sample files. Leave real sources as documented TODOs.

## Acceptance checklist (run and report before finishing)

- [ ] `npm install && npm run dev` launches a working map with sample layers toggling on and off.
- [ ] `npm test` passes. Includes: known-distance test, 5-mile geodesic buffer area test, latitude invariance test, area-weighted intersection test, sample-file schema validation.
- [ ] Clicking a sample school opens the inspector with the historic grade timeline. Formula-change years show a visible divider. `I`, `NR`, and `NG` schools render correctly (color + letter, no color alone).
- [ ] Measure tool reports a distance that matches the scale bar and matches a known reference (e.g. a mile of I-95) within 1%.
- [ ] 5-mile radius ring encloses the correct ground area (geodesic buffer, not pixel circle). Area displayed is ~78.5 mi².
- [ ] Compare mode: pinning 2 to 4 sites opens the compare drawer with rows aligned across columns. No aggregate score anywhere.
- [ ] CSV export from inspector, compare, and radius all produce a well-formed CSV file.
- [ ] Every layer, legend, and attribution renders. Every legend caption includes units and vintage (e.g. "Median household income, USD (ACS 2019-2023)"). Missing data shows a labeled empty state, never a "0" or blank.
- [ ] Adding a fake layer via `07_LAYERS.config.json` makes it appear in the panel with no other code changes (rendering may show "no sample" if no data is provided; the layer still appears).
- [ ] README run steps work from a clean clone on Node 20.
- [ ] No em dashes anywhere. All UI labels are concrete and purposeful.

Build the full project now. Start with the understanding check. Then confirm the stack from `06_ARCHITECTURE.md`. Then scaffold. Then implement. Then run `npm test` and the acceptance checklist and report results.
