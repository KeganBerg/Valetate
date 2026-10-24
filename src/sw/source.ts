/** The service worker's source, with this build's version and files filled in. */
export function serviceWorkerSource(version: string, assets: string[]): string {
  return `// Valetate's service worker: keeps the app itself on the phone so it opens
// with no signal (a garage, a basement ramp). Data still comes from Supabase;
// changes made offline wait in the outbox until the signal is back.
const VERSION = ${JSON.stringify(version)};
const SHELL = ${JSON.stringify(assets)};
const CACHE = 'valetate-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', ...SHELL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('valetate-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // only this site's own files; Supabase and everything else go straight to the network
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // the newest app when there's signal, the saved one when there isn't
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
    return;
  }

  // hashed build files never change; the plate reader's files are big: keep both once fetched
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.includes('/assets/'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
}
