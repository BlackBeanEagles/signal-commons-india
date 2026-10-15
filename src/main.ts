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
const urlState = new URLSearchParams(location.hash.startsWith('#alerts?') ? location.hash.slice('#alerts?'.length) : location.search);
const savedDistrict = urlState.get('area') ?? localStorage.getItem('signal-commons-district') ?? '';
const savedPublisher = localStorage.getItem('signal-commons-publisher') ?? DEFAULT_PUBLISHER;
let records: AlertRecord[] = [];
let loading = false;
let blockNumber: bigint | undefined;
let cachedAt: string | undefined;
let showingCache = false;
let queryError = false;
let lastSuccessfulAt: string | undefined;

app.innerHTML = `
  <div class="page-backdrop" aria-hidden="true"><img src="./monsoon-flood.png" alt="" /></div>
  <div class="topbar"><div class="brand"><span class="brand-mark">SC<span class="brand-dot">.</span></span><span class="brand-name">Signal Commons <em>India</em></span></div><span class="network-pill"><span></span> ARKIV TIRAMISU TESTNET</span></div>
  <main>
    <section class="hero">
      <div class="hero-copy"><p class="eyebrow">OPEN PUBLIC ALERTS · INDIA</p><h1>Know the warning.<br><span>Know the source.</span></h1><p class="hero-lead">From an official SACHET bulletin to a public, queryable record. Signal Commons relays Indian disaster alerts on Arkiv so another reader can check the source, creator and expiry without asking us for access.</p><form class="hero-search" id="hero-search"><label for="hero-area">Find a warning for your area</label><div><input id="hero-area" type="search" placeholder="District or state, e.g. Khagaria" autocomplete="off"><button type="submit">Find alerts ↗</button></div></form><div class="hero-actions"><a class="secondary-link" href="#how-it-works">See how verification works ↗</a><a class="secondary-link" href="https://sachet.ndma.gov.in/" target="_blank" rel="noopener noreferrer">Official SACHET portal ↗</a></div><p class="hero-note">Independent prototype · Not an official warning channel</p></div>
      <div class="hero-visual"><img src="./monsoon-flood.png" alt="Illustration of heavy monsoon rain flooding a road beside a swollen river and warning beacon" /><span class="image-caption">Illustration · not a live alert map</span><div class="visual-card"><span class="visual-symbol">◉</span><div><strong>PUBLIC SIGNAL</strong><small>official bulletin → Arkiv → independent readers</small></div></div></div>
    </section>
    <section class="metric-strip"><div><span class="metric-label" id="record-label">LIVE RECORDS</span><strong id="record-count">—</strong></div><div><span class="metric-label" id="block-label">QUERY BLOCK</span><strong id="query-block">—</strong></div><div><span class="metric-label">NETWORK</span><strong>Tiramisu <span class="muted">7738577</span></strong></div></section>
    <section class="workspace" id="alerts"><div class="section-heading"><div><p class="eyebrow">THE PUBLIC LEDGER</p><h2>Current alerts</h2><p>Read straight from Arkiv. Source details remain visible on every alert.</p></div><button class="refresh-button" id="refresh" type="button">↻ Refresh from Arkiv</button></div>
      <div class="filter-card"><div class="filter-grid"><label>District or area<input id="district" type="search" placeholder="Filter locally, e.g. Khagaria" autocomplete="off"></label><label>Hazard or severity<input id="hazard" type="search" placeholder="Rain, flood, severe…" autocomplete="off"></label><label>Publisher wallet<input id="publisher" type="text" placeholder="0x… (optional creator filter)" spellcheck="false"></label><label>Expiry view<select id="expiry-view"><option value="active">All unexpired</option><option value="soon">Expiring within 60 minutes</option></select></label><label>Sort alerts<select id="sort-order"><option value="newest">Newest bulletin first</option><option value="expiry">Soonest expiry first</option></select></label></div><div class="filter-bottom"><span>Area and hazard filters run on your device. Shareable filters use the URL fragment, which is not sent in the page request.</span><button id="clear-preferences" type="button">Clear filters</button></div></div>
      <div id="status" class="status" role="status">Connecting to Arkiv…</div><div id="trust-notice" class="trust-notice" role="note"></div><div id="cards" class="cards"></div>
      <aside class="verify-guide"><div><p class="eyebrow">INDEPENDENT CHECK</p><h3>Verify without this website</h3><p>Run the open-source reader against the public Tiramisu RPC. It filters by the app namespace and the Arkiv creator field. The wallet identifies the relay, not NDMA.</p></div><div><pre id="independent-query"></pre><button id="copy-query" type="button">Copy verification commands</button><a href="https://github.com/BlackBeanEagles/signal-commons-india/blob/master/arkiv/schema.md" target="_blank" rel="noopener noreferrer">Read schema and exact SDK query ↗</a></div></aside>
    </section>
    <section class="explain"><div><p class="eyebrow">WHY IT MATTERS</p><h2>Public data should<br>have a public exit.</h2></div><div class="explain-grid"><article><span>01 / SOURCE</span><h3>Trace the alert</h3><p>Each card links to its original SACHET CAP bulletin and shows the source named in that bulletin.</p></article><article><span>02 / CREATOR</span><h3>Check the relay</h3><p>Arkiv’s immutable creator field identifies the wallet that published this copy. It does not certify the issuing authority.</p></article><article><span>03 / EXPIRY</span><h3>Stay current</h3><p>Alerts leave the live query surface at their official expiry, instead of staying visible as stale warnings.</p></article><article><span>04 / REUSE</span><h3>Build another reader</h3><p>The MIT code, Arkiv schema, and exact query let anyone build a separate view without our API.</p></article></div></section>
    <section class="pipeline" id="how-it-works"><div><p class="eyebrow">FROM BULLETIN TO OPEN RECORD</p><h2>Every step has evidence.</h2><p>The source reader and parser are working. Arkiv publication still needs free test GLM; we do not show a transaction until one exists.</p></div><ol><li><strong>01 · SACHET source</strong><span>Read a public RSS entry and its linked CAP XML.</span></li><li><strong>02 · Parse and fingerprint</strong><span>Extract affected areas, instruction and expiry; hash the exact XML bytes.</span></li><li><strong>03 · Publish to Arkiv</strong><span>Create an expiring entity with a relay wallet. <em>Pending first testnet write.</em></span></li><li><strong>04 · Independent read</strong><span>The static site and open-source CLI query Arkiv directly.</span></li></ol></section>
    <section class="crops"><div class="crops-heading"><p class="eyebrow">BUILT AROUND CROPS</p><h2>Four tests for public infrastructure.</h2><p>Each pillar maps to a behavior you can inspect in the app or reproduce from the repository.</p></div><div class="crops-grid"><article><span>C</span><h3>Censorship resistance</h3><p>Records stay queryable through Arkiv even if this website disappears. The CLI is an independent reader.</p></article><article><span>O</span><h3>Open source</h3><p>MIT code, a documented schema and reproducible query steps let another team build its own view.</p></article><article><span>P</span><h3>Privacy</h3><p>District choices stay in this browser. The relay publishes public bulletins, not resident identities or subscriptions.</p></article><article><span>S</span><h3>Security</h3><p>The creator identifies the relay wallet; a CAP fingerprint helps detect changed source bytes. Neither proves the issuer is authentic.</p></article></div></section>
    <section class="disclaimer"><strong>For awareness, not emergency dispatch.</strong><span>Follow instructions from official authorities. This independent relay can lag or be unavailable. Always verify urgent details at the linked source.</span></section>
  </main><footer><div class="brand"><span class="brand-mark">SC<span class="brand-dot">.</span></span><span class="brand-name">Signal Commons India</span></div><span>Built on Arkiv · Source: NDMA SACHET public alerts</span><a href="https://github.com/BlackBeanEagles/signal-commons-india" target="_blank" rel="noopener noreferrer">MIT source and schema ↗</a></footer>
`;

const districtInput = document.querySelector<HTMLInputElement>('#district')!;
const heroAreaInput = document.querySelector<HTMLInputElement>('#hero-area')!;
const hazardInput = document.querySelector<HTMLInputElement>('#hazard')!;
const publisherInput = document.querySelector<HTMLInputElement>('#publisher')!;
const expiryView = document.querySelector<HTMLSelectElement>('#expiry-view')!;
const sortOrder = document.querySelector<HTMLSelectElement>('#sort-order')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const cards = document.querySelector<HTMLDivElement>('#cards')!;
districtInput.value = savedDistrict;
heroAreaInput.value = savedDistrict;
hazardInput.value = urlState.get('hazard') ?? '';
expiryView.value = urlState.get('expiry') === 'soon' ? 'soon' : 'active';
sortOrder.value = urlState.get('sort') === 'expiry' ? 'expiry' : 'newest';
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
  const knownRelay = validAddress(DEFAULT_PUBLISHER) && record.creator.toLowerCase() === DEFAULT_PUBLISHER.toLowerCase();
  top.append(make('span', knownRelay ? 'relay-badge known' : 'relay-badge unknown', knownRelay ? 'Configured relay' : 'Unverified relay'));
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
  if (!knownRelay) card.append(make('p', 'relay-warning', 'This wallet is not the configured Signal Commons relay. Its bulletin fields are unverified; check the original source before relying on them.'));
  if (showingCache) card.append(make('p', 'cache-warning', `Saved ${formatDate(cachedAt)}. Arkiv and the source may have changed. Check the official bulletin before acting.`));
  const bottom = make('div', 'card-bottom');
  const sourceUrl = safeSourceUrl(alert.sourceUrl);
  if (sourceUrl) { const link = make('a', 'source-link', 'Official bulletin ↗') as HTMLAnchorElement; link.href = sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; bottom.append(link); }
  const creator = make('a', 'creator-link', `Relay wallet ${record.creator.slice(0, 7)}…${record.creator.slice(-5)} ↗`) as HTMLAnchorElement;
  creator.href = `${EXPLORER}/address/${record.creator}`; creator.target = '_blank'; creator.rel = 'noopener noreferrer'; bottom.append(creator);
  card.append(bottom);
  const proof = make('details', 'record-proof');
  proof.append(make('summary', '', 'Inspect the evidence chain'));
  const proofBody = make('div', 'record-proof-body');
  const evidence = make('ol', 'evidence-steps');
  evidence.append(
    make('li', '', `Source bulletin: ${sourceUrl ? 'linked' : 'link unavailable'} · issued ${formatDate(alert.sentAt)}`),
    make('li', '', `CAP fingerprint: ${alert.sourceDigest ? 'recorded at relay time' : 'not present'}`),
    make('li', '', `Arkiv entity: ${showingCache ? 'saved copy; live status not checked' : 'retrieved in this query'}`),
    make('li', '', 'Source byte comparison: not run in this browser; use the verifier below')
  );
  proofBody.append(evidence);
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
function syncFilterUrl() {
  const params = new URLSearchParams();
  for (const [name, value] of [
    ['area', districtInput.value.trim()], ['hazard', hazardInput.value.trim()],
    ['expiry', expiryView.value === 'soon' ? 'soon' : ''],
    ['sort', sortOrder.value === 'expiry' ? 'expiry' : ''],
  ]) {
    if (value) params.set(name, value); else params.delete(name);
  }
  const remainingQuery = new URLSearchParams(location.search);
  for (const key of ['area', 'hazard', 'expiry', 'sort']) remainingQuery.delete(key);
  const query = remainingQuery.size ? '?' + remainingQuery.toString() : '';
  history.replaceState(null, '', `${location.pathname}${query}${params.size ? '#alerts?' + params.toString() : '#alerts'}`);
}
function render() {
  const district = districtInput.value.trim().toLowerCase();
  const hazard = hazardInput.value.trim().toLowerCase();
  const trustedAddress = publisherInput.value.trim().toLowerCase();
  const now = Date.now();
  const activeRecords = records.filter(({ alert }) => Number.isFinite(Date.parse(alert.expiresAt ?? '')) && Date.parse(alert.expiresAt ?? '') > now);
  const filtered = activeRecords.filter(({ alert, creator }) => {
    const areaText = (alert.areas ?? []).join(' ').toLowerCase();
    const hazardText = `${alert.event ?? ''} ${alert.severity ?? ''} ${alert.title ?? ''}`.toLowerCase();
    const expires = Date.parse(alert.expiresAt ?? '');
    const withinHour = Number.isFinite(expires) && expires > now && expires <= now + 3_600_000;
    return (!district || areaText.includes(district)) && (!hazard || hazardText.includes(hazard)) &&
      (!validAddress(trustedAddress) || creator.toLowerCase() === trustedAddress) &&
      (expiryView.value !== 'soon' || withinHour);
  }).sort((a, b) => sortOrder.value === 'expiry'
    ? Date.parse(a.alert.expiresAt ?? '') - Date.parse(b.alert.expiresAt ?? '')
    : Date.parse(b.alert.sentAt ?? '') - Date.parse(a.alert.sentAt ?? ''));
  cards.replaceChildren();
  if (filtered.length === 0) {
    const empty = make('div', 'empty-state');
    const heading = activeRecords.length ? 'No alerts match these filters.' : showingCache ? 'No unexpired saved alerts.' : queryError ? 'Unable to retrieve Arkiv alerts.' : 'No Signal Commons alerts on Arkiv yet.';
    const detail = activeRecords.length ? 'Try another area, hazard or expiry view.' : showingCache ? 'The last saved copy has no alerts that still pass their stated expiry. Reconnect to check Arkiv and the official SACHET portal.' : queryError ? 'The network query failed. Retry when connected, or check the official SACHET portal.' : 'The importer needs a funded publisher wallet before it can create the first entity. The official SACHET portal remains available above.';
    empty.append(make('strong', '', heading), make('p', '', detail));
    cards.append(empty);
  } else {
    for (const record of filtered) cards.append(alertCard(record));
  }
  document.querySelector<HTMLElement>('#record-count')!.textContent = String(activeRecords.length);
  document.querySelector<HTMLElement>('#query-block')!.textContent = blockNumber?.toString() ?? '—';
  document.querySelector<HTMLElement>('#record-label')!.textContent = showingCache ? 'SAVED RECORDS' : 'LIVE RECORDS';
  document.querySelector<HTMLElement>('#block-label')!.textContent = showingCache ? 'LAST QUERY BLOCK' : 'QUERY BLOCK';
  document.querySelector<HTMLElement>('#independent-query')!.textContent = independentQuery();
  const trustNotice = document.querySelector<HTMLElement>('#trust-notice')!;
  trustNotice.textContent = validAddress(trustedAddress)
    ? `Creator filter active: only Arkiv entities written by ${trustedAddress} are shown. This proves the relay wallet, not the issuing authority.`
    : 'All creators are visible. Anyone can use this app tag; inspect each creator and source before relying on an alert.';
  trustNotice.classList.toggle('open', !validAddress(trustedAddress));
  if (!loading && !showingCache && !queryError) status.textContent = `${filtered.length} shown · ${activeRecords.length} unexpired Arkiv record${activeRecords.length === 1 ? '' : 's'} fetched · checked ${formatDate(lastSuccessfulAt)}. ${validAddress(trustedAddress) ? 'Filtering by on-chain creator.' : 'Set a publisher wallet to filter by creator.'}`;
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
    queryError = false;
    lastSuccessfulAt = new Date().toISOString();
    savePublicSnapshot();
    loading = false;
    status.classList.remove('error');
    render();
  } catch (error) {
    loading = false;
    queryError = true;
    const snapshot = readPublicSnapshot();
    records = snapshot?.records ?? []; blockNumber = snapshot?.blockNumber;
    cachedAt = snapshot?.savedAt; showingCache = Boolean(snapshot);
    render();
    status.textContent = `Arkiv query failed. ${snapshot ? `Showing a saved copy from ${formatDate(snapshot.savedAt)}; it is not verified now.` : 'No saved copy is available.'} ${error instanceof Error ? error.message : String(error)}`;
    status.classList.add('error');
  } finally { loading = false; (document.querySelector<HTMLButtonElement>('#refresh')!).disabled = false; }
}

districtInput.addEventListener('input', () => { localStorage.setItem('signal-commons-district', districtInput.value); heroAreaInput.value = districtInput.value; syncFilterUrl(); render(); });
hazardInput.addEventListener('input', () => { syncFilterUrl(); render(); });
expiryView.addEventListener('change', () => { syncFilterUrl(); render(); });
sortOrder.addEventListener('change', () => { syncFilterUrl(); render(); });
document.querySelector<HTMLFormElement>('#hero-search')!.addEventListener('submit', (event) => {
  event.preventDefault(); districtInput.value = heroAreaInput.value.trim();
  localStorage.setItem('signal-commons-district', districtInput.value);
  syncFilterUrl(); render(); document.querySelector('#alerts')!.scrollIntoView({ behavior: 'smooth' });
});
publisherInput.addEventListener('change', () => { localStorage.setItem('signal-commons-publisher', publisherInput.value.trim()); loadAlerts(); });
document.querySelector('#clear-preferences')!.addEventListener('click', () => { districtInput.value = ''; heroAreaInput.value = ''; hazardInput.value = ''; expiryView.value = 'active'; sortOrder.value = 'newest'; publisherInput.value = DEFAULT_PUBLISHER; localStorage.removeItem('signal-commons-district'); localStorage.removeItem('signal-commons-publisher'); syncFilterUrl(); loadAlerts(); });
document.querySelector('#refresh')!.addEventListener('click', loadAlerts);
document.querySelector('#copy-query')!.addEventListener('click', async () => {
  await navigator.clipboard.writeText(independentQuery());
  const button = document.querySelector<HTMLButtonElement>('#copy-query')!;
  button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy verification commands'; }, 1800);
});
loadAlerts();
if (location.hash.startsWith('#alerts?')) document.querySelector('#alerts')!.scrollIntoView();
setInterval(render, 60_000);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => {
      // The live app still works if the browser refuses offline storage.
    });
  });
}


