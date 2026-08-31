/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

// injectManifest injeta a lista de assets aqui; precisamos referenciá-la.
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)

// Ativa a versão nova imediatamente (senão o iOS segura o SW até fechar o app).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Push só chega quando há virada de estado (a Edge Function decide isso).
self.addEventListener('push', (event) => {
  let d: { title?: string; body?: string; url?: string } = {}
  try {
    d = event.data?.json() ?? {}
  } catch {
    d = { body: event.data?.text() }
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(d.title ?? 'BTC Cycle Signals', {
        body: d.body ?? '',
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg',
        data: { url: d.url ?? '/' },
      })
      // Badge no ícone do app = nº de notificações ainda na bandeja. Limpa ao abrir.
      const setBadge = (self.navigator as unknown as { setAppBadge?: (n: number) => Promise<void> }).setAppBadge
      if (setBadge) {
        const pending = await self.registration.getNotifications()
        await setBadge(pending.length).catch(() => {})
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data?.url as string) ?? '/'
  event.waitUntil(self.clients.openWindow(url))
})
