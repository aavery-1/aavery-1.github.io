import { describe, it, expect } from "vitest";
import { parseGoogleNewsRss } from "../parseGoogleNews";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item>
    <title>KIPP Miami opens new campus &amp; welcomes families - WPLG Local 10</title>
    <link>https://news.google.com/rss/articles/AAA</link>
    <pubDate>Mon, 15 Sep 2026 13:00:00 GMT</pubDate>
    <source url="https://www.local10.com">WPLG Local 10</source>
  </item>
  <item>
    <title>Board reviews &#39;persistently low-performing&#39; list - Miami Herald</title>
    <link>https://news.google.com/rss/articles/BBB</link>
    <pubDate>Sun, 14 Sep 2026 09:30:00 GMT</pubDate>
    <source url="https://www.miamiherald.com">Miami Herald</source>
  </item>
  <item>
    <title>KIPP Miami opens new campus &amp; welcomes families - WPLG Local 10</title>
    <link>https://news.google.com/rss/articles/DUPE</link>
    <source url="https://www.local10.com">WPLG Local 10</source>
  </item>
  <item>
    <title>Headline with no link should be skipped - Some Site</title>
    <source url="https://example.com">Some Site</source>
  </item>
</channel></rss>`;

describe("parseGoogleNewsRss", () => {
  it("extracts headlines, decodes entities, and strips the trailing publisher", () => {
    const items = parseGoogleNewsRss(RSS);
    expect(items[0].title).toBe("KIPP Miami opens new campus & welcomes families");
    expect(items[0].url).toBe("https://news.google.com/rss/articles/AAA");
    expect(items[0].source).toBe("WPLG Local 10");
    expect(items[0].publishedAt).toBe("Mon, 15 Sep 2026 13:00:00 GMT");
    expect(items[1].title).toBe("Board reviews 'persistently low-performing' list");
    expect(items[1].source).toBe("Miami Herald");
  });

  it("de-duplicates by title and skips items with no link", () => {
    const items = parseGoogleNewsRss(RSS);
    expect(items).toHaveLength(2); // dupe collapsed, linkless item dropped
    expect(items.map((i) => i.url)).not.toContain("https://news.google.com/rss/articles/DUPE");
  });

  it("caps the result at the requested limit, newest-first (feed order)", () => {
    expect(parseGoogleNewsRss(RSS, 1)).toHaveLength(1);
    expect(parseGoogleNewsRss(RSS, 1)[0].url).toBe("https://news.google.com/rss/articles/AAA");
  });

  it("returns an empty list for a feed with no items", () => {
    expect(parseGoogleNewsRss("<rss><channel></channel></rss>")).toEqual([]);
  });
});
