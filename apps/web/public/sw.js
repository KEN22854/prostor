// «Простор» не использует service worker. Этот файл — «самоуничтожающийся»
// воркер: если на этом же адресе (например, localhost:3000) раньше работало
// другое приложение со своим /sw.js, браузер при проверке обновления получит
// этот скрипт, установит его, а он удалит кэши, снимет регистрацию и
// перезагрузит открытые вкладки. Иначе чужой воркер продолжал бы отдавать
// закэшированные файлы другого приложения и ломать вход и страницы.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
