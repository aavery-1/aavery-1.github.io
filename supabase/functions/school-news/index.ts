// Supabase Edge Function (Deno): fetch recent Google News headlines that mention
// a school's name and return them as JSON. This exists because the app is a
// static site: browsers cannot fetch Google News RSS directly (no CORS headers),
// so this server-side hop does the fetch and adds the CORS headers the browser
// needs.
//
// Deploy, either one:
//   - Dashboard (simplest): Supabase project -> Edge Functions -> Deploy a new
//     function named "school-news", paste this whole file, Deploy.
//   - CLI: supabase functions deploy school-news
// It is called with a POST from src/auth/access.ts (fetchSchoolNews, body
// { name, limit }) and requires a live session token from the password gate
// in the x-access-token header (see hasLiveSession). Free: Google News RSS needs
// no API key.
//
// NOTE: the RSS parser below is an in-sync COPY of src/news/parseGoogleNews.ts
// (the app's vitest-tested source of truth). It is inlined here, rather than
// imported, so this stays a single self-contained file that pastes/deploys
// cleanly. If you change parsing logic, change both files (the __tests__ cover
// the app copy). See src/news/__tests__ for the behavior these regexes must meet.

interface NewsItem {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null; // the feed's RFC-822 date string, as provided
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&") // must run last so "&amp;#39;" style double-encoding resolves left-to-right
    .trim();
}

function firstMatch(block: string, re: RegExp): string | null {
  const m = re.exec(block);
  return m ? m[1] : null;
}

function parseGoogleNewsRss(xml: string, limit = 6): NewsItem[] {
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const rawTitle = firstMatch(block, /<title\b[^>]*>([\s\S]*?)<\/title>/);
    const rawLink = firstMatch(block, /<link\b[^>]*>([\s\S]*?)<\/link>/);
    if (!rawTitle || !rawLink) continue;
    const source = firstMatch(block, /<source\b[^>]*>([\s\S]*?)<\/source>/);
    const publishedAt = firstMatch(block, /<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/);
    const decodedSource = source ? decodeEntities(source) : null;
    let title = decodeEntities(rawTitle);
    if (decodedSource && title.endsWith(` - ${decodedSource}`)) {
      title = title.slice(0, -(` - ${decodedSource}`.length)).trim();
    }
    const url = decodeEntities(rawLink);
    if (!title || !/^https?:\/\//i.test(url)) continue; // only web links, never javascript: etc.
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, url, source: decodedSource, publishedAt: publishedAt ? decodeEntities(publishedAt) : null });
    if (items.length >= limit) break;
  }
  return items;
}

// Only the deployed site and local dev may call this from a browser.
const ALLOWED_ORIGINS = new Set([
  "https://aavery-1.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://aavery-1.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

// The caller must hold a live session token from the password gate (unlock() in
// supabase/002_session_gate.sql). The public anon key alone is not enough, so
// this cannot be used as an open proxy by anyone who reads the site's code.
async function hasLiveSession(token: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !key) return false;
  const res = await fetch(`${base}/rest/v1/rpc/session_valid`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return res.ok && (await res.json()) === true;
}

const MAX_NAME_LENGTH = 200;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed", items: [] }, 405);
  try {
    if (!(await hasLiveSession(req.headers.get("x-access-token") ?? ""))) {
      return json(req, { error: "Session expired", items: [] }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const limit = typeof body?.limit === "number" ? Math.min(20, Math.max(1, Math.floor(body.limit))) : 6;
    if (!name || name.length > MAX_NAME_LENGTH) return json(req, { error: "Missing or invalid school name", items: [] }, 400);

    // Quote the name for a phrase match so "Miami Senior High School" does not
    // match every article containing "Miami" or "High".
    const q = encodeURIComponent(`"${name}"`);
    const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    const upstream = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SOH-Geomapping-Tool/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) return json(req, { error: `Upstream ${upstream.status}`, items: [] }, 502);

    const xml = await upstream.text();
    const items = parseGoogleNewsRss(xml, limit);
    return json(req, { items });
  } catch (err) {
    // Log the detail server-side; never echo internals to the caller.
    console.error(err);
    return json(req, { error: "News lookup failed", items: [] }, 500);
  }
});
