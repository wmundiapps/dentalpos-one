// REVAH® Service Worker v3 — atualização segura de conteúdo
const CACHE_NAME = 'revah-v12-canais-oficiais';
const STATIC_ASSETS = ['/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // HTML/navegação: rede primeiro para não prender versões antigas da landing page.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith((async () => {
      try {
        return await fetch(event.request, { cache: 'no-store' });
      } catch {
        return (await caches.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }

  // Assets: cache com atualização em segundo plano.
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const networkPromise = fetch(event.request).then(async response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    }).catch(() => null);
    return cached || await networkPromise || Response.error();
  })());
});

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(self.registration.showNotification(data.title || 'REVAH®', {
    body: data.body || 'Nova notificação',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [100,50,100],
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});
