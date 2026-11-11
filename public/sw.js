const cacheName = 'rekeep-public-1'
const publicAssets = ['/', '/style.css', '/app.mjs', '/match.mjs', '/mark.svg', '/return-art.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/mask-512.png']
self.addEventListener('install', (event) => event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(publicAssets))))
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('rekeep-public-') && key !== cacheName).map((key) => caches.delete(key)))).then(() => self.clients.claim())))
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
  } else if (publicAssets.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)))
  }
})
