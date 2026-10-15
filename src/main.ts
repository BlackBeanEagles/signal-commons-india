import './style.css';
import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { str } from '@arkiv-network/sdk/attr';
import { eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';

type AlertPayload = {
  source?: string; sourceUrl?: string; sourceId?: string; sourceDigest?: string;
  retrievedAt?: string; title?: string; description?: string; instruction?: string;
  sender?: string; areas?: string[]; event?: string; severity?: string;
  urgency?: string; certainty?: string; sentAt?: string; expiresAt?: string;
};
type AlertRecord = { key: string; creator: string; alert: AlertPayload };
const RPC_URL = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network';
const EXPLORER = 'https://tiramisu.explorer.arkiv.network';
const DEFAULT_PUBLISHER = String(import.meta.env.VITE_TRUSTED_CREATORS ?? '').split(',')[0]?.trim() ?? '';
const CACHE_KEY = 'signal-commons-public-alerts-v1';
const client = createPublicClient({ chain: tiramisu, transport: http(RPC_URL, { timeout: 12_000, retryCount: 0 }) });
const app = document.querySelector<HTMLDivElement>('#app')!;
const savedDistrict = localStorage.getItem('signal-commons-district') ?? '';
const savedPublisher = localStorage.getItem('signal-commons-publisher') ?? DEFAULT_PUBLISHER;
let records: AlertRecord[] = [];
let loading = false;
let blockNumber: bigint | undefined;
let cachedAt: string | undefined;
let showingCache = false;

app.innerHTML = `
  <div class="topbar"><div class="brand"><span class="brand-mark">SC<span class="brand-dot">.</span></span><span class="brand-name">Signal Commons <em>India</em></span></div><span class="network-pill"><span></span> ARKIV TIRAMISU TESTNET</span></div>
  <main>
    <section class="hero">
      <div class="hero-copy"><p class="eyebrow">OPEN PUBLIC ALERTS · INDIA</p><h1>Know the warning.<br><span>Know the source.</span></h1><p class="hero-lead">Public disaster alerts, indexed on Arkiv so anyone can read them without relying on this website. Every record links back to its official source and the wallet that relayed it.</p><div class="hero-actions"><a class="primary-link" href="#alerts">Explore alerts <span>↗</span></a><a class="secondary-link" href="https://sachet.ndma.gov.in/" target="_blank" rel="noopener noreferrer">Official SACHET portal ↗</a></div></div>
      <div class="hero-visual" aria-hidden="true"><div class="pulse pulse-one"></div><div class="pulse pulse-two"></div><div class="pulse pulse-three"></div><div class="map-dot dot-one"></div><div class="map-dot dot-two"></div><div class="map-dot dot-three"></div><div class="visual-card"><span class="visual-symbol">◉</span><div><strong>PUBLIC SIGNAL</strong><small>source → Arkiv → anyone</small></div></div></div>
    </section>
    <section class="metric-strip"><div><span class="metric-label" id="record-label">LIVE RECORDS</span><strong id="record-count">—</strong></div><div><span class="metric-label" id="block-label">QUERY BLOCK</span><strong id="query-block">—</strong></div><div><span class="metric-label">NETWORK</span><strong>Tiramisu <span class="muted">7738577</span></strong></div></section>
    <section class="workspace" id="alerts"><div class="section-heading"><div><p class="eyebrow">THE PUBLIC LEDGER</p><h2>Current alerts</h2><p>Read straight from Arkiv. Source details remain visible on every alert.</p></div><button class="refresh-button" id="refresh" type="button">↻ Refresh from Arkiv</button></div>
      <div class="filter-card"><div class="filter-grid"><label>District or area<input id="district" type="search" placeholder="Filter locally, e.g. Khagaria" autocomplete="off"></label><label>Hazard or severity<input id="hazard" type="search" placeholder="Rain, flood, severe…" autocomplete="off"></label><label>Publisher wallet<input id="publisher" type="text" placeholder="0x… (optional creator filter)" spellcheck="false"></label></div><div class="filter-bottom"><span>Area and hazard filters run on your device. Your preferences are saved only in this browser.</span><button id="clear-preferences" type="button">Clear saved filters</button></div></div>
      <div id="status" class="status" role="status">Connecting to Arkiv…</div><div id="cards" class="cards"></div>
      <aside class="verify-guide"><div><p class="eyebrow">INDEPENDENT CHECK</p><h3>Verify without this website</h3><p>Run the open-source reader against the public Tiramisu RPC. It filters by the app namespace and the Arkiv creator field. The wallet identifies the relay, not NDMA.</p></div><div><pre id="independent-query"></pre><button id="copy-query" type="button">Copy verification commands</button><a href="https://github.com/BlackBeanEagles/signal-commons-india/blob/master/arkiv/schema.md" target="_blank" rel="noopener noreferrer">Read schema and exact SDK query ↗</a></div></aside>
    </section>
    <section class="explain"><div><p class="eyebrow">WHY IT MATTERS</p><h2>Public data should<br>have a public exit.</h2></div><div class="explain-grid"><article><span>01 / SOURCE</span><h3>Trace the alert</h3><p>Each card links to its original SACHET CAP bulletin and shows the source named in that bulletin.</p></article><article><span>02 / CREATOR</span><h3>Check the relay</h3><p>Arkiv’s immutable creator field identifies the wallet that published this copy. It does not certify the issuing authority.</p></article><article><span>03 / EXPIRY</span><h3>Stay current</h3><p>Alerts leave the live query surface at their official expiry, instead of staying visible as stale warnings.</p></article><article><span>04 / REUSE</span><h3>Build another reader</h3><p>The MIT code, Arkiv schema, and exact query let anyone build a separate view without our API.</p></article></div></section>
    <section class="disclaimer"><strong>For awareness, not emergency dispatch.</strong><span>Follow instructions from official authorities. This independent relay can lag or be unavailable. Always verify urgent details at the linked source.</span></section>
  </main><footer><div class="brand"><span class="brand-mark">SC<span class="brand-dot">.</span></span><span class="brand-name">Signal Commons India</span></div><span>Built on Arkiv · Source: NDMA SACHET public alerts</span><a href="https://github.com/BlackBeanEagles/signal-commons-india" target="_blank" rel="noopener noreferrer">MIT source and schema ↗</a></footer>
`;

const districtInput = document.querySelector<HTMLInputElement>('#district')!;
const hazardInput = document.querySelector<HTMLInputElement>('#hazard')!;
const publisherInput = document.querySelector<HTMLInputElement>('#publisher')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const cards = document.querySelector<HTMLDivElement>('#cards')!;
districtInput.value = savedDistrict;
publisherInput.value = savedPublisher;

function validAddress(value: string): value is `0x${string}` { return /^0x[0-9a-fA-F]{40}$/.test(value); }
function formatDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value)) + ' IST';
}
function make(tag: string, className?: string, content?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content != null) element.textContent = content;
  return element;
}
function safeSourceUrl(value?: string) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'sachet.ndma.gov.in' ? url.href : null; } catch { return null; }
}
function alertCard(record: AlertRecord) {
  const { alert } = record;
  const card = make('article', 'alert-card');
  const top = make('div', 'card-top');
  if (showingCache) top.append(make('span', 'cache-label', 'Saved copy · unverified now'));
  const severity = make('span', `severity ${String(alert.severity ?? '').toLowerCase().replace(/[^a-z]/g, '')}`, alert.severity || 'Unspecified');
  const event = make('span', 'event-label', alert.event || 'Public alert');
  top.append(severity, event);
  card.append(top, make('h3', '', alert.title || 'Untitled alert'));
  const area = make('p', 'area', `⌖  ${alert.areas?.join(' · ') || 'Area not specified'}`);
  card.append(area);
  if (alert.instruction) card.append(make('p', 'instruction', alert.instruction));
  const meta = make('div', 'card-meta');
  meta.append(make('span', '', `Issued by ${alert.sender || 'source not specified'}`), make('span', '', `Expires ${formatDate(alert.expiresAt)}`));
  card.append(meta);
  if (showingCache) card.append(make('p', 'cache-warning', `Saved ${formatDate(cachedAt)}. Arkiv and the source may have changed. Check the official bulletin before acting.`));
  const bottom = make('div', 'card-bottom');
  const sourceUrl = safeSourceUrl(alert.sourceUrl);
  if (sourceUrl) { const link = make('a', 'source-link', 'Official bulletin ↗') as HTMLAnchorElement; link.href = sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; bottom.append(link); }
  const creator = make('a', 'creator-link', `Relay wallet ${record.creator.slice(0, 7)}…${record.creator.slice(-5)} ↗`) as HTMLAnchorElement;
  creator.href = `${EXPLORER}/address/${record.creator}`; creator.target = '_blank'; creator.rel = 'noopener noreferrer'; bottom.append(creator);
  card.append(bottom);
  const proof = make('details', 'record-proof');
  proof.append(make('summary', '', 'Inspect Arkiv record and source fingerprint'));
  const proofBody = make('div', 'record-proof-body');
  const key = make('code', '', record.key);
  proofBody.append(make('span', '', 'Entity key'), key);
  const entityLink = make('a', '', 'Open Arkiv data explorer ↗') as HTMLAnchorElement;
  entityLink.href = 'https://data.arkiv.network/';
  entityLink.target = '_blank'; entityLink.rel = 'noopener noreferrer'; proofBody.append(entityLink);
  const rpcRequest = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_getEntity', params: [record.key] });
  const copyRequest = make('button', 'copy-record', 'Copy direct RPC request') as HTMLButtonElement;
  copyRequest.type = 'button'; copyRequest.addEventListener('click', async () => { await navigator.clipboard.writeText(rpcRequest); copyRequest.textContent = 'Copied'; });
  proofBody.append(copyRequest);
  if (alert.sourceDigest) {
    proofBody.append(make('span', '', 'SHA-256 of CAP XML when relayed'), make('code', '', alert.sourceDigest));
  }
  proofBody.append(make('small', '', 'A matching hash can establish byte identity with the fetched CAP response. The relay wallet and hash alone do not authenticate the issuing authority.'));
  proof.append(proofBody); card.append(proof);
  return card;
}
function independentQuery() {
  const selected = publisherInput.value.trim();
  const creator = validAddress(selected) ? selected : DEFAULT_PUBLISHER;
  return `git clone https://github.com/BlackBeanEagles/signal-commons-india.git\ncd signal-commons-india\nnpm ci\nnpm run query -- --creator ${creator || '0xPUBLISHER_ADDRESS'}\nnpm run verify -- ${creator || '0xPUBLISHER_ADDRESS'}`;
}
function savePublicSnapshot() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), blockNumber: blockNumber?.toString(), records: records.slice(0, 100) }));
  } catch { /* Storage may be blocked or full. Live reads still work. */ }
}
function readPublicSnapshot(): { savedAt: string; blockNumber?: bigint; records: AlertRecord[] } | null {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (!data || !Number.isFinite(Date.parse(data.savedAt)) || !Array.isArray(data.records)) return null;
    const current = Date.now();
    const safeRecords = data.records.slice(0, 100).filter((record: AlertRecord) =>
      record && /^0x[0-9a-fA-F]{64}$/.test(record.key) && validAddress(record.creator) &&
      Array.isArray(record.alert?.areas) && Number.isFinite(Date.parse(record.alert.expiresAt ?? '')) &&
      Date.parse(record.alert.expiresAt ?? '') > current);
    return { savedAt: data.savedAt, blockNumber: /^\d+$/.test(data.blockNumber ?? '') ? BigInt(data.blockNumber) : undefined, records: safeRecords };
  } catch { return null; }
}
function render() {
  const district = districtInput.value.trim().toLowerCase();
  const hazard = hazardInput.value.trim().toLowerCase();
  const trustedAddress = publisherInput.value.trim().toLowerCase();
  const filtered = records.filter(({ alert, creator }) => {
    const areaText = (alert.areas ?? []).join(' ').toLowerCase();
    const hazardText = `${alert.event ?? ''} ${alert.severity ?? ''} ${alert.title ?? ''}`.toLowerCase();
    return (!district || areaText.includes(district)) && (!hazard || hazardText.includes(hazard)) && (!validAddress(trustedAddress) || creator.toLowerCase() === trustedAddress);
  }).sort((a, b) => Date.parse(b.alert.sentAt ?? '') - Date.parse(a.alert.sentAt ?? ''));
  cards.replaceChildren();
  if (filtered.length === 0) {
    const empty = make('div', 'empty-state');
    empty.append(make('strong', '', records.length ? 'No alerts match these filters.' : showingCache ? 'No unexpired saved alerts.' : 'No Signal Commons alerts on Arkiv yet.'), make('p', '', records.length ? 'Try another area or hazard.' : showingCache ? 'The last saved copy has no alerts that still pass their stated expiry. Reconnect to check Arkiv and the official SACHET portal.' : 'The importer needs a funded publisher wallet before it can create the first entity. The official SACHET portal remains available above.'));
    cards.append(empty);
  } else {
    for (const record of filtered) cards.append(alertCard(record));
  }
  document.querySelector<HTMLElement>('#record-count')!.textContent = String(records.length);
  document.querySelector<HTMLElement>('#query-block')!.textContent = blockNumber?.toString() ?? '—';
  document.querySelector<HTMLElement>('#record-label')!.textContent = showingCache ? 'SAVED RECORDS' : 'LIVE RECORDS';
  document.querySelector<HTMLElement>('#block-label')!.textContent = showingCache ? 'LAST QUERY BLOCK' : 'QUERY BLOCK';
  document.querySelector<HTMLElement>('#independent-query')!.textContent = independentQuery();
  if (!loading && !showingCache) status.textContent = `${filtered.length} shown · ${records.length} Arkiv record${records.length === 1 ? '' : 's'} fetched. ${validAddress(trustedAddress) ? 'Filtering by on-chain creator.' : 'Set a publisher wallet to filter by creator.'}`;
}
async function loadAlerts() {
  if (loading) return;
  loading = true; status.textContent = 'Querying Tiramisu directly…';
  (document.querySelector<HTMLButtonElement>('#refresh')!).disabled = true;
  try {
    const selectedPublisher = publisherInput.value.trim();
    let query = client.select({ key: true, creator: true, payload: true, expiresAt: true })
      .where(eq('app', str('signal-commons-india')))
      .where(eq('kind', str('alert'))).limit(200);
    if (validAddress(selectedPublisher)) query = query.createdBy(selectedPublisher);
    let page = await query.fetch();
    blockNumber = page.blockNumber;
    const entities = [...page.entities];
    for (let i = 0; i < 4 && page.hasNextPage(); i++) { page = await page.next(); entities.push(...page.entities); }
    const parsedRecords: AlertRecord[] = entities.flatMap(entity => {
      try {
        const payload = entity.toJson() as AlertPayload | undefined;
        if (!payload || !entity.key || !entity.creator || !Array.isArray(payload.areas)) return [];
        return [{ key: entity.key, creator: entity.creator, alert: payload }];
      } catch { return []; }
    });
    const latestBySource = new Map<string, AlertRecord>();
    for (const record of parsedRecords) {
      const id = record.alert.sourceId ?? record.key;
      const previous = latestBySource.get(id);
      if (!previous || Date.parse(record.alert.retrievedAt ?? '') > Date.parse(previous.alert.retrievedAt ?? '')) latestBySource.set(id, record);
    }
    records = [...latestBySource.values()];
    showingCache = false; cachedAt = undefined;
    savePublicSnapshot();
    loading = false;
    status.classList.remove('error');
    render();
  } catch (error) {
    loading = false;
    const snapshot = readPublicSnapshot();
    records = snapshot?.records ?? []; blockNumber = snapshot?.blockNumber;
    cachedAt = snapshot?.savedAt; showingCache = Boolean(snapshot);
    render();
    status.textContent = `Arkiv query failed. ${snapshot ? `Showing a saved copy from ${formatDate(snapshot.savedAt)}; it is not verified now.` : 'No saved copy is available.'} ${error instanceof Error ? error.message : String(error)}`;
    status.classList.add('error');
  } finally { loading = false; (document.querySelector<HTMLButtonElement>('#refresh')!).disabled = false; }
}

districtInput.addEventListener('input', () => { localStorage.setItem('signal-commons-district', districtInput.value); render(); });
hazardInput.addEventListener('input', render);
publisherInput.addEventListener('change', () => { localStorage.setItem('signal-commons-publisher', publisherInput.value.trim()); loadAlerts(); });
document.querySelector('#clear-preferences')!.addEventListener('click', () => { districtInput.value = ''; hazardInput.value = ''; publisherInput.value = DEFAULT_PUBLISHER; localStorage.removeItem('signal-commons-district'); localStorage.removeItem('signal-commons-publisher'); loadAlerts(); });
document.querySelector('#refresh')!.addEventListener('click', loadAlerts);
document.querySelector('#copy-query')!.addEventListener('click', async () => {
  await navigator.clipboard.writeText(independentQuery());
  const button = document.querySelector<HTMLButtonElement>('#copy-query')!;
  button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy verification commands'; }, 1800);
});
loadAlerts();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // The live app still works if the browser refuses offline storage.
    });
  });
}


