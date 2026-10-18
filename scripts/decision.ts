// Snapshot diário do painel de decisão (fase 1). Roda no worker junto com a
// ingestão: node --env-file=supabase/.env scripts/decision.ts
// Binance OHLC 2017+ → níveis candidatos, curvas de toque por regime,
// calibração walk-forward e retornos mensais (CBBI antes de 2017-08-17).
import { createClient } from '@supabase/supabase-js'
import { fetchBinanceDaily } from './binance.ts'
import { candidateLevels, emaSeries } from '../src/lib/levels.ts'
import { touchSamples, buildModel, calibrate, regimeOf, realizedVol } from '../src/lib/touch.ts'
import { monthlyReturns } from '../src/lib/seasonality.ts'
import type { DecisionSnapshot } from '../src/lib/types.ts'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltam SUPABASE_URL / SERVICE_ROLE_KEY (use --env-file=supabase/.env)')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function cbbiCloses(): Promise<{ date: string; close: number }[]> {
  const r = await fetch('https://colintalkscrypto.com/cbbi/data/latest.json')
  if (!r.ok) throw new Error(`CBBI -> ${r.status}`)
  const price: Record<string, number> = (await r.json()).Price
  return Object.entries(price).map(([t, v]) => ({ date: new Date(+t * 1000).toISOString().slice(0, 10), close: +v }))
}

async function main() {
  const [ohlc, cbbi] = await Promise.all([fetchBinanceDaily(), cbbiCloses()])
  const closes = ohlc.map((k) => k.close)
  const last = ohlc.length - 1
  const sigma = realizedVol(closes, last)
  const e50 = emaSeries(closes, 50)[last]
  const e200 = emaSeries(closes, 200)[last]
  if (!sigma || e50 == null || e200 == null) throw new Error('dados insuficientes para σ/EMAs')

  const samples = touchSamples(ohlc)
  const first = ohlc[0].date
  const snapshot: DecisionSnapshot = {
    date: ohlc[last].date,
    close: closes[last],
    sigma,
    regime: regimeOf(closes[last], e50, e200),
    model: buildModel(samples),
    calibration: { 7: calibrate(samples, 7), 30: calibrate(samples, 30) },
    levels: candidateLevels(ohlc),
    monthly: monthlyReturns([...cbbi.filter((d) => d.date < first), ...ohlc.map((k) => ({ date: k.date, close: k.close }))]),
  }

  const { error } = await db.from('decision_snapshot').upsert({ id: 1, payload: snapshot, updated_at: new Date().toISOString() })
  if (error) throw new Error(`upsert decision_snapshot: ${error.message ?? JSON.stringify(error)}`)
  console.log(
    `OK decision ${snapshot.date}: regime=${snapshot.regime} sigma=${sigma.toFixed(4)} níveis=${snapshot.levels.length} ` +
      `mae7=${snapshot.calibration[7].mae.toFixed(3)} mae30=${snapshot.calibration[30].mae.toFixed(3)} meses=${snapshot.monthly.length}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
