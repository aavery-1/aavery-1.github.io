// A tiny singleton bridge so UI outside the map (search, county selector) can
// pan the live Google map. MapView registers the map instance here once it is
// created. Everything else stays in the Zustand store; this holds only the
// imperative map handle, which is not serializable state.

import type { LatLng } from "../store";

let mapInstance: google.maps.Map | null = null;

export function registerMap(map: google.maps.Map | null) {
  mapInstance = map;
}

export function panMapTo(center: LatLng, zoom?: number) {
  if (!mapInstance) return;
  mapInstance.panTo(center);
  if (typeof zoom === "number") mapInstance.setZoom(zoom);
}

// Frame a set of points (the shortlist) so every one is visible at once. One
// point is just a fly-to; two or more use Google's fitBounds with padding so the
// pins sit clear of the tray and the corner controls.
export function fitMapToBounds(points: LatLng[], padding = 96) {
  if (!mapInstance || points.length === 0) return;
  if (points.length === 1) {
    mapInstance.panTo(points[0]);
    mapInstance.setZoom(15);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  for (const p of points) bounds.extend(p);
  mapInstance.fitBounds(bounds, padding);
}

// A smooth "fly" to a school: pan there (Google animates the pan), then ease the
// zoom in one integer step at a time so it reads as a cinematic zoom-in rather
// than a jump cut. Cancels any in-flight fly so rapid selections do not stack.
let flyTimer: number | null = null;
export function flyToSchool(center: LatLng, targetZoom = 15) {
  const map = mapInstance;
  if (!map) return;
  if (flyTimer !== null) { clearTimeout(flyTimer); flyTimer = null; }
  map.panTo(center);
  const start = Math.round(map.getZoom() ?? 11);
  if (start >= targetZoom) return; // already close enough; the pan is the whole move
  let z = start;
  const step = () => {
    z += 1;
    map.panTo(center); // keep the target centered as we zoom
    map.setZoom(z);
    if (z < targetZoom) {
      flyTimer = window.setTimeout(() => requestAnimationFrame(step), 150);
    } else {
      flyTimer = null;
    }
  };
  flyTimer = window.setTimeout(() => requestAnimationFrame(step), 180);
}
