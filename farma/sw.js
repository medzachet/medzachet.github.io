// Офлайн: сначала сеть (чтобы новые карточки подтягивались), при её отсутствии — кэш.
// cache: 'no-cache' — всегда сверяться с сервером, иначе браузер до 10 минут отдаёт старую копию (GitHub Pages: max-age=600).
const CACHE = 'oz-v67';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // открытие страницы (navigate) нельзя передать в fetch вместе с настройками — браузер выдаёт ошибку,
  // и тогда отдавалась старая копия страницы. Для неё запрашиваем адрес заново.
  const req = e.request.mode === 'navigate' ? e.request.url : e.request;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
