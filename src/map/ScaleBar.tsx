// Always-visible scale bar, accurate at the current map center latitude. It uses
// the true ground distance for its on-screen width, the same geodesic basis the
// measure tool uses, so the two agree on any local segment. That visible
// agreement is the "5 miles is 5 miles" proof.

import { useStore } from "../store";
import { metersToMiles, milesToMeters } from "../geo/measure";

const TARGET_PX = 110; // aim for a bar about this wide, then round to a nice value
const EARTH_CIRCUM = 156543.03392; // meters per pixel at zoom 0, equator (Web Mercator)

// Ground meters per screen pixel at a given latitude and zoom.
function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUM * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

function niceRound(value: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const nice = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return nice * pow;
}

function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;
}
function formatMiles(mi: number): string {
  return mi >= 1
    ? `${mi.toLocaleString("en-US", { maximumFractionDigits: 1 })} mi`
    : `${(mi * 5280).toLocaleString("en-US", { maximumFractionDigits: 0 })} ft`;
}

export function ScaleBar() {
  const lat = useStore((s) => s.mapCenter.lat);
  const zoom = useStore((s) => s.mapZoom);

  const mpp = metersPerPixel(lat, zoom);
  if (!Number.isFinite(mpp) || mpp <= 0) return null;

  // Pick a nice round distance in miles near the target pixel width.
  const targetMiles = metersToMiles(mpp * TARGET_PX);
  const miles = niceRound(targetMiles);
  const meters = milesToMeters(miles);
  const widthPx = Math.round(meters / mpp);

  return (
    <div className="scale-bar" aria-label={`Scale: ${formatMiles(miles)} equals ${formatMeters(meters)}`}>
      <div className="scale-bar-track" style={{ width: widthPx }}>
        <span className="scale-bar-tick" />
        <span className="scale-bar-tick scale-bar-tick-end" />
      </div>
      <div className="scale-bar-labels">
        <span>{formatMiles(miles)}</span>
        <span className="scale-bar-sep">/</span>
        <span>{formatMeters(meters)}</span>
      </div>
    </div>
  );
}
