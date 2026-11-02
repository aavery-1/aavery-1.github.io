// Greedy screen-space label placement for school name labels. Overlapping
// labels were the map's loudest legibility failure: at street zoom dozens of
// names stacked into an unreadable smear. This places labels the way a
// cartographer would: most important first, each trying four slots around its
// marker (below, above, right, left), and a label that fits nowhere is dropped
// rather than drawn over another label or over someone else's marker. Zooming
// in frees space, so more names appear. Pure and synchronous (Web Mercator math,
// no map instance), so it is unit-tested and cheap to rerun on every idle.

export interface LabelCandidate {
  id: string;
  lng: number;
  lat: number;
  text: string;
  // Higher places first (selected / shortlisted, then siting-relevant schools).
  priority: number;
  // On-screen radius of the marker the label belongs to, in pixels.
  markerRadius: number;
}

export interface MarkerObstacle {
  id: string;
  lng: number;
  lat: number;
  radius: number;
}

export type LabelSlot = "below" | "above" | "right" | "left";

export interface PlacedLabel {
  id: string;
  position: [number, number];
  text: string;
  slot: LabelSlot;
  textAnchor: "start" | "middle" | "end";
  baseline: "top" | "center" | "bottom";
  pixelOffset: [number, number];
}

// Box metrics shared with the TextLayer that draws the result (backgroundPadding
// and size), so the collision boxes are the boxes the user sees.
export const LABEL_PAD_X = 6;
export const LABEL_PAD_Y = 3;
export const LABEL_LINE_PX = 14; // 12px Plex at its line box
const GAP = 3;
const CELL = 64;

interface Box { x0: number; y0: number; x1: number; y1: number; owner: string }

export function project(lng: number, lat: number, zoom: number): [number, number] {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return [x, y];
}

class Grid {
  private cells = new Map<string, Box[]>();
  private keys(b: Box): string[] {
    const out: string[] = [];
    for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) {
      for (let cy = Math.floor(b.y0 / CELL); cy <= Math.floor(b.y1 / CELL); cy++) out.push(`${cx}:${cy}`);
    }
    return out;
  }
  add(b: Box) {
    for (const k of this.keys(b)) {
      const list = this.cells.get(k);
      if (list) list.push(b);
      else this.cells.set(k, [b]);
    }
  }
  hits(b: Box, ignoreOwner: string): boolean {
    for (const k of this.keys(b)) {
      for (const o of this.cells.get(k) ?? []) {
        if (o.owner === ignoreOwner) continue;
        if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) return true;
      }
    }
    return false;
  }
}

export function placeLabels(
  candidates: LabelCandidate[],
  obstacles: MarkerObstacle[],
  zoom: number,
  measure: (text: string) => number,
): PlacedLabel[] {
  const grid = new Grid();
  // Every marker is an obstacle a label must not cover (except its own).
  for (const m of obstacles) {
    const [x, y] = project(m.lng, m.lat, zoom);
    grid.add({ x0: x - m.radius, y0: y - m.radius, x1: x + m.radius, y1: y + m.radius, owner: `m:${m.id}` });
  }

  const ordered = [...candidates].sort((a, b) => b.priority - a.priority || a.text.localeCompare(b.text));
  const placed: PlacedLabel[] = [];
  for (const c of ordered) {
    const [x, y] = project(c.lng, c.lat, zoom);
    const w = measure(c.text) + LABEL_PAD_X * 2;
    const h = LABEL_LINE_PX + LABEL_PAD_Y * 2;
    const r = c.markerRadius + GAP;
    const slots: Array<{ slot: LabelSlot; box: Box; anchor: PlacedLabel["textAnchor"]; base: PlacedLabel["baseline"]; off: [number, number] }> = [
      { slot: "below", box: { x0: x - w / 2, y0: y + r, x1: x + w / 2, y1: y + r + h, owner: "" }, anchor: "middle", base: "top", off: [0, r + LABEL_PAD_Y] },
      { slot: "above", box: { x0: x - w / 2, y0: y - r - h, x1: x + w / 2, y1: y - r, owner: "" }, anchor: "middle", base: "bottom", off: [0, -(r + LABEL_PAD_Y)] },
      { slot: "right", box: { x0: x + r, y0: y - h / 2, x1: x + r + w, y1: y + h / 2, owner: "" }, anchor: "start", base: "center", off: [r + LABEL_PAD_X, 0] },
      { slot: "left", box: { x0: x - r - w, y0: y - h / 2, x1: x - r, y1: y + h / 2, owner: "" }, anchor: "end", base: "center", off: [-(r + LABEL_PAD_X), 0] },
    ];
    for (const s of slots) {
      if (grid.hits(s.box, `m:${c.id}`)) continue;
      grid.add({ ...s.box, owner: `l:${c.id}` });
      placed.push({ id: c.id, position: [c.lng, c.lat], text: c.text, slot: s.slot, textAnchor: s.anchor, baseline: s.base, pixelOffset: s.off });
      break;
    }
  }
  return placed;
}

// Text width for a label, measured once per name in the label face. Falls back
// to an average glyph width where canvas is unavailable (tests, SSR).
const widthCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null | undefined;

export function measureLabel(text: string, font: string): number {
  const key = `${font}|${text}`;
  const hit = widthCache.get(key);
  if (hit != null) return hit;
  if (measureCtx === undefined) {
    measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  }
  let w = text.length * 6.6;
  if (measureCtx) {
    measureCtx.font = `500 12px ${font}`;
    w = measureCtx.measureText(text).width;
  }
  widthCache.set(key, w);
  return w;
}
