import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str, u64 } from '@arkiv-network/sdk/attr';
import { eq, gte } from '@arkiv-network/sdk/query';
import { http } from 'viem';

const valueAfter = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const creator = valueAfter('--creator') ?? process.env.PUBLISHER_ADDRESS;
const severity = valueAfter('--severity');
const minMinutes = Number(valueAfter('--valid-for-minutes') ?? '0');
if (creator && !/^0x[0-9a-fA-F]{40}$/.test(creator)) throw new Error('Invalid creator address');
if (!Number.isFinite(minMinutes) || minMinutes < 0) throw new Error('Invalid minute range');

const client = createPublicClient({ chain: tiramisu, transport: http() });
let query = client.select({ key: true, creator: true, expiresAt: true, attributes: true, payload: true })
  .where(eq('app', str('signal-commons-india')))
  .where(eq('kind', str('alert')))
  .limit(200);
if (creator) query = query.createdBy(creator);
if (severity) query = query.where(eq('severity', str(severity)));
if (minMinutes > 0) {
  const threshold = BigInt(Date.now() + Math.round(minMinutes * 60_000));
  query = query.where(gte('expires_at_ms', u64(threshold)));
}
console.log(`Arkiv query: ${query.toString()}`);
let page = await query.fetch();
let count = 0;
console.log(`Query block ${page.blockNumber}`);
do {
  for (const entity of page.entities) {
    const alert = entity.toJson();
    count++;
    console.log(JSON.stringify({ key: entity.key, creator: entity.creator, title: alert?.title, area: alert?.areas?.[0], severity: alert?.severity, expiresAt: alert?.expiresAt }));
  }
  if (!page.hasNextPage()) break;
  page = await page.next();
} while (true);
console.log(`Total ${count} Arkiv entities`);
