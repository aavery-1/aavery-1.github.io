// School-type shape channel for the map markers. Grade owns color (see
// gradeEncoding.ts); operator type owns SHAPE, so a viewer can read both at once
// without either channel interfering with the other.
//
//   District (Traditional)  circle
//   Charter                 square
//   Magnet                  diamond
//   Virtual                 triangle
//   Alternative             hexagon
//   Other                   circle (fallback)
//
// Each shape is a solid white SVG on a transparent field, packed as an IconLayer
// mask. deck.gl tints a mask icon with getColor, so one white shape serves every
// grade: the icon supplies the outline, getColor supplies the grade fill.

import type { SchoolType } from "../data/types";

export type MarkerShape = "circle" | "square" | "diamond" | "triangle" | "hexagon";

// A human label for the shape, used by the legend.
export const SHAPE_FOR_TYPE: Record<SchoolType, MarkerShape> = {
  Traditional: "circle",
  Charter: "square",
  Magnet: "diamond",
  Virtual: "triangle",
  Alternative: "hexagon",
  Other: "circle",
};

export function shapeForType(type: SchoolType): MarkerShape {
  return SHAPE_FOR_TYPE[type] ?? "circle";
}

// The school types that carry a distinct shape on the map, in legend order, with
// the user-facing label. "Traditional" reads as "District" everywhere in the UI.
export const SHAPE_LEGEND: Array<{ label: string; shape: MarkerShape }> = [
  { label: "District", shape: "circle" },
  { label: "Charter", shape: "square" },
  { label: "Magnet", shape: "diamond" },
  { label: "Virtual", shape: "triangle" },
  { label: "Alternative", shape: "hexagon" },
];

// An inline-SVG path/shape element (as a string) for a DOM legend swatch, drawn
// on the same 0..100 box the map icons use so the legend matches the map exactly.
export function shapeSvgElement(shape: MarkerShape): string {
  switch (shape) {
    case "circle":
      return `<circle cx="50" cy="50" r="44" />`;
    case "square":
      return `<rect x="8" y="8" width="84" height="84" rx="12" />`;
    case "diamond":
      return `<polygon points="50,4 96,50 50,96 4,50" />`;
    case "triangle":
      return `<polygon points="50,10 92,88 8,88" />`;
    case "hexagon":
      return `<polygon points="50,5 90,28 90,72 50,95 10,72 10,28" />`;
  }
}

// Draw a white shape on a transparent 100x100 canvas. Points are kept a touch
// inside the box so a larger "stroke" copy can sit behind a smaller "fill" copy
// and read as an outline. A rasterized PNG (rather than an SVG data URL) is used
// because deck.gl builds its icon atlas with createImageBitmap, which needs an
// image with reliable natural dimensions; SVG images fail that in some browsers.
const SIZE = 100;

function drawShape(ctx: CanvasRenderingContext2D, shape: MarkerShape): void {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.arc(50, 50, 46, 0, Math.PI * 2);
      break;
    case "square": {
      const x = 8, y = 8, w = 84, r = 10;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + w, r);
      ctx.arcTo(x + w, y + w, x, y + w, r);
      ctx.arcTo(x, y + w, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      break;
    }
    case "diamond":
      ctx.moveTo(50, 3);
      ctx.lineTo(97, 50);
      ctx.lineTo(50, 97);
      ctx.lineTo(3, 50);
      break;
    case "triangle":
      ctx.moveTo(50, 8);
      ctx.lineTo(92, 88);
      ctx.lineTo(8, 88);
      break;
    case "hexagon":
      ctx.moveTo(50, 4);
      ctx.lineTo(90, 27);
      ctx.lineTo(90, 73);
      ctx.lineTo(50, 96);
      ctx.lineTo(10, 73);
      ctx.lineTo(10, 27);
      break;
  }
  ctx.closePath();
  ctx.fill();
}

function pngDataUrl(shape: MarkerShape): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) drawShape(ctx, shape);
  return canvas.toDataURL("image/png");
}

// IconLayer getIcon descriptor for a shape. Memoized so the same object identity
// is reused per shape (deck caches its atlas by icon id).
const ICON_CACHE = new Map<MarkerShape, { id: string; url: string; width: number; height: number; mask: boolean; anchorX: number; anchorY: number }>();

export function iconForShape(shape: MarkerShape) {
  let icon = ICON_CACHE.get(shape);
  if (!icon) {
    icon = { id: shape, url: pngDataUrl(shape), width: SIZE, height: SIZE, mask: true, anchorX: 50, anchorY: 50 };
    ICON_CACHE.set(shape, icon);
  }
  return icon;
}

// A soft drop shadow for a shape, so a rich marker reads as one raised object
// over the basemap (Carbon elevation: floating things cast a shadow, flat things
// do not). Drawn on a padded canvas so the blur is not clipped; the shape sits in
// the central 100px, so the icon must be sized SHADOW_SCALE times the marker.
// Not a mask: the shadow color is baked in.
export const SHADOW_SCALE = 1.4;
const SHADOW_CACHE = new Map<MarkerShape, { id: string; url: string; width: number; height: number; mask: boolean; anchorX: number; anchorY: number }>();

export function shadowIconForShape(shape: MarkerShape) {
  let icon = SHADOW_CACHE.get(shape);
  if (!icon) {
    const box = Math.round(SIZE * SHADOW_SCALE);
    const pad = (box - SIZE) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = box;
    canvas.height = box;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Shadow-only trick (works in every browser, unlike ctx.filter): draw the
      // shape far off-canvas and let its shadow land back in the frame. The
      // shadow sits a touch lower than the marker, as if lit from above.
      const OFF = 1000;
      ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
      ctx.shadowBlur = 9;
      ctx.shadowOffsetX = OFF;
      ctx.shadowOffsetY = 4;
      ctx.translate(pad - OFF, pad);
      drawShape(ctx, shape);
    }
    icon = { id: `shadow-${shape}`, url: canvas.toDataURL("image/png"), width: box, height: box, mask: false, anchorX: box / 2, anchorY: box / 2 };
    SHADOW_CACHE.set(shape, icon);
  }
  return icon;
}

// Corner badges for the School of Hope designations and the co-location flag
// (see data/derive/sohSites.ts). Drawn as crisp vector icons rather than font
// glyphs (a "★" or "●" from the system font renders at a different weight and
// baseline on every OS). Each carries a white keyline and a faint shadow so it
// separates from the marker it sits on. Colors are DATA encodings shared with
// the legend (BADGE_COLORS), never chrome tokens.
export type MarkerBadge = "star" | "kipp-current" | "kipp-requested" | "coloc";

export const BADGE_COLORS = {
  star: "#B45309",   // Amber 700: School of Hope
  kipp: "#CA8A04",   // Yellow 600: KIPP campus / requested building
  coloc: "#0D9488",  // Teal 600: co-location candidate
} as const;

const BADGE_PX = 64; // drawn at 4x the on-screen size so it stays sharp on retina
const BADGE_CACHE = new Map<MarkerBadge, { id: string; url: string; width: number; height: number; mask: boolean; anchorX: number; anchorY: number }>();

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawBadge(ctx: CanvasRenderingContext2D, badge: MarkerBadge): void {
  const c = BADGE_PX / 2;
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.lineJoin = "round";
  if (badge === "star") {
    starPath(ctx, c, c + 2, 28, 12.5);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    starPath(ctx, c, c + 2, 20, 9);
    ctx.fillStyle = BADGE_COLORS.star;
    ctx.fill();
    return;
  }
  // Discs: a white keyline disc, then the designation fill (or ring) inside it.
  ctx.beginPath();
  ctx.arc(c, c, 22, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  if (badge === "kipp-requested") {
    ctx.beginPath();
    ctx.arc(c, c, 13, 0, Math.PI * 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = BADGE_COLORS.kipp;
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(c, c, 16.5, 0, Math.PI * 2);
  ctx.fillStyle = badge === "coloc" ? BADGE_COLORS.coloc : BADGE_COLORS.kipp;
  ctx.fill();
}

export function iconForBadge(badge: MarkerBadge) {
  let icon = BADGE_CACHE.get(badge);
  if (!icon) {
    const canvas = document.createElement("canvas");
    canvas.width = BADGE_PX;
    canvas.height = BADGE_PX;
    const ctx = canvas.getContext("2d");
    if (ctx) drawBadge(ctx, badge);
    icon = { id: `badge-${badge}`, url: canvas.toDataURL("image/png"), width: BADGE_PX, height: BADGE_PX, mask: false, anchorX: BADGE_PX / 2, anchorY: BADGE_PX / 2 };
    BADGE_CACHE.set(badge, icon);
  }
  return icon;
}
