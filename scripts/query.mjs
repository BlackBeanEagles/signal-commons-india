import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str } from '@arkiv-network/sdk/attr';
import { eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';

const client = createPublicClient({ chain: tiramisu, transport: http() });
let query = client.select({ key: true, creator: true, expiresAt: true, attributes: true, payload: true })
  .where(eq('app', str('signal-commons-india')))
  .where(eq('kind', str('alert')))
  .limit(200);
if (process.env.PUBLISHER_ADDRESS) query = query.createdBy(process.env.PUBLISHER_ADDRESS);
const page = await query.fetch();
console.log(`Query block ${page.blockNumber}; ${page.entities.length} entities; more=${page.hasNextPage()}`);
for (const entity of page.entities.slice(0, 10)) {
  const alert = entity.toJson();
  console.log(JSON.stringify({ key: entity.key, creator: entity.creator, title: alert?.title, area: alert?.areas?.[0], expiresAt: alert?.expiresAt }, null, 2));
}

