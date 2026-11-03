/**
 * Service worker de Ta'ahud (version web installée sur l'écran d'accueil).
 *
 * Objectif : une fois la page ouverte, l'application démarre même sans réseau,
 * et les pages du Mushaf déjà consultées restent disponibles hors ligne.
 *
 * - Navigation : le réseau d'abord (pour recevoir les mises à jour), sinon la
 *   page de l'application gardée en cache.
 * - Fichiers de l'application (noms avec empreinte) et pages du Mushaf :
 *   le cache d'abord, puis le réseau la première fois.
 */

const CACHE = 'taahud-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** Met en cache une réponse fraîche, sans jamais faire échouer la requête. */
async function keep(request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  } catch {}
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ouverture de l'app (ou d'un écran) : réseau d'abord, sinon la coquille en cache
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: 'no-store' });
          if (fresh.ok) {
            await keep(new Request('/index.html'), fresh.clone());
            return fresh;
          }
        } catch {}
        const cached = (await caches.match('/index.html')) || (await caches.match('/'));
        return cached || Response.error();
      })(),
    );
    return;
  }

  // Fichiers de l'app et pages du Mushaf : cache d'abord
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        await keep(request, fresh);
        return fresh;
      } catch (error) {
        const fallback = await caches.match(request);
        if (fallback) return fallback;
        throw error;
      }
    })(),
  );
});
