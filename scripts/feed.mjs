import { XMLParser } from 'fast-xml-parser';

export const FEED_URL = 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml';
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const value = (object, name) => object?.[`cap:${name}`] ?? object?.[name];

export async function fetchXml(url, etag) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'sachet.ndma.gov.in') {
    throw new Error(`Refusing non-SACHET URL: ${url}`);
  }
  const headers = etag ? { 'If-None-Match': etag } : {};
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (response.status === 304) return { unchanged: true, etag };
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return { xml: await response.text(), etag: response.headers.get('etag') };
}

export function parseRss(xml) {
  const channel = parser.parse(xml)?.rss?.channel;
  if (!channel) throw new Error('SACHET RSS has no channel');
  return list(channel.item).map(item => ({
    guid: String(item.guid?.['#text'] ?? item.guid ?? ''),
    title: String(item.title ?? ''),
    category: String(item.category ?? ''),
    author: String(item.author ?? ''),
    link: String(item.link ?? ''),
    publishedAt: new Date(item.pubDate).toISOString(),
  })).filter(item => item.guid && item.link);
}

export function parseCap(xml) {
  const alert = parser.parse(xml)?.['cap:alert'];
  if (!alert) throw new Error('CAP XML has no alert');
  const infos = list(value(alert, 'info'));
  const info = infos.find(x => String(value(x, 'language') ?? '').startsWith('en')) ?? infos[0];
  if (!info) throw new Error('CAP alert has no info');
  const areas = list(value(info, 'area'));
  const areaNames = areas.map(area => String(value(area, 'areaDesc') ?? '')).filter(Boolean);
  const expiresRaw = String(value(info, 'expires') ?? '');
  const expiresAt = new Date(expiresRaw);
  if (!Number.isFinite(expiresAt.getTime())) throw new Error('CAP alert has invalid expiry');
  return {
    identifier: String(value(alert, 'identifier') ?? ''),
    sender: String(value(alert, 'sender') ?? ''),
    status: String(value(alert, 'status') ?? ''),
    messageType: String(value(alert, 'msgType') ?? ''),
    references: String(value(alert, 'references') ?? ''),
    sentAt: String(value(alert, 'sent') ?? ''),
    language: String(value(info, 'language') ?? ''),
    category: String(value(info, 'category') ?? ''),
    event: String(value(info, 'event') ?? ''),
    urgency: String(value(info, 'urgency') ?? ''),
    severity: String(value(info, 'severity') ?? ''),
    certainty: String(value(info, 'certainty') ?? ''),
    headline: String(value(info, 'headline') ?? ''),
    description: String(value(info, 'description') ?? ''),
    instruction: String(value(info, 'instruction') ?? ''),
    areas: areaNames,
    expiresAt: expiresAt.toISOString(),
  };
}

export function shortText(text, max = 2500) {
  return String(text).slice(0, max);
}


export function referencedRssIds(references) {
  return [...new Set(Array.from(String(references).matchAll(/IN-(\d+)/g), match => match[1]))];
}

