// Loads the Google Maps JavaScript API exactly once and reports a precise
// status the UI can act on. Missing key, network failure, and Google auth
// rejection are three different, specific states, never a blank page or a
// generic error (00_BUILD_PROMPT.md hard requirements + 05 section 7).

import { useEffect, useState } from "react";

export type GoogleMapsStatus = "missing-key" | "loading" | "ready" | "network-error" | "auth-error";

let loadPromise: Promise<void> | null = null;
let authFailed = false;

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

function loadScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    // Google calls this global on an auth/billing/referrer rejection.
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      authFailed = true;
      reject(new Error("auth"));
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("network"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function useGoogleMaps(): { status: GoogleMapsStatus } {
  const [status, setStatus] = useState<GoogleMapsStatus>(API_KEY ? "loading" : "missing-key");

  useEffect(() => {
    if (!API_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setStatus(err.message === "auth" || authFailed ? "auth-error" : "network-error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { status };
}

export const HAS_API_KEY = Boolean(API_KEY);
