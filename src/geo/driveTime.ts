// Drive-time areas (isochrones) for a school, on demand, in SCHOOL-MORNING
// traffic.
//
// Why not plain road-network isochrones: a Nov 2026 test against Google showed
// empty-road areas (what the free OpenStreetMap router draws) are 30 to 64%
// too wide at a 7:30am departure. The engine below was the most accurate of the
// options tested on 71 held-out trips (within 2 minutes of Google 82-85% of the
// time, vs 27% for empty roads):
//
//   1. Mapbox "driving-traffic" isochrones departing the next Tuesday at 7:30am
//      (typical historic traffic for that slot) give the SHAPES.
//   2. About 12 points on those edges are checked against Google's traffic
//      times for the same departure. Mapbox runs a little fast (about 1.3 min on
//      average), so we take one factor per school, k = Google / Mapbox.
//   3. Mapbox is re-asked for whole-minute contours at band / k, so the "15
//      minute" area means 15 minutes in Google's morning traffic.
// Google only supplies that one number per school; it never draws geometry, and
// nothing is stored beyond the session.
//
// Fallbacks, each labeled in the UI: no Google (list view before the map loads,
// or a quota error) -> Mapbox unadjusted; no Mapbox token -> the free Valhalla
// router on EMPTY roads.

import { create } from "zustand";
import type { Polygon, MultiPolygon, Position } from "geojson";
import { aggregateWithin, type AreaDemographics } from "./populationPoints";

export const DRIVE_MINUTES = [5, 10, 15] as const;
// Map-layer id; the one switch for drive-time mode (card, map button, layers panel).
export const DRIVE_LAYER_ID = "drive_time_reach";
export type DriveMinutes = (typeof DRIVE_MINUTES)[number];

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) || "";
const VALHALLA: string =
  (import.meta.env.VITE_ISOCHRONE_URL as string | undefined) || "https://valhalla1.openstreetmap.de/isochrone";

export type DriveEngine = "mapbox+google" | "mapbox" | "valhalla";

export interface DriveContour {
  minutes: DriveMinutes;           // the band this area represents
  requestedMinutes: number;        // the exact router time this band maps to (band / factor)
  geometry: Polygon | MultiPolygon;
  demographics: AreaDemographics | null; // null if the population data failed to load
}

export interface DriveCalibration {
  samples: number;          // Google trips checked
  factor: number;           // Google time / Mapbox time; >1 means Mapbox ran fast
  typicalErrorMin: number;  // median miss of the adjusted model on held-out samples
}

export interface DriveTimeResult {
  msid: string;
  origin: [number, number];
  engine: DriveEngine;
  departLabel: string | null;      // "Tue Nov 10, 7:30am" for traffic engines
  calibration: DriveCalibration | null;
  contours: DriveContour[];        // ascending minutes
  computedAt: string;
}

export type DriveTimeEntry =
  | { status: "loading"; step: string }
  | { status: "ready"; result: DriveTimeResult }
  | { status: "error"; message: string };

// A departure: day of week (0 = Sunday) and minutes after midnight, local time.
// Default Tuesday 7:30am (a school-morning drop-off).
export interface Departure { day: number; minutes: number }
export const DEFAULT_DEPARTURE: Departure = { day: 2, minutes: 7 * 60 + 30 };
const DEPART_KEY = "soh.drive.depart";
function readDeparture(): Departure {
  try {
    const d = JSON.parse(localStorage.getItem(DEPART_KEY) ?? "null") as Departure | null;
    if (d && d.day >= 0 && d.day <= 6 && d.minutes >= 0 && d.minutes < 1440) return d;
  } catch { /* storage blocked: use the default */ }
  return DEFAULT_DEPARTURE;
}
const departKey = (d: Departure) => `${d.day}-${d.minutes}`;

interface DriveTimeState {
  // Entries for the CURRENT departure, keyed by MSID (what the UI reads).
  byMsid: Record<string, DriveTimeEntry>;
  depart: Departure;
  request: (msid: string, lng: number, lat: number) => void;
  // Change the departure: shown schools switch to cached results for it, or
  // recompute; earlier departures stay cached for the session.
  setDepart: (d: Departure) => void;
}

type Raw = Array<{ minutes: number; geometry: Polygon | MultiPolygon }>; // one contour per requested minute

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "7:30am", "4:00pm"
export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
// "Tue 7:30am"
export function departureLabel(d: Departure): string {
  return `${DAY_NAMES[d.day].slice(0, 3)} ${clockLabel(d.minutes)}`;
}

// The NEXT occurrence of a departure (always in the future, which both Mapbox's
// typical-traffic model and Google require). Returned as the wall-clock string
// Mapbox wants (it applies the origin's time zone), a Date for Google, and a label.
export function nextDeparture(dep: Departure = DEFAULT_DEPARTURE, now = new Date()): { mapbox: string; date: Date; label: string } {
  const h = Math.floor(dep.minutes / 60), m = dep.minutes % 60;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  let add = (dep.day - d.getDay() + 7) % 7;
  if (add === 0 && d <= now) add = 7;
  d.setDate(d.getDate() + add);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    mapbox: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}`,
    date: d,
    label: departureLabel(dep),
  };
}
// Back-compat name for the default departure.
export const nextSchoolMorning = (now = new Date()) => nextDeparture(DEFAULT_DEPARTURE, now);

async function mapboxContours(lng: number, lat: number, minutes: number[], departAt: string): Promise<Raw> {
  const url =
    `https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/${lng},${lat}` +
    `?contours_minutes=${minutes.join(",")}&polygons=true&denoise=0.3&generalize=40` +
    `&depart_at=${departAt}&access_token=${MAPBOX_TOKEN}`;
  const r = await fetch(url);
  if (!r.ok) {
    if (r.status === 401) throw new Error("The Mapbox token was rejected.");
    if (r.status === 429) throw new Error("Mapbox is rate limiting requests. Try again shortly.");
    throw new Error(`Mapbox error (HTTP ${r.status}).`);
  }
  const fc = (await r.json()) as { features?: Array<{ geometry: Polygon | MultiPolygon; properties: { contour: number } }> };
  return (fc.features ?? [])
    .filter((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
    .map((f) => ({ minutes: Math.round(f.properties.contour), geometry: f.geometry }))
    .sort((a, b) => a.minutes - b.minutes);
}

async function valhallaContours(lng: number, lat: number): Promise<Raw> {
  const body = {
    locations: [{ lat, lon: lng }], costing: "auto",
    contours: DRIVE_MINUTES.map((time) => ({ time })), polygons: true, denoise: 0.3, generalize: 40,
  };
  const r = await fetch(`${VALHALLA}?json=${encodeURIComponent(JSON.stringify(body))}`);
  if (!r.ok) throw new Error(r.status === 429 ? "The routing service is busy. Try again in a few seconds." : `Routing service error (HTTP ${r.status}).`);
  const fc = (await r.json()) as { features?: Array<{ geometry: Polygon | MultiPolygon; properties: { contour: number } }> };
  return (fc.features ?? [])
    .filter((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
    .map((f) => ({ minutes: Math.round(f.properties.contour), geometry: f.geometry }))
    .sort((a, b) => a.minutes - b.minutes);
}

// The farthest boundary vertex of the outer ring within +-20 degrees of a bearing.
function outerRing(g: Polygon | MultiPolygon): Position[] {
  if (g.type === "Polygon") return g.coordinates[0];
  return [...g.coordinates].sort((a, b) => b[0].length - a[0].length)[0][0];
}
export function edgePoint(g: Polygon | MultiPolygon, lng: number, lat: number, bearing: number): [number, number] | null {
  const kx = Math.cos((lat * Math.PI) / 180);
  let best: [number, number] | null = null, bd = -1;
  for (const [x, y] of outerRing(g)) {
    const dx = (x - lng) * kx, dy = y - lat;
    const b = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    const diff = Math.min(Math.abs(b - bearing), 360 - Math.abs(b - bearing));
    const d = Math.hypot(dx, dy);
    if (diff <= 20 && d > bd) { bd = d; best = [x, y]; }
  }
  return best;
}

// One factor per school (validated: matched a per-direction model's accuracy),
// with a leave-one-out median error so the UI can show an honest receipt.
export function calibrate(samples: Array<{ band: number; google: number }>): DriveCalibration | null {
  const s = samples.filter((x) => x.google > 0 && x.band > 0);
  if (s.length < 4) return null;
  const sumG = s.reduce((a, x) => a + x.google, 0), sumB = s.reduce((a, x) => a + x.band, 0);
  const factor = Math.min(1.6, Math.max(0.75, sumG / sumB));
  const misses = s.map((x, i) => {
    const rest = s.filter((_, j) => j !== i);
    const k = rest.reduce((a, y) => a + y.google, 0) / rest.reduce((a, y) => a + y.band, 0);
    return Math.abs(x.band * k - x.google);
  }).sort((a, b) => a - b);
  const mid = misses.length >> 1;
  const typicalErrorMin = misses.length % 2 ? misses[mid] : (misses[mid - 1] + misses[mid]) / 2;
  return { samples: s.length, factor, typicalErrorMin };
}

// Where each band lands on Mapbox's clock. Mapbox only takes whole minutes, and
// rounding alone made results jump (a factor of 1.10 vs 1.12 flipped the 15-min
// band between a 14- and a 13-minute contour, moving the K-8 count by 40%). So
// we bracket the exact target with the whole minutes on either side and blend
// the population figures between them; the map draws the nearer shape.
export interface ContourPlan { band: DriveMinutes; target: number; lo: number; hi: number; w: number }
export function contourPlan(factor: number): ContourPlan[] {
  return DRIVE_MINUTES.map((band) => {
    const target = Math.min(60, Math.max(1, band / factor));
    const lo = Math.max(1, Math.floor(target));
    const hi = Math.min(60, Math.max(lo, Math.ceil(target)));
    return { band, target, lo, hi, w: hi === lo ? 0 : (target - lo) / (hi - lo) };
  });
}

// Linear blend of two areas' figures (w = weight of b). Exact at w = 0 or 1.
export function blendDemographics(a: AreaDemographics | null, b: AreaDemographics | null, w: number): AreaDemographics | null {
  if (!a || !b) return a ?? b;
  if (w <= 0) return a;
  if (w >= 1) return b;
  const mix = (x: number | null, y: number | null, round: boolean) => {
    if (x == null || y == null) return x ?? y;
    const v = x + (y - x) * w;
    return round ? Math.round(v) : Math.round(v * 10) / 10;
  };
  return {
    blocks: Math.round(a.blocks + (b.blocks - a.blocks) * w),
    total_pop: mix(a.total_pop, b.total_pop, true)!,
    total_pop_moe: mix(a.total_pop_moe, b.total_pop_moe, true)!,
    k8_pop: mix(a.k8_pop, b.k8_pop, true)!,
    k8_pop_moe: mix(a.k8_pop_moe, b.k8_pop_moe, true)!,
    pct_black: mix(a.pct_black, b.pct_black, false),
    pct_black_moe: mix(a.pct_black_moe, b.pct_black_moe, false),
    pct_hispanic: mix(a.pct_hispanic, b.pct_hispanic, false),
    pct_hispanic_moe: mix(a.pct_hispanic_moe, b.pct_hispanic_moe, false),
    median_income: mix(a.median_income, b.median_income, true),
    median_income_moe: mix(a.median_income_moe, b.median_income_moe, true),
  };
}

// The Google Maps library loads with the map, which can be a few seconds after
// a shared link (with drive times already on) starts computing. Wait briefly for
// it rather than silently skipping the check.
function googleReady(): boolean {
  return Boolean((globalThis as { google?: typeof google }).google?.maps?.DistanceMatrixService);
}
async function waitForGoogle(ms = 10000): Promise<boolean> {
  const t0 = Date.now();
  while (!googleReady() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 250));
  return googleReady();
}

// Google traffic times from the school to each point, for the same departure.
// Resolves null when the Maps library is not loaded or the request fails.
async function googleMinutes(lng: number, lat: number, pts: Array<[number, number]>, depart: Date): Promise<Array<number | null> | null> {
  if (!(await waitForGoogle())) return null;
  const g = (globalThis as { google?: typeof google }).google!;
  try {
    const resp = await new g.maps.DistanceMatrixService().getDistanceMatrix({
      origins: [{ lat, lng }],
      destinations: pts.map(([x, y]) => ({ lat: y, lng: x })),
      travelMode: g.maps.TravelMode.DRIVING,
      drivingOptions: { departureTime: depart, trafficModel: g.maps.TrafficModel.BEST_GUESS },
    });
    return resp.rows[0].elements.map((e) =>
      e.status === "OK" && e.duration_in_traffic ? e.duration_in_traffic.value / 60 : null);
  } catch {
    return null;
  }
}

// One line describing how the areas were made, honest about each engine.
export function driveMethodNote(r: DriveTimeResult): string {
  if (r.engine === "mapbox+google" && r.calibration) {
    const pct = Math.round((r.calibration.factor - 1) * 100);
    const drift = pct === 0 ? "matched Google" : pct > 0 ? `ran ${pct}% fast here` : `ran ${-pct}% slow here`;
    return `Typical traffic leaving ${r.departLabel} (Mapbox), checked against Google at ${r.calibration.samples} points and adjusted: Mapbox ${drift}. Typical remaining error about ${r.calibration.typicalErrorMin.toFixed(1)} min.`;
  }
  if (r.engine === "mapbox") {
    return `Typical traffic leaving ${r.departLabel} (Mapbox). Not checked against Google, which loads with the map; Mapbox usually runs about a minute fast. Open the map to check it.`;
  }
  return "Empty roads, no traffic (OpenStreetMap via Valhalla), so morning reach is 30 to 60% smaller than drawn. Add a Mapbox token for traffic-aware areas.";
}

const SAMPLE_BEARINGS = [45, 135, 225, 315];

async function compute(msid: string, lng: number, lat: number, dep: Departure, step: (s: string) => void): Promise<DriveTimeResult> {
  let engine: DriveEngine;
  let calibration: DriveCalibration | null = null;
  let departLabel: string | null = null;
  // Contours keyed by their router minute, plus the plan that maps bands onto them.
  const byMinute = new Map<number, Polygon | MultiPolygon>();
  let plan: ContourPlan[] = DRIVE_MINUTES.map((band) => ({ band, target: band, lo: band, hi: band, w: 0 }));

  if (MAPBOX_TOKEN) {
    const when = nextDeparture(dep);
    departLabel = when.label;
    step("Routing in morning traffic...");
    const first = await mapboxContours(lng, lat, [...DRIVE_MINUTES], when.mapbox);
    for (const c of first) byMinute.set(c.minutes, c.geometry);
    engine = "mapbox";

    // Check ~12 edge points against Google, then re-ask Mapbox on Google's clock.
    const pts: Array<{ band: number; pt: [number, number] }> = [];
    for (const c of first) for (const b of SAMPLE_BEARINGS) {
      const pt = edgePoint(c.geometry, lng, lat, b);
      if (pt) pts.push({ band: c.minutes, pt });
    }
    step("Checking against Google...");
    const g = pts.length ? await googleMinutes(lng, lat, pts.map((p) => p.pt), when.date) : null;
    if (g) {
      calibration = calibrate(pts.map((p, i) => ({ band: p.band, google: g[i] ?? 0 })));
      if (calibration) {
        engine = "mapbox+google";
        plan = contourPlan(calibration.factor);
        const need = [...new Set(plan.flatMap((x) => [x.lo, x.hi]))].filter((m) => !byMinute.has(m)).sort((a, b) => a - b);
        if (need.length) {
          step("Adjusting to Google's times...");
          for (let k = 0; k < need.length; k += 4) { // Mapbox: at most 4 contours per request
            for (const c of await mapboxContours(lng, lat, need.slice(k, k + 4), when.mapbox)) byMinute.set(c.minutes, c.geometry);
          }
        }
      }
    }
  } else {
    step("Routing on the road network...");
    for (const c of await valhallaContours(lng, lat)) byMinute.set(c.minutes, c.geometry);
    engine = "valhalla";
  }

  if (plan.some((x) => !byMinute.has(x.lo) || !byMinute.has(x.hi))) throw new Error("No drive-time area came back for this location.");
  step("Counting who lives there...");
  const demoCache = new Map<number, Promise<AreaDemographics | null>>();
  const demoAt = (m: number) => {
    if (!demoCache.has(m)) demoCache.set(m, aggregateWithin(byMinute.get(m)!).catch(() => null));
    return demoCache.get(m)!;
  };
  const contours: DriveContour[] = await Promise.all(
    plan.map(async (x) => ({
      minutes: x.band,
      requestedMinutes: Math.round(x.target * 10) / 10,
      geometry: byMinute.get(x.w >= 0.5 ? x.hi : x.lo)!,
      demographics: blendDemographics(await demoAt(x.lo), await demoAt(x.hi), x.w),
    })),
  );
  return { msid, origin: [lng, lat], engine, departLabel, calibration, contours, computedAt: new Date().toISOString() };
}

// Session cache across departures: "msid|day-minutes" -> entry, plus each
// requested school's coordinates so a departure change can recompute it.
const cache = new Map<string, DriveTimeEntry>();
const coords = new Map<string, [number, number]>();

export const useDriveTimes = create<DriveTimeState>((set, get) => ({
  byMsid: {},
  depart: readDeparture(),
  request: (msid, lng, lat) => {
    coords.set(msid, [lng, lat]);
    const dep = get().depart;
    const key = `${msid}|${departKey(dep)}`;
    const cur = cache.get(key);
    // Cached or in flight; but an unchecked Mapbox-only result is redone once
    // Google is available, so the session ends up with the adjusted areas.
    const stale = cur?.status === "ready" && cur.result.engine === "mapbox" && googleReady();
    if (cur && cur.status !== "error" && !stale) {
      if (get().byMsid[msid] !== cur) set((s) => ({ byMsid: { ...s.byMsid, [msid]: cur } }));
      return;
    }
    const put = (e: DriveTimeEntry) => {
      cache.set(key, e);
      // Only surface it if the departure hasn't changed while computing.
      if (departKey(get().depart) === departKey(dep)) set((s) => ({ byMsid: { ...s.byMsid, [msid]: e } }));
    };
    put({ status: "loading", step: "Starting..." });
    compute(msid, lng, lat, dep, (step) => put({ status: "loading", step }))
      .then((result) => put({ status: "ready", result }))
      .catch((e) => put({ status: "error", message: e instanceof Error ? e.message : "Could not compute drive times." }));
  },
  setDepart: (d) => {
    try { localStorage.setItem(DEPART_KEY, JSON.stringify(d)); } catch { /* ignore */ }
    const shown = Object.keys(get().byMsid);
    set({ depart: d, byMsid: {} });
    for (const msid of shown) {
      const c = coords.get(msid);
      if (c) get().request(msid, c[0], c[1]);
    }
  },
}));
