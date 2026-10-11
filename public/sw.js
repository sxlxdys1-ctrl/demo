const CACHE_NAME = 'my-world-offline-v1'
const SHELL_URL = new URL('./', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const page = await fetch(SHELL_URL, { cache: 'reload' })
    if (!page.ok) throw new Error('Game shell unavailable')
    const html = await page.clone().text()
    const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^" ]+)"/g)].map((match) => new URL(match[1], SHELL_URL).href)
    await cache.put(SHELL_URL, page)
    await cache.addAll([...assets, new URL('manifest.webmanifest', SHELL_URL).href, new URL('icon-192.png', SHELL_URL).href, new URL('icon-512.png', SHELL_URL).href])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((name) => name.startsWith('my-world-offline-') && name !== CACHE_NAME).map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  const basePath = new URL(SHELL_URL).pathname
  const staticPath = url.pathname === basePath || url.pathname.startsWith(`${basePath}assets/`) ||
    ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'sw.js'].some((name) => url.pathname === `${basePath}${name}`)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !staticPath) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request)
        if (response.ok) await cache.put(SHELL_URL, response.clone())
        return response
      } catch {
        const cachedPage = await cache.match(SHELL_URL)
        if (cachedPage) return cachedPage
        throw new Error('Offline game shell unavailable')
      }
    }
    const cached = await cache.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  })())
})
