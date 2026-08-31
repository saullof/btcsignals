// Checagem rápida dos alarmes de preço (roda a cada poucos minutos pelo
// scheduler). Só busca o preço vivo da Binance, confere os alarmes ativos,
// dispara push nos que cruzaram e os desativa (one-shot). Leve de propósito:
// nada de reprocessar indicadores.
import { createClient } from '@supabase/supabase-js'
import type { PriceAlert } from '../src/lib/types.ts'
import { fmtUsd } from '../src/lib/ui.ts'
import { sendToAll } from './push-send.ts'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltam SUPABASE_URL / SERVICE_ROLE_KEY (use --env-file=supabase/.env)')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const crossed = (a: PriceAlert, price: number) =>
  a.direction === 'above' ? price >= a.target : price <= a.target

async function main() {
  const { data: alerts } = await db.from('price_alerts').select('*').eq('active', true)
  if (!alerts?.length) return

  const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
  if (!r.ok) throw new Error(`Binance ticker -> ${r.status}`)
  const price = Number((await r.json()).price)
  if (!Number.isFinite(price)) throw new Error('preço inválido')

  const hit = (alerts as PriceAlert[]).filter((a) => crossed(a, price))
  if (!hit.length) return

  const body =
    hit.length === 1
      ? `🎯 BTC ${hit[0].direction === 'above' ? 'subiu para' : 'caiu para'} ${fmtUsd(price)}${hit[0].note ? ` — ${hit[0].note}` : ''}`
      : `🎯 BTC em ${fmtUsd(price)}: ${hit.length} alarmes dispararam`
  await sendToAll(db, { title: 'Alarme de preço BTC', body, url: '/' })

  await db
    .from('price_alerts')
    .update({ active: false, triggered_at: new Date().toISOString() })
    .in('id', hit.map((a) => a.id))
  console.log(`${hit.length} alarme(s) disparado(s) @ ${fmtUsd(price)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
