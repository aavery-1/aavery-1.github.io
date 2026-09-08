// Ellipsoidal geodesics on the WGS84 ellipsoid (Vincenty 1975).
//
// This is the airtight distance core. Spherical Haversine (turf.distance) is
// accurate to a few tenths of a percent; measuring on the actual WGS84 ellipsoid
// removes that residual, so a distance is exact to well under a millimeter at any
// scale this tool operates on. Every eligibility decision (the 5-mile PLP radius)
// and every radius ring is built from these two functions, so the number we
// decide on and the ring we draw are the same true ground geometry.
//
//   - ellipsoidalDistanceMeters: the inverse problem (distance between two points)
//   - ellipsoidalDestination:    the direct problem (a point at a distance and
//                                 bearing from a start), used to build true rings
//
// Vincenty converges for every pair except near-antipodal points, which cannot
// occur within three adjacent Florida counties; we still fall back to the
// spherical value if convergence ever fails, so a distance is always returned.
//
// Reference: T. Vincenty, "Direct and Inverse Solutions of Geodesics on the
// Ellipsoid with Application of Nested Equations," Survey Review 23 (1975).

import { distance, point } from "@turf/turf";
import type { LngLat } from "./measure";

// WGS84 defining parameters.
const A = 6378137.0;              // semi-major axis (meters)
const F = 1 / 298.257223563;      // flattening
const B = (1 - F) * A;            // semi-minor axis (meters)
const METERS_PER_MILE = 1609.344;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// Inverse geodesic: true ground distance in meters between two lon/lat points.
export function ellipsoidalDistanceMeters([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const L = toRad(lon2 - lon1);
  const U1 = Math.atan((1 - F) * Math.tan(toRad(lat1)));
  const U2 = Math.atan((1 - F) * Math.tan(toRad(lat2)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L, lambdaPrev = 0, iter = 0;
  let cosSqAlpha = 0, sinSigma = 0, cosSigma = 0, sigma = 0, cos2SigmaM = 0;
  do {
    const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    if (sinSigma === 0) return 0; // coincident points
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0; // 0 on the equatorial line
    const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
    lambdaPrev = lambda;
    lambda = L + (1 - C) * F * sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaPrev) > 1e-12 && ++iter < 200);

  if (iter >= 200) {
    // Near-antipodal non-convergence (impossible in-scope): spherical fallback.
    return distance(point([lon1, lat1]), point([lon2, lat2]), { units: "meters" });
  }

  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const Acoef = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bcoef = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = Bcoef * sinSigma * (cos2SigmaM + (Bcoef / 4) *
    (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
      (Bcoef / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return B * Acoef * (sigma - deltaSigma);
}

// Direct geodesic: the lon/lat point reached by traveling `distMeters` from
// `start` along initial bearing `bearingDeg`. Used to trace true radius rings.
export function ellipsoidalDestination([lon, lat]: LngLat, distMeters: number, bearingDeg: number): LngLat {
  const alpha1 = toRad(bearingDeg);
  const s = distMeters;
  const sinAlpha1 = Math.sin(alpha1), cosAlpha1 = Math.cos(alpha1);

  const tanU1 = (1 - F) * Math.tan(toRad(lat));
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const Acoef = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bcoef = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  let sigma = s / (B * Acoef), sigmaPrev = 0, iter = 0;
  let sinSigma = 0, cosSigma = 0, cos2SigmaM = 0;
  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma = Bcoef * sinSigma * (cos2SigmaM + (Bcoef / 4) *
      (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
        (Bcoef / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    sigmaPrev = sigma;
    sigma = s / (B * Acoef) + deltaSigma;
  } while (Math.abs(sigma - sigmaPrev) > 1e-12 && ++iter < 200);

  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const lat2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - F) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp),
  );
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
  const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
  const L = lambda - (1 - C) * F * sinAlpha *
    (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  const lon2 = toRad(lon) + L;
  return [toDeg(lon2), toDeg(lat2)];
}

export function ellipsoidalDistanceMiles(a: LngLat, b: LngLat): number {
  return ellipsoidalDistanceMeters(a, b) / METERS_PER_MILE;
}
