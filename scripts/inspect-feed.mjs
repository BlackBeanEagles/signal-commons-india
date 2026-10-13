import { fetchXml, parseRss, parseCap, FEED_URL } from './feed.mjs';

const rss = await fetchXml(FEED_URL);
const items = parseRss(rss.xml);
console.log(`SACHET feed: ${items.length} items; ETag: ${rss.etag ?? 'none'}`);
for (const item of items.slice(0, 3)) {
  const result = await fetchXml(item.link);
  const cap = parseCap(result.xml);
  console.log(JSON.stringify({ guid: item.guid, sender: cap.sender, event: cap.event, severity: cap.severity, areas: cap.areas, expiresAt: cap.expiresAt, title: item.title.slice(0, 120) }, null, 2));
}
