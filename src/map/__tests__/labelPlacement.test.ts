import { describe, it, expect } from "vitest";
import { placeLabels, project, type LabelCandidate } from "../labelPlacement";

const measure = (t: string) => t.length * 7;

function cand(id: string, lng: number, lat: number, priority = 0): LabelCandidate {
  return { id, lng, lat, text: `School ${id}`, priority, markerRadius: 10 };
}

describe("placeLabels", () => {
  it("places a lone label below its marker", () => {
    const out = placeLabels([cand("a", -80.2, 25.8)], [], 13, measure);
    expect(out).toHaveLength(1);
    expect(out[0].slot).toBe("below");
    expect(out[0].baseline).toBe("top");
  });

  it("never lets two placed labels overlap", () => {
    // A tight cluster: many schools within a few pixels of each other.
    const cands = Array.from({ length: 30 }, (_, i) => cand(String(i), -80.2 + i * 0.0004, 25.8 + (i % 3) * 0.0004));
    const out = placeLabels(cands, [], 13, measure);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(cands.length);
    const boxes = out.map((p) => {
      const [x, y] = project(p.position[0], p.position[1], 13);
      const w = measure(p.text) + 12;
      const h = 20;
      const cx = x + p.pixelOffset[0];
      const cy = y + p.pixelOffset[1];
      const x0 = p.textAnchor === "start" ? cx - 6 : p.textAnchor === "end" ? cx - w + 6 : cx - w / 2;
      const y0 = p.baseline === "top" ? cy - 3 : p.baseline === "bottom" ? cy - h + 3 : cy - h / 2;
      return { x0, y0, x1: x0 + w, y1: y0 + h };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = a.x0 < b.x1 - 0.5 && a.x1 > b.x0 + 0.5 && a.y0 < b.y1 - 0.5 && a.y1 > b.y0 + 0.5;
        expect(overlap).toBe(false);
      }
    }
  });

  it("places higher-priority labels first", () => {
    const low = cand("low", -80.2, 25.8, 0);
    const high = cand("high", -80.20001, 25.80001, 10);
    const out = placeLabels([low, high], [], 13, measure);
    expect(out[0].id).toBe("high");
  });

  it("does not cover another school's marker", () => {
    // A marker sits exactly where the "below" slot would go, so the label moves.
    const a = cand("a", -80.2, 25.8);
    const [x, y] = project(-80.2, 25.8, 15);
    const scale = 256 * Math.pow(2, 15);
    const belowLng = (x / scale) * 360 - 180;
    const yBelow = y + 22;
    const n = Math.PI - (2 * Math.PI * yBelow) / scale;
    const belowLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    const out = placeLabels([a], [{ id: "a", lng: -80.2, lat: 25.8, radius: 10 }, { id: "b", lng: belowLng, lat: belowLat, radius: 10 }], 15, measure);
    expect(out[0].slot).not.toBe("below");
  });
});
