// Parse a Google News RSS search feed into a small list of headlines. Pure
// string -> objects, with NO Deno or browser APIs, so it is unit-tested by the
// app (vitest) AND imported verbatim by the Supabase Edge Function that fetches
// the feed server-side (supabase/functions/school-news/index.ts). Keeping the
// parser here means there is one tested source of truth for the shape the news
// card renders.
//
// Google News RSS items look like:
//   <item>
//     <title>Some headline - WPLG Local 10</title>
//     <link>https://news.google.com/rss/articles/CBM...</link>
//     <pubDate>Mon, 15 Sep 2026 13:00:00 GMT</pubDate>
//     <source url="https://www.local10.com">WPLG Local 10</source>
//   </item>
// Titles are HTML-entity encoded and usually carry a trailing " - Publisher".

export interface NewsItem {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null; // the feed's RFC-822 date string, as provided
}

// Decode the handful of XML/HTML entities Google News emits in titles/sources.
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

// Extract up to `limit` headlines from the RSS XML, in feed order (Google News
// returns them newest-first), de-duplicated by title. Malformed items (missing a
// title or link) are skipped rather than throwing, so a partial feed still works.
export function parseGoogleNewsRss(xml: string, limit = 6): NewsItem[] {
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
    // Google appends " - Publisher" to the headline; drop it when it matches the
    // <source>, so the link text is the headline itself (the publisher shows as a
    // muted label in the card).
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
