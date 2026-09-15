// Supabase Edge Function (Deno): fetch recent Google News headlines that mention
// a school's name and return them as JSON. This exists because the app is a
// static site: browsers cannot fetch Google News RSS directly (no CORS headers),
// so this server-side hop does the fetch and adds the CORS headers the browser
// needs. It reuses the app's tested RSS parser (src/news/parseGoogleNews.ts) so
// the shape the inspector renders is defined in exactly one place.
//
// Deploy (one time, from the project root, with the Supabase CLI logged in and
// linked to your project):
//   supabase functions deploy school-news
// It is invoked from the client via supabase.functions.invoke("school-news",
// { body: { name } }); the platform's JWT check accepts the app's anon key, so
// this is not an open proxy. Free: Google News RSS needs no API key.

import { parseGoogleNewsRss } from "../../../src/news/parseGoogleNews.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const limit = typeof body?.limit === "number" ? Math.min(20, Math.max(1, body.limit)) : 6;
    if (!name) return json({ error: "Missing school name", items: [] }, 400);

    // Quote the name for a phrase match so "Miami Senior High School" does not
    // match every article containing "Miami" or "High".
    const q = encodeURIComponent(`"${name}"`);
    const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    const upstream = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SOH-Geomapping-Tool/1.0)" },
    });
    if (!upstream.ok) return json({ error: `Upstream ${upstream.status}`, items: [] }, 502);

    const xml = await upstream.text();
    const items = parseGoogleNewsRss(xml, limit);
    return json({ items });
  } catch (err) {
    return json({ error: String(err), items: [] }, 500);
  }
});
