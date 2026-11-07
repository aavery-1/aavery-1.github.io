// Recover from a deploy that happened under an open tab.
//
// Every build gives its code chunks new hashed names, and the GitHub Pages
// deploy deletes the old ones. A tab that loaded the previous version still
// asks for the old names when it lazy-loads a view (the List, the notice
// dialog), gets a 404, and React throws "Failed to fetch dynamically imported
// module". The fix is to load the new version: reload once, with a cache-busting
// query so the CDN can't hand back the old index.html (Pages caches it for up
// to 10 minutes). A short sessionStorage guard stops a reload loop if the new
// version is genuinely broken; the error screen then shows as before.

const KEY = "soh.staleBuildReloadAt";
const STALE_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i,   // Firefox
  /Importing a module script failed/i,            // Safari
  /Unable to preload CSS/i,                       // Vite CSS preload
];

export function isStaleBuildError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return STALE_PATTERNS.some((re) => re.test(msg));
}

// Returns true if a reload was started (the caller can show "loading the new
// version"), false if we already tried in the last 30 seconds.
export function reloadForNewVersion(navigate: (url: string) => void = (u) => window.location.replace(u)): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? "0");
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: still reload once; a loop is unlikely without storage */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("v", String(Date.now()));
  navigate(url.toString());
  return true;
}

// Vite fires this before a dynamic import's preload fails; handling it here
// catches the problem before React ever renders the error screen.
export function installStaleBuildRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}
