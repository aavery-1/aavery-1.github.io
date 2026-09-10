// Removes the branded load splash (markup + CSS live in index.html so they paint
// before this bundle downloads). Once the core school data is loaded, this holds
// the splash a beat, then fades it out and removes it, dissolving into the ready
// app underneath. Renders nothing. No em dashes in this file.

import { useEffect } from "react";
import { useData } from "../data/DataContext";

// Deliberate 1.5s hold AFTER the data is ready, so the branded splash lands as an
// intentional moment (and never a flash), then a slightly slower fade plays as the
// map zooms into the tri-county frame beneath it.
const HOLD_AFTER_READY_MS = 1500;
const FADE_MS = 1000;
// Safety net: if data errors or stalls (schools never arrive), force the splash
// off after this so it can never trap the user behind the overlay.
const HARD_CAP_MS = 12000;

function fadeOutSplash() {
  const el = document.getElementById("app-splash");
  if (!el || el.classList.contains("app-splash--out")) return;
  el.classList.add("app-splash--out");
  const done = () => el.remove();
  el.addEventListener("transitionend", done, { once: true });
  // Fallback in case transitionend never fires (tab backgrounded, etc.).
  window.setTimeout(done, FADE_MS + 150);
}

export function SplashGate() {
  const { schools } = useData();
  const ready = schools != null;

  // Ready path: hold two seconds, then fade.
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(fadeOutSplash, HOLD_AFTER_READY_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  // Safety cap, armed only while NOT ready (the ready path takes over otherwise).
  useEffect(() => {
    if (ready) return;
    const cap = window.setTimeout(fadeOutSplash, HARD_CAP_MS);
    return () => window.clearTimeout(cap);
  }, [ready]);

  return null;
}
