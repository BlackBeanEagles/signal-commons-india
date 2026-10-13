import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { http } from 'viem';
import { createPublicClient, createWalletClient, ExpirationTime, jsonToPayload } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str, u64 } from '@arkiv-network/sdk/attr';
import { eq } from '@arkiv-network/sdk/query';
import { fetchXml, parseRss, parseCap, FEED_URL, shortText } from './feed.mjs';

const key = process.env.ARKIV_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error('Set ARKIV_PRIVATE_KEY in your environment (never commit or paste it).');
  process.exit(1);
}
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ chain: tiramisu, transport: http(), account });
const publicClient = createPublicClient({ chain: tiramisu, transport: http() });
const max = Math.min(Math.max(Number(process.env.MAX_ALERTS ?? '10'), 1), 30);
const statePath = new URL('../.cache/sachet.json', import.meta.url);
let cache = { caps: {} };
try { cache = JSON.parse(await readFile(statePath, 'utf8')); } catch {}
const feed = await fetchXml(FEED_URL, cache.etag);
let items;
if (feed.unchanged && Array.isArray(cache.items)) {
  items = cache.items;
} else {
  items = parseRss(feed.xml);
  cache = { ...cache, etag: feed.etag, items, caps: cache.caps ?? {} };
  await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
  await writeFile(statePath, JSON.stringify(cache, null, 2));
}
console.log(`Publisher ${account.address}; feed items ${items.length}; processing at most ${max}`);
let created = 0;
for (const item of items.slice(0, max)) {
  try {
    const savedCap = cache.caps?.[item.guid];
    const capResponse = await fetchXml(item.link, savedCap?.etag);
    const capXml = capResponse.unchanged ? savedCap?.xml : capResponse.xml;
    if (!capXml) throw new Error('CAP returned 304 without a cached copy');
    if (!capResponse.unchanged) {
      cache.caps = cache.caps ?? {};
      cache.caps[item.guid] = { etag: capResponse.etag, xml: capXml };
      await writeFile(statePath, JSON.stringify(cache, null, 2));
    }
    const cap = parseCap(capXml);
    const expiryMs = Date.parse(cap.expiresAt);
    if (cap.messageType === 'Cancel') {
      const ids = [...new Set([item.guid, ...Array.from(cap.references.matchAll(/IN-(\d+)/g), match => match[1])])];
      for (const id of ids) {
        const previous = await publicClient.select({ key: true })
          .where(eq('app', str('signal-commons-india')))
          .where(eq('source_id', str(id))).createdBy(account.address).limit(100).fetch();
        for (const entity of previous.entities) {
          if (entity.key) { await wallet.deleteEntity({ entityKey: entity.key }); console.log(`CANCELLED ${id} ${entity.key}`); }
        }
      }
      continue;
    }
    if (expiryMs < Date.now() + 180_000 || cap.status !== 'Actual') {
      console.log(`SKIP ${item.guid}: expired or non-actual`);
      continue;
    }
    const digest = createHash('sha256').update(capXml).digest('hex');
    const existing = await publicClient.select({ key: true, attributes: true })
      .where(eq('app', str('signal-commons-india')))
      .where(eq('source_id', str(item.guid)))
      .createdBy(account.address).limit(100).fetch();
    if (existing.entities.some(entity => entity.attributes?.source_digest?.value === digest)) {
      console.log(`SKIP ${item.guid}: already published`);
      continue;
    }
    const payload = {
      source: 'NDMA SACHET public RSS/CAP feed', sourceUrl: item.link,
      sourceId: item.guid, sourceDigest: digest, retrievedAt: new Date().toISOString(),
      title: shortText(cap.headline || item.title), description: shortText(cap.description),
      instruction: shortText(cap.instruction), sender: cap.sender, areas: cap.areas,
      event: cap.event, severity: cap.severity, urgency: cap.urgency,
      certainty: cap.certainty, sentAt: cap.sentAt, expiresAt: cap.expiresAt,
      publisherNote: 'This wallet relayed a public CAP alert; it is not the issuing authority.',
    };
    const result = await wallet.createEntity({
      payload: jsonToPayload(payload), contentType: 'application/json',
      attributes: {
        app: str('signal-commons-india'), kind: str('alert'),
        source_id: str(item.guid), source_digest: str(digest),
        event: str(shortText(cap.event, 120)), severity: str(shortText(cap.severity, 60)),
        area: str(shortText(cap.areas[0] ?? 'India', 180)),
        expires_at_ms: u64(BigInt(expiryMs)),
      },
      expires: ExpirationTime.atDate(new Date(expiryMs)),
    });
    created++;
    console.log(`CREATED ${item.guid} ${result.entityKey} ${result.txHash}`);
  } catch (error) {
    console.error(`ERROR ${item.guid}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`Done. Created ${created} Arkiv entities.`);


