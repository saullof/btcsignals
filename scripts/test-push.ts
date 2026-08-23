// Envia UMA notificação de teste pra todas as inscrições ativas.
//   node --env-file=supabase/.env scripts/test-push.ts
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const db = createClient(process.env.SUPABASE_URL!, process.env.SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC!, process.env.VAPID_PRIVATE!)

const { data: subs } = await db.from('push_subscriptions').select('*').eq('active', true)
if (!subs?.length) {
  console.log('Nenhuma inscrição ativa. Toque em "Ativar notificações" no app primeiro.')
  process.exit(0)
}
const payload = JSON.stringify({
  title: 'BTC Cycle Signals',
  body: '✅ Teste de notificação — está funcionando!',
  url: '/',
})
let sent = 0
for (const s of subs) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
      urgency: 'high',
      TTL: 3600,
    })
    sent++
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode
    console.log(`falha (${code}) numa inscrição`)
    if (code === 404 || code === 410) await db.from('push_subscriptions').update({ active: false }).eq('id', s.id)
  }
}
console.log(`Enviado p/ ${sent}/${subs.length} inscrição(ões).`)
