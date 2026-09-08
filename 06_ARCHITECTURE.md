# Architecture

## Stack

**Front end (build this now):**
- **React 18 + TypeScript**, Vite as the bundler.
- **Google Maps JavaScript API** for the base map and satellite imagery.
- **`@deck.gl/google-maps` `GoogleMapsOverlay`** for all data overlays. Do not use Google's native data layer, which bogs down with many toggled polygon layers.
- **turf.js** for geodesic distance, buffers, point-in-polygon, area weighting on the client.
- **rbush** for client-side spatial indexing of loaded polygons (used by the inspector's point-in-polygon lookups).
- **Zustand** for global UI state. Small enough to avoid Redux ceremony. Predictable enough to reason about.
- **Vitest** for unit tests. **Playwright** for a small smoke suite (map loads, layer toggles, inspector opens).

**Node and package manager:**
- Node 20 LTS. Ship a `.nvmrc` with `20`.
- npm (default). Ship `package-lock.json`. Do not require pnpm or yarn.

**Back end (documented, not required to run the one-shot):**
- **PostgreSQL + PostGIS** as the canonical store. `geography` type for true measurement. GiST indexes on every geometry column.
- **Vector tiles** (pg_tileserv or Tippecanoe to static tiles) for large polygon layers.
- **Isochrone service.** Self-hosted Valhalla on a small VM is the recommended default at 3-county scale. OpenRouteService free tier is for demos and one-off runs only (see `03_DATA_CATALOG.md`). Precompute and cache isochrone polygons.

**Deploy target (out of scope for one-shot, named so the second pass is not blocked):**
- Vercel or Netlify for the static front end. Google Maps key gated by HTTP referrer restriction.
- Postgres on a managed service (Neon, Supabase, RDS) for the backend when it ships.

## Data flow

```
Raw sources (see 03_DATA_CATALOG.md)
  → ingest, reproject to WGS84, validate against 04_SAMPLE_SCHEMAS.md, stamp provenance   [second pass]
  → PostGIS (geography type, GiST indexes)                                                [second pass]
  → vector tiles or GeoJSON endpoints
  → deck.gl layers on the Google base
  → layer panel + school inspector + measurement tools (client)
```

For the one-shot build, replace the first three steps with committed **sample GeoJSON** in `/public/data/`, loaded through the same adapter interface the real sources will use.

## State model

Global state (Zustand store):
- `activeLayerIds: Set<string>`: which layers are toggled on. Persisted to URL as a comma-separated hash param.
- `selectedSchoolMsid: string | null`: currently opened in the inspector.
- `comparePinnedMsids: string[]`: up to 4 items; opens compare drawer when length ≥ 2. Persisted to URL.
- `activeTool: 'none' | 'measure' | 'radius'`: one-at-a-time.
- `measurePoints: LatLng[]`: set while measure is active.
- `radiusCenter: LatLng | null` and `radiusMiles: number`: the current radius drawing.
- `mapCenter: LatLng` and `mapZoom: number`: mirrored for scale bar computation and URL persistence.

Component-local state (React state):
- Panel scroll positions, hover states, tooltip visibility, form input drafts.

URL persistence:
- On any change to `activeLayerIds`, `selectedSchoolMsid`, `comparePinnedMsids`, `mapCenter`, `mapZoom`, `activeTool`, and the radius parameters, update the URL hash. This makes every view shareable via link.
- On mount, hydrate the store from the URL hash.

Loaded data (not in Zustand, held in a data-loading layer with React Query or a simple loader hook):
- Per-layer GeoJSON or tile URLs, cached in memory.
- Per-layer error state.
- Per-layer load state.

## App structure

```
src/
  main.tsx
  App.tsx
  theme.ts                       # tokens from 02_DESIGN_SYSTEM.md
  store.ts                       # Zustand store

  config/
    layers.ts                    # loads 07_LAYERS.config.json (typed)

  map/
    MapView.tsx                  # Google base + deck.gl overlay
    ScaleBar.tsx                 # accurate, ground-truth
    CoordReadout.tsx             # mouse-follow coordinates, bottom-left
    useDeckLayers.ts             # builds deck.gl layers from config + active state
    useMapPersistence.ts         # URL hash sync

  panel/
    LayerPanel.tsx               # right side, grouped toggles from config
    LayerGroup.tsx               # accordion group
    LayerRow.tsx                 # single toggle with legend swatch + vintage
    Legend.tsx                   # units + vintage per active layer

  inspector/
    SchoolInspector.tsx          # identity + performance + context per product spec
    GradeTimeline.tsx            # historic grade pills; formula-change dividers
    ContextRows.tsx              # spatial reads from active layers
    CompareDrawer.tsx            # 2-4 side by side; no aggregation

  tools/
    MeasureTool.tsx              # geodesic distance
    RadiusTool.tsx               # geodesic N-mile buffer + population apportionment
    ExportButton.tsx             # CSV export from inspector or radius selection

  geo/
    measure.ts                   # turf wrappers; the ONLY place distance/area is computed
    buffer.ts                    # geodesic buffers
    intersect.ts                 # buffer ∩ polygon with area weighting
    crs.ts                       # projection notes and helpers for FL
    spatialIndex.ts              # rbush wrapper for loaded polygons
    __tests__/                   # Vitest suite; runs in CI

  data/
    types.ts                     # shared types matching 04_SAMPLE_SCHEMAS.md
    validate.ts                  # schema validators; fail-loud
    adapters/                    # one loader per layer; sample now, real source TODO
      schools.ts
      grades.ts
      income.ts
      boardDistricts.ts
      flood.ts
      isochrones.ts
      births.ts
      migration.ts
      opportunityZones.ts
      legislative.ts
      reps.ts
      parcels.ts

  ui/
    Card.tsx, Chip.tsx, Button.tsx, Toggle.tsx, EmptyState.tsx, ErrorBoundary.tsx
    icons.tsx                    # Lucide re-exports, uniform sizing

  errors/
    RootErrorBoundary.tsx        # catches render errors; shows recovery UI
    layerErrors.ts               # per-layer error state helpers

public/
  data/                          # committed sample GeoJSON files (see 04_SAMPLE_SCHEMAS.md)

.env.example                     # VITE_GOOGLE_MAPS_API_KEY=
.nvmrc                           # 20
README.md                        # run steps
PROJECT_NOTES.md                 # sample-vs-real inventory + ordered TODO to wire real data
```

## Principles

- **Config-driven layers.** The panel, legends, and deck.gl layers are all generated from `07_LAYERS.config.json`. Adding a layer is editing that file (with a matching adapter and sample file if it renders). See the config for exact schema.
- **Single source of geometric truth.** All distance, area, buffer, and intersection math lives in `src/geo/`. No component measures anything on its own. Enforced by test.
- **Adapters isolate data.** Swapping sample data for real data is one file per layer. The UI never changes.
- **Fail loud on data problems, fail soft on runtime problems.** A malformed schema fails a specific layer's load with a specific message. A map render error is caught by an ErrorBoundary and shown as a recoverable panel, never a white screen.
- **Every component testable in isolation.** No component reaches into the store for data it wasn't given as a prop, unless it is a container. Containers are small and named `*Container.tsx`.

## Error boundaries

- **Root error boundary** wraps the whole app. Catches any uncaught render error. Shows a recovery UI with a "reload" button and a link to file an issue.
- **Map error boundary** wraps `MapView`. Google Maps script failure or deck.gl error stays contained; the panel and inspector keep working.
- **Layer error state** is per-layer, held in the data-loading layer. A single layer failing to load shows an error chip in that layer's row, with a retry button. Other layers keep working.

## Testing

- **Unit tests** (Vitest): `src/geo/__tests__/` covers every function in the geo module with the specific assertions listed in `05_ACCURACY_STANDARDS.md` section 5. `src/data/__tests__/` validates every sample file loads and passes its schema.
- **Component tests** (Vitest + Testing Library): critical UI paths only. Inspector opens with correct fields for a known school. Layer toggle actually toggles the deck.gl layer. Empty states appear when expected.
- **Smoke tests** (Playwright): one test. Load the app with a sample key, toggle two layers on, click a school pin, confirm the inspector contains a grade timeline.
- **CI** runs unit + component tests on every PR. Smoke test runs on merges to main.

## Region generalization

The pilot is 3 counties. Adding Palm Beach, Hillsborough, or Duval:

- **Zero-adapter layers** (canonical statewide join keys): schools, grades, ACS income, flood zones, legislative districts, opportunity zones. Add the new county's data to the sample file or ingestion, no code change.
- **Per-county-adapter layers** (each county publishes independently): board districts, parcels, some Supervisor-of-Elections files. Add a new per-county source and update the layer's adapter to fetch both.

Budget the per-county friction into any expansion estimate. See `03_DATA_CATALOG.md`.

## What is not built in the one-shot

- Live ingestion of all 13 datasets.
- Any backend (Postgres, tile server, isochrone service).
- Auth, user accounts, or multi-tenancy.
- Deployment configuration (though the target is named above).
- Real-time collaboration or shared saved views (URL sharing is the substitute).

These are second-pass work. The architecture is set up to receive them without a rewrite.
