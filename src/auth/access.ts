// Access gate and server calls, backed by Supabase. The shared password is NEVER
// stored in this app: Supabase keeps a bcrypt hash, and the `unlock(pw)` database
// function (supabase/002_session_gate.sql) checks a typed password, rate limits
// guesses, and hands back a 12-hour session token. Everything private (today, the
// KIPP requested-building list) is fetched with that token from `private_data`,
// so it is not in the public website code and a password is required to see it.
//
// The URL and anon key below are PUBLIC by design (they ship in the browser);
// row-level security on the Supabase side is what protects the data. This talks
// to Supabase with two plain HTTP calls rather than the full supabase-js client,
// which would add realtime, auth, and storage code the app never uses.

import { parseGoogleNewsRss, type NewsItem } from "../news/parseGoogleNews";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The gate is enforced only when Supabase is configured. With no keys (local
// development) the app runs open; the deployed build supplies both and the gate
// turns on automatically.
export const gateConfigured = Boolean(url && anonKey);

const TOKEN_KEY = "fft_session";

export function storedToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: the token lives in memory for this page only */ }
}
let memoryToken: string | null = null;
function currentToken(): string | null {
  return memoryToken ?? storedToken();
}

export class AccessError extends Error {
  constructor(public readonly kind: "rate-limited" | "unavailable", message: string) {
    super(message);
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: anonKey as string,
    Authorization: `Bearer ${anonKey as string}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { status: res.status, data: null };
  return { status: res.status, data: (await res.json()) as T };
}

// Private values served only to unlocked sessions. Keys match private_config rows.
export interface PrivateData {
  kipp_requested_msids?: string[];
}

// Try a password. Resolves to the private data on success, null for a wrong
// password; throws AccessError when rate limited or when Supabase is unreachable.
export async function unlock(password: string): Promise<PrivateData | null> {
  if (!gateConfigured) return loadDevPrivateData();
  const res = await rpc<string | null>("unlock", { pw: password });
  if (res.status === 429) {
    throw new AccessError("rate-limited", "Too many attempts from this network. Wait 15 minutes and try again.");
  }
  if (res.status === 404) return legacyUnlock(password);
  if (res.status >= 400) throw new AccessError("unavailable", `unlock-${res.status}`);
  if (!res.data) return null;
  memoryToken = res.data;
  storeToken(res.data);
  return (await loadPrivateData()) ?? {};
}

// Transition only: if the site deploys before 002_session_gate.sql has run in
// Supabase, unlock() does not exist yet (404). Fall back to the old yes/no check
// so nobody is locked out; private data stays hidden until the migration runs.
async function legacyUnlock(password: string): Promise<PrivateData | null> {
  const res = await rpc<boolean>("check_access", { pw: password });
  if (res.status >= 400) throw new AccessError("unavailable", `check-access-${res.status}`);
  return res.data === true ? {} : null;
}

// Re-enter a session saved earlier in this tab (a refresh). Null means there is
// no session or it expired, so the password screen should show.
export async function resumeSession(): Promise<PrivateData | null> {
  if (!gateConfigured) return loadDevPrivateData();
  if (!currentToken()) return null;
  const data = await loadPrivateData();
  if (!data) storeToken(null);
  return data;
}

async function loadPrivateData(): Promise<PrivateData | null> {
  const res = await rpc<PrivateData | null>("private_data", { token: currentToken() });
  if (res.status === 404) return null; // migration not run yet: ask for the password
  if (res.status >= 400) throw new AccessError("unavailable", `private-data-${res.status}`);
  return res.data;
}

// Local development with no Supabase keys: read the gitignored
// private/*.local.json if a developer has one. A deployed build always has
// Supabase configured, and CI never has the file, so nothing private can be
// bundled into the public site from here.
async function loadDevPrivateData(): Promise<PrivateData> {
  // DEV-gated so a production build tree-shakes the glob away and can never
  // emit the private file, even when built on a machine that has it.
  const files = import.meta.env.DEV
    ? import.meta.glob<{ default: PrivateData }>("/private/*.local.json")
    : {};
  const merged: PrivateData = {};
  for (const load of Object.values(files)) Object.assign(merged, (await load()).default);
  return merged;
}

// The school-news feature needs a server-side hop past the browser's CORS wall:
// in a deployed build that is the `school-news` Supabase Edge Function (which
// checks the session token); in local dev without Supabase keys it is the Vite
// dev-server proxy (vite.config.ts, "/__dev-news").
const devNewsProxy = import.meta.env.DEV && !gateConfigured;
export const newsConfigured = gateConfigured || devNewsProxy;

// Fetch recent Google News headlines mentioning a school. Throws on a missing
// config or a transport/function error so the hook can show a distinct state;
// never returns fabricated items.
export async function fetchSchoolNews(name: string, limit = 6): Promise<NewsItem[]> {
  if (devNewsProxy) {
    // Same quoted phrase query the Edge Function sends, parsed by the same parser.
    const q = encodeURIComponent(`"${name}"`);
    const res = await fetch(`/__dev-news?q=${q}&hl=en-US&gl=US&ceid=US:en`);
    if (!res.ok) throw new Error(`news-proxy-${res.status}`);
    return parseGoogleNewsRss(await res.text(), limit);
  }
  if (!gateConfigured) throw new Error("news-unconfigured");
  const res = await fetch(`${url}/functions/v1/school-news`, {
    method: "POST",
    headers: headers({ "x-access-token": currentToken() ?? "" }),
    body: JSON.stringify({ name, limit }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`news-${res.status}`);
  const data = (await res.json()) as { items?: unknown };
  const items = (Array.isArray(data.items) ? data.items : []) as NewsItem[];
  return items.slice(0, limit);
}
