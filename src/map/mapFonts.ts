// The map's type face. deck.gl rasterizes TextLayer glyphs into an atlas once,
// at layer creation, so if IBM Plex Sans (Carbon's face, loaded from Google
// Fonts in index.html) has not arrived yet the atlas bakes in a fallback and
// never updates. This hook reports when Plex is ready; layers render in the
// system face until then and switch over (a fontFamily change rebuilds the
// atlas), so map labels match the rest of the Carbon UI.

import { useEffect, useState } from "react";

export const MAP_FONT_PLEX = '"IBM Plex Sans", system-ui, sans-serif';
export const MAP_FONT_FALLBACK = "system-ui, sans-serif";

let plexReady = false;

export function useMapFont(): string {
  const [ready, setReady] = useState(plexReady);
  useEffect(() => {
    if (ready || typeof document === "undefined" || !document.fonts) return;
    let alive = true;
    Promise.all(["500 12px", "600 12px", "700 12px"].map((w) => document.fonts.load(`${w} "IBM Plex Sans"`)))
      .then((faces) => {
        if (faces.every((f) => f.length > 0)) {
          plexReady = true;
          if (alive) setReady(true);
        }
      })
      .catch(() => { /* offline or blocked: keep the system face */ });
    return () => { alive = false; };
  }, [ready]);
  return ready ? MAP_FONT_PLEX : MAP_FONT_FALLBACK;
}
