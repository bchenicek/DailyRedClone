// Daily Red offline support. Saves everything the game needs on the phone so it opens without a connection.
// Built by build/build-web.sh, which fills in VERSION and the file list.
const VERSION = '0cca78dd37';
const CACHE = 'dailyred-' + VERSION;
const EXTERNAL = 'dailyred-external'; // Firebase code and fonts from Google's servers (kept across updates)
const PRECACHE = ["./", "manifest.webmanifest", "pool.json", "desc.json", "sprites.json", "battletext.json", "front.png", "back.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "app.js?v=6abd0b555a", "engine.js?v=fbd6bdc1a7", "web.js?v=5c726aa06f", "config.js?v=d8f79ac2ee"];
const EXTERNAL_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the browser's own cache so a new version always stores fresh files
    await cache.addAll(PRECACHE.map(u => new Request(u, {cache: 'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('dailyred-') && key !== CACHE && key !== EXTERNAL) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page sends the Google-hosted files it loaded (Firebase code, fonts) so they can be stored too
self.addEventListener('message', event => {
  const urls = (event.data && event.data.cacheUrls) || [];
  event.waitUntil((async () => {
    const cache = await caches.open(EXTERNAL);
    for (const url of urls) {
      try {
        if (!EXTERNAL_HOSTS.includes(new URL(url).hostname) || await cache.match(url)) continue;
        const font = new URL(url).hostname === 'fonts.gstatic.com';
        const res = await fetch(url, {mode: font ? 'cors' : 'no-cors'});
        if (res.ok || res.type === 'opaque') await cache.put(url, res);
      } catch (e) { /* offline or blocked: try again next time */ }
    }
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google-hosted Firebase code and fonts: use the saved copy, otherwise fetch and save
  if (EXTERNAL_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(EXTERNAL);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (url.origin !== self.location.origin) return; // Firebase sign-in and database traffic goes straight to the network

  // The page itself: try the network first so updates arrive, fall back to the saved copy when offline or slow
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
        if (res.ok) cache.put('./', res.clone());
        return res;
      } catch (e) {
        return (await cache.match('./')) || (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // Game files: saved copy first (each version stores fresh ones), network as a fallback
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      // Offline and this exact version isn't saved: use whichever version of the file is
      return (await cache.match(req, {ignoreSearch: true})) || Response.error();
    }
  })());
});
