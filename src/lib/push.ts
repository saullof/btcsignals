import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

// VAPID public key vem base64url; a API do navegador quer Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// Assinar push SÓ pode ser chamado no gesto do usuário (clique), senão iOS
// bloqueia silenciosamente. A inscrição é gravada direto no Postgres (policy
// RLS de INSERT anon) — sem Edge Function. Ver §11 do guia.
export async function enablePush(): Promise<{ ok: boolean; msg: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    return { ok: false, msg: 'Push não suportado neste navegador. No iPhone, instale o app na tela inicial primeiro.' }
  if (!VAPID) return { ok: false, msg: 'Falta VITE_VAPID_PUBLIC_KEY no build.' }
  if (!supabase) return { ok: false, msg: 'Supabase não configurado.' }

  const reg = await navigator.serviceWorker.ready
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, msg: 'Permissão negada nas configurações.' }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID),
  })
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint: j.endpoint,
    p256dh: j.keys?.p256dh,
    auth: j.keys?.auth,
  })
  // Endpoint repetido = já inscrito antes; tudo bem.
  if (error && !/duplicate|unique|conflict/i.test(error.message))
    return { ok: false, msg: 'Falha ao salvar inscrição: ' + error.message }

  return { ok: true, msg: 'Notificações ativadas! Você será avisado quando um sinal virar.' }
}
