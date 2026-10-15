const SHELL_CACHE = 'signal-commons-shell-v7';
const scope = self.registration.scope;

async function cacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await fetch(scope, { cache: 'reload' });
  if (!response.ok) throw new Error('App shell unavailable');
  const html = await response.clone().text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], scope))
    .filter((url) => url.origin === self.location.origin && url.href.startsWith(scope))
    .map((url) => url.href);
  await cache.put(scope, response);
  await cache.addAll([...assetUrls, new URL('monsoon-flood.png', scope).href]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('signal-commons-shell-') && name !== SHELL_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(async () => (await caches.open(SHELL_CACHE)).match(scope)));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const stored = await cache.match(event.request);
    if (stored) return stored;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
