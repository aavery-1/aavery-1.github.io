// A tiny matchMedia hook, replacing MUI's useMediaQuery + theme.breakpoints. The
// app's responsive tiers were tuned against MUI's default breakpoints (sm 600,
// md 900), NOT Carbon's (which are wider), so those exact pixel thresholds are
// preserved here as named queries to keep the tuned phone/tablet behavior intact.
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Named breakpoint queries matching the app's established tiers (MUI's old sm/md).
// down(sm): the phone layout (filters -> drawer, inspector -> bottom sheet).
// down(md): the tablet tier where the wide search collapses to an icon + popover.
export const BREAKPOINT = {
  downSm: "(max-width: 599.95px)",
  downMd: "(max-width: 899.95px)",
} as const;

export const usePhone = () => useMediaQuery(BREAKPOINT.downSm);
export const useCompact = () => useMediaQuery(BREAKPOINT.downMd);
