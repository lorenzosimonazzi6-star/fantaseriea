// ============================================================
// FANTASY ARENA — sw.js
// Service Worker per PWA: cache-first su asset statici,
// network-first su HTML e API Firebase.
// Versione: incrementa CACHE_VERSION ad ogni deploy per
// invalidare la cache vecchia.
// ============================================================

const CACHE_VERSION = "asa-v9";
const CACHE_STATIC = CACHE_VERSION + "-static";

// Asset statici da pre-cachare al momento dell'install
// Path relativi: risolti rispetto alla posizione del SW.
// Standalone (SW in /sw.js) → root; sotto proxy (/champions/sw.js) → /champions/
const PRECACHE_ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "i18n.js",
  "matches.js",
  "cookie-banner.js",
  "manifest.json",
  "favicon.svg",
  "logo.png",
  "og-image.svg"
];

// ── Install: pre-cacha asset statici ──────────────────────
self.addEventListener("install", event => {
  // cache:'no-cache' bypassa l'HTTP cache: garantisce file aggiornati
  const requests = PRECACHE_ASSETS.map(url => new Request(url, { cache: "no-cache" }));
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(requests))
  );
  self.skipWaiting();
});

// La pagina può chiedere di attivare subito una nuova versione in attesa
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// ── Activate: elimina cache vecchie, poi avvisa le tab di ricaricarsi ──
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith("asa-") && k !== CACHE_STATIC)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then(clients => clients.forEach(c => c.postMessage({ type: "SW_UPDATED" })))
  );
});

// ── Fetch: strategia per tipo di risorsa ──────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora richieste non-GET e richieste verso altri domini
  // (Firebase, Google Analytics, GTM, ecc.)
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Pagine HTML → Network-first (sempre aggiornate)
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Asset statici → Cache-first (veloci, invalidati da CACHE_VERSION)
  event.respondWith(cacheFirst(request));
});

// ── Strategie ─────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline e non in cache: lascia il browser gestire l'errore
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

// ── Push notifications ─────────────────────────────────
self.addEventListener("push", event => {
  const data = event.data?.json() ?? {};
  const title = data.title || "Fantasy Arena";
  const options = {
    body: data.body || "Novità nella tua lega!",
    icon: "logo.png",
    badge: "favicon.svg",
    data: { url: data.url || "./" },
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  event.waitUntil(clients.openWindow(url));
});
