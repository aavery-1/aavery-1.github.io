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
// It is invoked from the client via supabase.functions.invoke("school-news",
// { body: { name } }); the platform's JWT check accepts the app's anon key, so
// this is not an open proxy. Free: Google News RSS needs no API key.
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
    if (!title || !url) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, url, source: decodedSource, publishedAt: publishedAt ? decodeEntities(publishedAt) : null });
    if (items.length >= limit) break;
  }
  return items;
}

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
