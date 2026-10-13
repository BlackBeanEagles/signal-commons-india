import { createHash } from 'node:crypto';
import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str } from '@arkiv-network/sdk/attr';
import { eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';
import { fetchXml } from './feed.mjs';

const creator = process.argv[2];
if (creator && !/^0x[0-9a-fA-F]{40}$/.test(creator)) throw new Error('Usage: npm run verify -- 0xPUBLISHER_ADDRESS');
const client = createPublicClient({ chain: tiramisu, transport: http() });
let query = client.select({ key: true, creator: true, payload: true })
  .where(eq('app', str('signal-commons-india')))
  .where(eq('kind', str('alert'))).limit(20);
if (creator) query = query.createdBy(creator);
const page = await query.fetch();
console.log(`Checking up to 20 live Arkiv entities at block ${page.blockNumber}`);
let matched = 0;
let changed = 0;
let unavailable = 0;
for (const entity of page.entities) {
  const alert = entity.toJson();
  if (!alert?.sourceUrl || !/^[0-9a-f]{64}$/i.test(alert.sourceDigest ?? '')) {
    console.log(`INVALID_RECORD ${entity.key}`);
    changed++;
    continue;
  }
  try {
    const response = await fetchXml(alert.sourceUrl);
    const digest = createHash('sha256').update(response.xml).digest('hex');
    if (digest === alert.sourceDigest) {
      console.log(`MATCH ${entity.key} ${alert.sourceId}`);
      matched++;
    } else {
      console.log(`SOURCE_CHANGED ${entity.key} ${alert.sourceId} stored=${alert.sourceDigest} current=${digest}`);
      changed++;
    }
  } catch (error) {
    console.log(`SOURCE_UNAVAILABLE ${entity.key} ${error instanceof Error ? error.message : String(error)}`);
    unavailable++;
  }
}
console.log(`Results: ${matched} match, ${changed} changed or invalid, ${unavailable} source unavailable.`);
console.log('A matching digest checks byte identity against the current CAP response. It does not prove the issuer is genuine; a changed source may reflect a legitimate update.');
