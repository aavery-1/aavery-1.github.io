// Access gate backed by Supabase. The shared password is NEVER stored in this
// app. It lives as a bcrypt hash in a Supabase table that the public API cannot
// read; a database function `check_access(pw)` compares a submitted password to
// that hash server-side and returns only true/false. So even though the built
// site (and a public GitHub repo) are readable by anyone, the password is not.
//
// The two values below are the PUBLIC Supabase URL and anon key. These are
// designed to be shipped in the browser: row-level security, not secrecy of the
// anon key, is what protects Supabase data. See SETUP in the chat / README.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseGoogleNewsRss, type NewsItem } from "../news/parseGoogleNews";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The gate is enforced only when Supabase is configured. With no .env (local
// development) the app runs open so there is no friction while building; the
// deployed build supplies the two env vars and the gate turns on automatically.
export const gateConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;
if (gateConfigured) {
  client = createClient(url as string, anonKey as string);
}

// Returns true only if Supabase confirms the password. Throws on a network or
// configuration error so the UI can show a distinct "could not check" message.
export async function checkAccess(password: string): Promise<boolean> {
  if (!client) return true; // gate disabled (not configured)
  const { data, error } = await client.rpc("check_access", { pw: password });
  if (error) throw error;
  return data === true;
}

// The school-news feature needs a server-side hop past the browser's CORS wall:
// in a deployed build that is the `school-news` Supabase Edge Function; in local
// dev without Supabase keys it is the Vite dev-server proxy (vite.config.ts,
// "/__dev-news"). A production build with no Supabase reports "unavailable".
const devNewsProxy = import.meta.env.DEV && !gateConfigured;
export const newsConfigured = gateConfigured || devNewsProxy;

// Fetch recent Google News headlines mentioning a school, via the Edge Function
// (or the dev proxy locally). Throws on a missing config or a transport/function
// error so the hook can show a distinct state; never returns fabricated items.
export async function fetchSchoolNews(name: string, limit = 6): Promise<NewsItem[]> {
  if (devNewsProxy) {
    // Same quoted phrase query the Edge Function sends, parsed by the same parser.
    const q = encodeURIComponent(`"${name}"`);
    const res = await fetch(`/__dev-news?q=${q}&hl=en-US&gl=US&ceid=US:en`);
    if (!res.ok) throw new Error(`news-proxy-${res.status}`);
    return parseGoogleNewsRss(await res.text(), limit);
  }
  if (!client) throw new Error("news-unconfigured");
  const { data, error } = await client.functions.invoke("school-news", { body: { name, limit } });
  if (error) throw error;
  const items = (data && Array.isArray(data.items) ? data.items : []) as NewsItem[];
  return items.slice(0, limit);
}
