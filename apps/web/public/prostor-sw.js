// Service worker «Простора» (PWA). Отдельное имя файла: /sw.js остаётся
// «самоуничтожающимся» — он снимает воркеры других приложений с этого адреса.
//
// Что кэшируем:
//  - /_next/static и иконки — неизменяемые (в имени хеш), cache-first;
//  - /api/assets/:id — содержимое ассета по id не меняется, cache-first
//    (картинки доски видны офлайн);
//  - страницы — network-first, офлайн отдаётся последняя версия или /offline.
// Остальной API не кэшируется: доска синхронизируется через Yjs и IndexedDB.
const VERSION = 'v1';
const STATIC = `prostor-static-${VERSION}`;
const PAGES = `prostor-pages-${VERSION}`;
const ASSETS = `prostor-assets-${VERSION}`;
const OFFLINE = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request(OFFLINE, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES, ASSETS]);
      for (const key of await caches.keys())
        if (key.startsWith('prostor-') && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Range-запросы (видео, аудио) отдаём как есть — частичные ответы не кэшируются
  if (response.ok && response.status === 200) {
    await cache.put(request, response.clone());
    if (limit) {
      const keys = await cache.keys();
      for (const old of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(old);
    }
  }
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match(OFFLINE)) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has('range')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (url.pathname.startsWith('/api/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS, 300));
  } else if (request.mode === 'navigate' && !url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstPage(request));
  }
});
