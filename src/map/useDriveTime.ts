// Point-to-point DRIVING time + distance for the measure path, via the Google
// Distance Matrix service. The Maps JS API is already loaded for the base map, so
// this needs no extra script, only that the key has the Distance Matrix API
// enabled (and billing). It sums the consecutive legs of the drawn path, so for
// the common two-point measure it is an exact A->B drive.
//
// Straight-line geodesic stays the PRIMARY readout: the Schools of Hope statute
// uses a straight-line radius, so driving distance is a convenience overlay only.
// This hook therefore fails soft: if the key lacks the Distance Matrix API it
// reports "unavailable" instead of breaking the ruler.

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "../store";

export type DriveTime =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; miles: number; minutes: number }
  | { status: "unavailable" } // key lacks the Distance Matrix API / request denied
  | { status: "error" };      // no drivable route, or a transient failure

const METERS_PER_MILE = 1609.344;

export function useDriveTime(points: LatLng[]): DriveTime {
  const [result, setResult] = useState<DriveTime>({ status: "idle" });
  // A stable signature (coords rounded to ~1m) so the effect and its API call
  // only refire when the drawn geometry actually changes, not on every render.
  const sig = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  const reqId = useRef(0);

  useEffect(() => {
    if (points.length < 2) {
      setResult({ status: "idle" });
      return;
    }
    if (typeof google === "undefined" || !google.maps?.DistanceMatrixService) {
      setResult({ status: "unavailable" });
      return;
    }
    setResult({ status: "loading" });
    const myReq = ++reqId.current;
    // Debounce: let the clicks settle before spending a metered API call.
    const timer = window.setTimeout(() => {
      const origins = points.slice(0, -1).map((p) => ({ lat: p.lat, lng: p.lng }));
      const destinations = points.slice(1).map((p) => ({ lat: p.lat, lng: p.lng }));
      new google.maps.DistanceMatrixService().getDistanceMatrix(
        {
          origins,
          destinations,
          travelMode: google.maps.TravelMode.DRIVING,
          unitSystem: google.maps.UnitSystem.IMPERIAL,
        },
        (resp, status) => {
          if (myReq !== reqId.current) return; // a newer request superseded this one
          if (status !== "OK" || !resp) {
            setResult({ status: status === "REQUEST_DENIED" ? "unavailable" : "error" });
            return;
          }
          // Sum the diagonal: leg i is origins[i] -> destinations[i].
          let meters = 0;
          let seconds = 0;
          for (let i = 0; i < origins.length; i++) {
            const el = resp.rows[i]?.elements[i];
            if (!el || el.status !== "OK") {
              setResult({ status: "error" });
              return;
            }
            meters += el.distance.value;
            seconds += el.duration.value;
          }
          setResult({ status: "ok", miles: meters / METERS_PER_MILE, minutes: seconds / 60 });
        },
      );
    }, 450);
    return () => window.clearTimeout(timer);
    // sig fully captures the geometry; points identity churns every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return result;
}
