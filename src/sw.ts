/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

// injectManifest injeta a lista de assets aqui; precisamos referenciá-la.
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)

// Push só chega quando há virada de estado (a Edge Function decide isso).
self.addEventListener('push', (event) => {
  let d: { title?: string; body?: string; url?: string } = {}
  try {
    d = event.data?.json() ?? {}
  } catch {
    d = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(d.title ?? 'BTC Cycle Signals', {
      body: d.body ?? '',
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      data: { url: d.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data?.url as string) ?? '/'
  event.waitUntil(self.clients.openWindow(url))
})
