// Envio de Web Push compartilhado (ingestão e alarmes de preço). Lê VAPID do
// ambiente; se faltar, só registra e segue. Marca inativa a inscrição expirada.
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function sendToAll(
  db: SupabaseClient,
  payload: { title: string; body: string; url?: string },
) {
  const subject = process.env.VAPID_SUBJECT
  const pub = process.env.VAPID_PUBLIC
  const priv = process.env.VAPID_PRIVATE
  if (!subject || !pub || !priv) {
    console.log('VAPID ausente — push pulado.')
    return
  }
  webpush.setVapidDetails(subject, pub, priv)
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('active', true)
  if (!subs?.length) {
    console.log('Sem inscrições ativas.')
    return
  }
  const body = JSON.stringify({ url: '/', ...payload })
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { urgency: 'high', TTL: 3600 },
      )
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_subscriptions').update({ active: false }).eq('id', s.id)
    }
  }
  console.log(`Push enviado p/ ${sent}/${subs.length} inscrição(ões).`)
}
