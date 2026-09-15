// Driving distance + time FROM the first pinned compare site TO each of the
// others, via the Google Distance Matrix service (the same one the ruler uses in
// useDriveTime). One metered request covers every leg: origins = [site 0],
// destinations = [site 1..n]. The Maps JS API is already loaded for the base map,
// so this needs no extra script, only that the key has the Distance Matrix API
// enabled (and billing).
//
// Straight-line geodesic stays the PRIMARY proximity figure (the Schools of Hope
// statute uses a straight-line radius); driving is a convenience overlay, so this
// hook FAILS SOFT: if the key lacks the Distance Matrix API it reports
// "unavailable" and the compare table simply shows a muted note in those rows.

import { useEffect, useRef, useState } from "react";
import type { SchoolFeature } from "../data/types";
import type { LngLat } from "../geo/measure";

// One leg's result, or null when that specific origin->destination pair has no
// drivable route (the rest of the legs can still be OK).
export type DriveLeg = { miles: number; minutes: number } | null;

export type CompareDriveTimes =
  | { status: "idle" }        // fewer than two sites
  | { status: "loading" }
  | { status: "ok"; legs: DriveLeg[] } // index-aligned to the sites; legs[0] is null (the reference)
  | { status: "unavailable" } // key lacks the Distance Matrix API / request denied
  | { status: "error" };      // transient failure of the whole request

const METERS_PER_MILE = 1609.344;

export function useCompareDriveTimes(schools: SchoolFeature[]): CompareDriveTimes {
  const [result, setResult] = useState<CompareDriveTimes>({ status: "idle" });
  const coords = schools.map((s) => s.geometry.coordinates as LngLat);
  // A stable signature (coords rounded to ~1m, in order) so the effect and its
  // metered API call only refire when the pinned set or its order changes.
  const sig = coords.map((c) => `${c[1].toFixed(5)},${c[0].toFixed(5)}`).join("|");
  const reqId = useRef(0);

  useEffect(() => {
    if (schools.length < 2) {
      setResult({ status: "idle" });
      return;
    }
    if (typeof google === "undefined" || !google.maps?.DistanceMatrixService) {
      setResult({ status: "unavailable" });
      return;
    }
    setResult({ status: "loading" });
    const myReq = ++reqId.current;
    // Debounce: let the pinned set settle before spending a metered API call.
    const timer = window.setTimeout(() => {
      const origin = { lat: coords[0][1], lng: coords[0][0] };
      const destinations = coords.slice(1).map((c) => ({ lat: c[1], lng: c[0] }));
      new google.maps.DistanceMatrixService().getDistanceMatrix(
        {
          origins: [origin],
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
          const row = resp.rows[0];
          // legs[0] is the reference site itself (no distance to draw); the rest
          // align to destinations, i.e. sites[1..]. A single leg with no route
          // becomes null while the others stay usable.
          const legs: DriveLeg[] = [null];
          for (let j = 0; j < destinations.length; j++) {
            const el = row?.elements[j];
            legs.push(
              el && el.status === "OK"
                ? { miles: el.distance.value / METERS_PER_MILE, minutes: el.duration.value / 60 }
                : null,
            );
          }
          setResult({ status: "ok", legs });
        },
      );
    }, 450);
    return () => window.clearTimeout(timer);
    // sig fully captures the geometry + order; schools identity churns every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return result;
}
