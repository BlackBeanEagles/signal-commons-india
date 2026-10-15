import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { http } from 'viem';
import { createPublicClient, createWalletClient, ExpirationTime, jsonToPayload } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str, u64 } from '@arkiv-network/sdk/attr';
import { eq } from '@arkiv-network/sdk/query';
import { fetchXml, parseRss, parseCap, FEED_URL, shortText, referencedRssIds } from './feed.mjs';

const dryRun = process.env.DRY_RUN === '1';
const key = process.env.ARKIV_PRIVATE_KEY;
if (!dryRun && (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))) {
  console.error('Set ARKIV_PRIVATE_KEY in ignored .env.local (never commit or paste it).');
  process.exit(1);
}
const account = dryRun ? undefined : privateKeyToAccount(key);
const wallet = account ? createWalletClient({ chain: tiramisu, transport: http(), account }) : undefined;
const publicClient = dryRun ? undefined : createPublicClient({ chain: tiramisu, transport: http() });
const max = Math.min(Math.max(Number(process.env.MAX_ALERTS ?? '10'), 1), 30);
const statePath = new URL('../.cache/sachet.json', import.meta.url);
const evidencePath = new URL('../.cache/transactions.json', import.meta.url);
let cache = { caps: {} };
try { cache = JSON.parse(await readFile(statePath, 'utf8')); } catch {}
const feed = await fetchXml(FEED_URL, cache.etag);
const items = feed.unchanged && Array.isArray(cache.items) ? cache.items : parseRss(feed.xml);
if (!feed.unchanged) cache = { ...cache, etag: feed.etag, items, caps: cache.caps ?? {} };
await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
await writeFile(statePath, JSON.stringify(cache, null, 2));
console.log(`${dryRun ? 'DRY RUN' : `Publisher ${account.address}`}; feed items ${items.length}; processing at most ${max}`);

async function findPublished(id) {
  return publicClient.select({ key: true, attributes: true })
    .where(eq('app', str('signal-commons-india')))
    .where(eq('source_id', str(id)))
    .createdBy(account.address).limit(100).fetch();
}
async function removePublished(id, label) {
  const page = await findPublished(id);
  for (const entity of page.entities) {
    if (entity.key) {
      await wallet.deleteEntity({ entityKey: entity.key });
      console.log(`${label} ${id} ${entity.key}`);
    }
  }
}
async function recordCreation(entry) {
  let entries = [];
  try { entries = JSON.parse(await readFile(evidencePath, 'utf8')); } catch {}
  if (!Array.isArray(entries)) entries = [];
  entries.push(entry);
  await writeFile(evidencePath, JSON.stringify(entries, null, 2));
}

let created = 0;
const supersededIds = new Set();
for (const item of items.slice(0, max)) {
  try {
    if (supersededIds.has(item.guid)) {
      console.log(`SKIP ${item.guid}: superseded by a newer CAP item`);
      continue;
    }
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
    const referencedIds = referencedRssIds(cap.references);
    if (cap.messageType === 'Cancel') {
      const ids = [...new Set([item.guid, ...referencedIds])];
      if (dryRun) console.log(`CANCEL ${ids.join(', ')}`);
      else for (const id of ids) await removePublished(id, 'CANCELLED');
      for (const id of ids) supersededIds.add(id);
      continue;
    }
    const expiryMs = Date.parse(cap.expiresAt);
    if (expiryMs < Date.now() + 180_000 || cap.status !== 'Actual') {
      console.log(`SKIP ${item.guid}: expired or non-actual`);
      continue;
    }
    const digest = createHash('sha256').update(capXml).digest('hex');
    const payload = {
      source: 'NDMA SACHET public RSS/CAP feed', sourceUrl: item.link,
      sourceId: item.guid, sourceDigest: digest, retrievedAt: new Date().toISOString(),
      title: shortText(cap.headline || item.title), description: shortText(cap.description),
      instruction: shortText(cap.instruction), sender: cap.sender, areas: cap.areas,
      event: cap.event, severity: cap.severity, urgency: cap.urgency,
      certainty: cap.certainty, sentAt: cap.sentAt, expiresAt: cap.expiresAt,
      publisherNote: 'This wallet relayed a public CAP alert; it is not the issuing authority.',
    };
    if (dryRun) {
      console.log(`WOULD CREATE ${item.guid} ${cap.severity} ${cap.event} ${cap.areas.join(' | ')} expires ${cap.expiresAt}`);
      created++;
      if (cap.messageType === 'Update') referencedIds.forEach(id => supersededIds.add(id));
      continue;
    }
    const existing = await findPublished(item.guid);
    if (existing.entities.some(entity => entity.attributes?.source_digest?.value === digest)) {
      console.log(`SKIP ${item.guid}: already published`);
      continue;
    }
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
    try {
      await recordCreation({
        publisher: account.address,
        sourceId: item.guid,
        sourceUrl: item.link,
        sourceDigest: digest,
        expiresAt: cap.expiresAt,
        entityKey: result.entityKey,
        txHash: result.txHash,
        recordedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`EVIDENCE_SAVE_FAILED ${item.guid}: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const prior of existing.entities) {
      if (prior.key) {
        await wallet.deleteEntity({ entityKey: prior.key });
        console.log(`REPLACED ${item.guid} ${prior.key}`);
      }
    }
    if (cap.messageType === 'Update') {
      for (const id of referencedIds.filter(id => id !== item.guid)) {
        supersededIds.add(id);
        await removePublished(id, 'SUPERSEDED');
      }
    }
  } catch (error) {
    console.error(`ERROR ${item.guid}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`Done. ${dryRun ? 'Eligible' : 'Created'} ${created} Arkiv entities.`);
