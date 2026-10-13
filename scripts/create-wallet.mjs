import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const target = new URL('../.env.local', import.meta.url);
if (existsSync(target)) {
  console.error('.env.local already exists; refusing to overwrite a wallet.');
  process.exit(1);
}
const privateKey = generatePrivateKey();
const address = privateKeyToAccount(privateKey).address;
const content = `# Dedicated Tiramisu test wallet only. Never fund with real assets.\nARKIV_PRIVATE_KEY=${privateKey}\nVITE_TRUSTED_CREATORS=${address}\nMAX_ALERTS=10\n`;
await writeFile(target, content, { flag: 'wx', mode: 0o600 });
console.log('Created a dedicated TESTNET wallet locally in ignored .env.local');
console.log(`Public address: ${address}`);
console.log('The private key was not printed. Fund this address through the official Arkiv Tiramisu faucet using a wallet you control.');
