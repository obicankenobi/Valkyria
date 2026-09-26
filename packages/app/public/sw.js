// sw.js — P74 (ETAPP7_TEKNISK_SPEC.md §10): helskärms-PWA. Ett handskrivet,
// litet service worker i stället för ett byggverktygstillägg (vite-plugin-pwa)
// — samma "hand-rullad kontroll före ett nytt beroende"-princip som
// persistence.ts/sound.ts redan följer i den här appen. Cache-falls-tillbaka-
// på-nätverk för samma-ursprung GET, så ett andra besök (och installerat
// helskärmsläge) fungerar offline utan att behöva en byggtidsgenererad
// tillgångslista — precis vad §0.5:s fynd efterlyste ("ingen service worker
// fanns", inte "fel typ av service worker").
const CACHE_NAME = 'seventh-front-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      } catch {
        const cached = await cache.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          const fallback = await cache.match('/')
          if (fallback) return fallback
        }
        throw new Error('offline och inget cachat svar')
      }
    }),
  )
})
