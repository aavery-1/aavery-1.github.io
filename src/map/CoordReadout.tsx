// Mouse-following coordinate readout, bottom-left, five decimal places (about
// one meter). Falls back to the map center when the cursor is off the map.

import { useStore, type LatLng } from "../store";

function fmt(v: number): string {
  return v.toFixed(5);
}

export function CoordReadout({ mouse }: { mouse: LatLng | null }) {
  const center = useStore((s) => s.mapCenter);
  const p = mouse ?? center;
  return (
    <div className="coord-readout" aria-label="Cursor coordinates in decimal degrees, WGS84">
      <span className="mono">{fmt(p.lat)}</span>
      <span className="coord-sep">,</span>
      <span className="mono">{fmt(p.lng)}</span>
      <span className="coord-tag">{mouse ? "cursor" : "center"}</span>
    </div>
  );
}
