// Retire the service worker previously installed by Rekeep.
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const keys = await caches.keys()
  await Promise.all(keys.filter((key) => key.startsWith('rekeep-public-')).map((key) => caches.delete(key)))
  await self.registration.unregister()
})()))
