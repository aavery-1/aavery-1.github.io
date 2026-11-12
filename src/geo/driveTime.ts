// Drive-time areas for a school: 5 and 10 minutes for the school day (drop-off and pickup areas averaged, the
// default), drop-off (home to campus, 8am) or pickup (campus to home, 4pm). The method is the shared engine's (src/shared-geo/sharedGeo.ts, byte-identical to Grove's;
// GEO_RULESET.md rule 8), so a school shows the same areas and the same children here and in Grove:
//   - Every school has a saved result (public/data/drive/, worked out by Grove's scripts/drive_precompute.ts on our own
//     routing server and copied here by its sync script): every home timed on pinned OpenStreetMap roads and adjusted
//     to Google's school-day time. Counts carry a 90% range (shared countRange: drive time and Census error). Measured sites use their own Google fit; the rest use the
//     regional adjustment and are labeled estimates.
//   - A point with no saved result gets a live estimate from the public Valhalla server at the regional cut-offs
//     (config/drive_time_calibration.json), counted block by block.

import { create } from "zustand";
import type { Polygon, MultiPolygon } from "geojson";
import { loadPopulationPoints, type AreaDemographics } from "./populationPoints";
import calibrationFile from "../config/drive_time_calibration.json";
import {
  driveView, driveNote, projectChildren, regionalSettings, ringDemographics, valhallaIO, DRIVE_MINUTES as SHARED_MINUTES, DRIVE_VIEWS, DEFAULT_VIEW, isDriveView, VIEW_LABELS,
  type CalibrationFile, type ChildProjection, type DriveResult, type DriveView, type DriveWindow as TimedWindow, type RangeModel, type SavedIndex, type SavedSiteFile, type SavedSource,
} from "../shared-geo/sharedGeo";

export const DRIVE_MINUTES = SHARED_MINUTES as readonly number[];
export { driveRegion } from "../shared-geo/sharedGeo";
/** What the panel shows: the school day (default) or one direction. */
export type DriveWindow = DriveView;
/** The 90% range model both tools use (config/drive_time_calibration.json; shared countRange). */
export const RANGE_MODEL = (calibrationFile as unknown as { rangeModel?: RangeModel }).rangeModel ?? null;
// Map-layer id; the one switch for drive-time mode (card, map button, layers panel).
export const DRIVE_LAYER_ID = "drive_time_reach";

export interface DriveContour {
  minutes: number;
  contour: number; // the Valhalla minutes drawn for this band
  geometry: Polygon | MultiPolygon;
  /** School day only: the pickup outline (`geometry` is drop-off) */
  geometry2?: Polygon | MultiPolygon | null;
  demographics: AreaDemographics | null; // null if the population data failed to load
  /** Children 5-17 now and five years on (the shared projection Grove's site report shows); null if its data failed */
  projection: ChildProjection | null;
  /** The same figures for the low and high areas (the drive-time spread a count's 90% range starts from) */
  low: AreaDemographics | null;
  high: AreaDemographics | null;
}
export interface DriveTimeResult {
  msid: string;
  origin: [number, number];
  window: DriveWindow;
  status: "measured" | "estimate";
  source: "saved" | "live";
  measuredOn: string | null;
  note: string;
  fit: DriveResult["fit"];
  basis: string | null;
  contours: DriveContour[]; // ascending minutes
  computedAt: string;
}
export type DriveTimeEntry =
  | { status: "loading"; step: string }
  | { status: "ready"; result: DriveTimeResult }
  | { status: "error"; message: string };

export const WINDOW_OPTIONS: DriveWindow[] = DRIVE_VIEWS;
export const windowLabel = (w: DriveWindow) => VIEW_LABELS[w]; // "School day (8am and 4pm)"
const WINDOW_KEY = "soh.drive.window";
function readWindow(): DriveWindow {
  try {
    const w = localStorage.getItem(WINDOW_KEY);
    if (isDriveView(w)) return w;
  } catch { /* storage blocked: use the default */ }
  return DEFAULT_VIEW;
}

/** The regional calibration for unmeasured schools (the same file and lookup Grove uses). */
export function valhallaSettings(lat: number, window: TimedWindow) {
  return regionalSettings(calibrationFile as unknown as CalibrationFile, lat, window);
}

let saved: Promise<SavedSource> | null = null;
function savedResults(): Promise<SavedSource> {
  const load = (file: string) => fetch(`/data/drive/sites/${file}`).then((r) => (r.ok ? (r.json() as Promise<SavedSiteFile>) : null)).catch(() => null);
  saved ??= fetch("/data/drive/index.json").then((r) => (r.ok ? (r.json() as Promise<SavedIndex>) : null)).catch(() => null).then((index) => ({ index, load }));
  return saved;
}
const io = valhallaIO((url, init) => fetch(url, init));

// Per-tract parts of the children 5-17 projection (copied from Grove; shared projectChildren adds them up)
let parts: Promise<Record<string, number[]> | null> | null = null;
function projectionParts(): Promise<Record<string, number[]> | null> {
  parts ??= fetch("/data/projection_parts.json").then((r) => (r.ok ? r.json() : null)).then((j) => (j ? (j as { tracts: Record<string, number[]> }).tracts : null)).catch(() => null);
  return parts;
}

/** One line describing how the areas were made (the shared wording Grove uses too). */
export function driveMethodNote(r: Pick<DriveTimeResult, "status" | "source" | "window" | "fit" | "measuredOn" | "basis">): string {
  return driveNote(r);
}

async function compute(msid: string, lng: number, lat: number, window: DriveWindow, step: (s: string) => void): Promise<DriveTimeResult> {
  step("Loading population data...");
  const [points, savedFile, proj] = await Promise.all([loadPopulationPoints(), savedResults(), projectionParts()]);
  step("Routing on the road network...");
  const r = await driveView(lng, lat, window, savedFile, (w) => valhallaSettings(lat, w), points.blocks, io);
  step("Counting who lives there...");
  return {
    msid, origin: [lng, lat], window, status: r.status, source: r.source, measuredOn: r.measuredOn, note: driveNote(r), fit: r.fit, basis: r.basis,
    contours: r.rings.map((x) => {
      const d = ringDemographics((g) => points.figures[g], x);
      return { minutes: x.minutes, contour: x.contour, geometry: x.geometry as Polygon | MultiPolygon, geometry2: (x.geometry2 ?? null) as Polygon | MultiPolygon | null, demographics: d.mid, low: d.low, high: d.high,
        projection: proj ? projectChildren((g) => proj[g], x.area) : null };
    }),
    computedAt: new Date().toISOString(),
  };
}

interface DriveTimeState {
  byMsid: Record<string, DriveTimeEntry>; // entries for the CURRENT time of day
  window: DriveWindow;
  request: (msid: string, lng: number, lat: number) => void;
  setWindow: (w: DriveWindow) => void;
}

// Session cache across times of day: "msid|window" -> entry, plus each school's coordinates for recomputing.
const cache = new Map<string, DriveTimeEntry>();
const coords = new Map<string, [number, number]>();

export const useDriveTimes = create<DriveTimeState>((set, get) => ({
  byMsid: {},
  window: readWindow(),
  request: (msid, lng, lat) => {
    coords.set(msid, [lng, lat]);
    const w = get().window, key = `${msid}|${w}`;
    const cur = cache.get(key);
    if (cur && cur.status !== "error") {
      if (get().byMsid[msid] !== cur) set((s) => ({ byMsid: { ...s.byMsid, [msid]: cur } }));
      return;
    }
    const put = (e: DriveTimeEntry) => {
      cache.set(key, e);
      if (get().window === w) set((s) => ({ byMsid: { ...s.byMsid, [msid]: e } }));
    };
    put({ status: "loading", step: "Starting..." });
    compute(msid, lng, lat, w, (step) => put({ status: "loading", step }))
      .then((result) => put({ status: "ready", result }))
      .catch((e) => put({ status: "error", message: e instanceof Error ? e.message : "Could not compute drive times." }));
  },
  setWindow: (w) => {
    try { localStorage.setItem(WINDOW_KEY, w); } catch { /* ignore */ }
    const shown = Object.keys(get().byMsid);
    set({ window: w, byMsid: {} });
    for (const msid of shown) {
      const c = coords.get(msid);
      if (c) get().request(msid, c[0], c[1]);
    }
  },
}));
