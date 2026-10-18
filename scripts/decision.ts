// Snapshot diário do painel de decisão. Roda no worker junto com a ingestão:
//   node --env-file=supabase/.env scripts/decision.ts
// Fase 1: Binance OHLC 2017+ → níveis, curvas de toque por regime, calibração
// walk-forward, retornos mensais (CBBI antes de 2017-08-17).
// Fase 2: peso de cada indicador (tercis × quintis) + teste walk-forward.
import { createClient } from '@supabase/supabase-js'
import { fetchBinanceDaily } from './binance.ts'
import { CBBI_INDICATORS, fetchJson, seriesToMap, tsToDate } from './sources.ts'
import { candidateLevels, emaSeries } from '../src/lib/levels.ts'
import { touchSamples, buildModel, calibrate, regimeOf, realizedVol } from '../src/lib/touch.ts'
import { monthlyReturns } from '../src/lib/seasonality.ts'
import { rsiSeries, emaDistSeries, returnSeries, volSeries, pctBSeries, piRatioSeries } from '../src/lib/indicators.ts'
import { horizonWeight } from '../src/lib/weights.ts'
import type { DecisionSnapshot, IndicatorWeight } from '../src/lib/types.ts'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltam SUPABASE_URL / SERVICE_ROLE_KEY (use --env-file=supabase/.env)')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

type Series = (number | null)[]

// Valor por data no calendário `dates`; repete o último valor por até `maxGap`
// dias (CBBI/F&G costumam atrasar 1–2 dias). Mais velho que isso → null.
function align(dates: string[], m: Map<string, number>, maxGap = 3): Series {
  let last: number | null = null
  let age = Infinity
  return dates.map((d) => {
    const v = m.get(d)
    if (v != null) {
      last = v
      age = 0
    } else age++
    return age <= maxGap ? last : null
  })
}

// Média de 7 dias da taxa de funding (Binance futuros), por data. Null se a API falhar.
async function fundingByDate(): Promise<Map<string, number> | null> {
  try {
    const perDay = new Map<string, number[]>()
    let start = Date.UTC(2019, 8, 10)
    for (let page = 0; page < 20; page++) {
      const rows: { fundingTime: number; fundingRate: string }[] = await fetchJson(
        `https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1000&startTime=${start}`,
      )
      for (const r of rows) {
        const d = new Date(r.fundingTime).toISOString().slice(0, 10)
        perDay.set(d, [...(perDay.get(d) ?? []), +r.fundingRate])
      }
      if (rows.length < 1000) break
      start = rows[rows.length - 1].fundingTime + 1
    }
    const days = [...perDay.keys()].sort()
    const daily = days.map((d) => perDay.get(d)!.reduce((a, b) => a + b, 0) / perDay.get(d)!.length)
    const out = new Map<string, number>()
    days.forEach((d, i) => {
      if (i >= 6) out.set(d, daily.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7)
    })
    return out
  } catch (e) {
    console.log(`funding indisponível: ${(e as Error).message}`)
    return null
  }
}

async function fngByDate(): Promise<Map<string, number> | null> {
  try {
    const j = await fetchJson('https://api.alternative.me/fng/?limit=0')
    return new Map((j.data ?? []).map((d: { timestamp: string; value: string }) => [tsToDate(d.timestamp), +d.value]))
  } catch (e) {
    console.log(`F&G indisponível: ${(e as Error).message}`)
    return null
  }
}

async function main() {
  const [ohlc, cbbi, fng, funding] = await Promise.all([
    fetchBinanceDaily(),
    fetchJson('https://colintalkscrypto.com/cbbi/data/latest.json'),
    fngByDate(),
    fundingByDate(),
  ])
  const closes = ohlc.map((k) => k.close)
  const last = ohlc.length - 1
  const sigma = realizedVol(closes, last)
  const e50 = emaSeries(closes, 50)[last]
  const e200 = emaSeries(closes, 200)[last]
  if (!sigma || e50 == null || e200 == null) throw new Error('dados insuficientes para σ/EMAs')

  // Calendário mesclado: CBBI antes do início da Binance, Binance depois.
  const first = ohlc[0].date
  const cbbiPrice = [...seriesToMap(cbbi.Price)].map(([date, close]) => ({ date, close })).filter((d) => d.date < first)
  const merged = [...cbbiPrice.sort((a, b) => a.date.localeCompare(b.date)), ...ohlc.map((k) => ({ date: k.date, close: k.close }))]
  const dates = merged.map((d) => d.date)
  const mc = merged.map((d) => d.close)

  // Séries dos indicadores no calendário mesclado.
  const series: { key: string; group: 'ciclo' | 'curto'; s: Series }[] = []
  for (const { key, cbbi: name } of CBBI_INDICATORS)
    if (key !== 'pi_cycle' && cbbi[name]) series.push({ key, group: 'ciclo', s: align(dates, seriesToMap(cbbi[name])) })
  if (fng) series.push({ key: 'fng', group: 'ciclo', s: align(dates, fng) })
  // Mayer = close / SMA200.
  series.push({
    key: 'mayer',
    group: 'ciclo',
    s: mc.map((c, i) => (i < 199 ? null : c / (mc.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200))),
  })
  series.push({ key: 'rsi', group: 'curto', s: rsiSeries(mc) })
  series.push({ key: 'ema21', group: 'curto', s: emaDistSeries(mc, 21) })
  series.push({ key: 'ema50', group: 'curto', s: emaDistSeries(mc, 50) })
  series.push({ key: 'ret30', group: 'curto', s: returnSeries(mc, 30) })
  series.push({ key: 'vol20', group: 'curto', s: volSeries(mc) })
  series.push({ key: 'pctb', group: 'curto', s: pctBSeries(mc) })
  if (funding) series.push({ key: 'funding', group: 'curto', s: align(dates, funding) })

  const indicators: IndicatorWeight[] = []
  for (const { key, group, s } of series) {
    const w7 = horizonWeight(s, mc, 7)
    const w30 = horizonWeight(s, mc, 30)
    if (!w7 || !w30) {
      console.log(`indicador ${key} omitido: sem valor recente`)
      continue
    }
    indicators.push({ key, group, value: s.at(-1)!, w: { 7: w7, 30: w30 } })
  }

  const samples = touchSamples(ohlc)
  const snapshot: DecisionSnapshot = {
    date: ohlc[last].date,
    close: closes[last],
    sigma,
    regime: regimeOf(closes[last], e50, e200),
    model: buildModel(samples),
    calibration: { 7: calibrate(samples, 7), 30: calibrate(samples, 30) },
    levels: candidateLevels(ohlc),
    monthly: monthlyReturns(merged),
    indicators,
    piCycle: { ratio: piRatioSeries(mc).at(-1)! },
  }

  const { error } = await db.from('decision_snapshot').upsert({ id: 1, payload: snapshot, updated_at: new Date().toISOString() })
  if (error) throw new Error(`upsert decision_snapshot: ${error.message ?? JSON.stringify(error)}`)
  console.log(
    `OK decision ${snapshot.date}: regime=${snapshot.regime} sigma=${sigma.toFixed(4)} níveis=${snapshot.levels.length} ` +
      `mae7=${snapshot.calibration[7].mae.toFixed(3)} mae30=${snapshot.calibration[30].mae.toFixed(3)} meses=${snapshot.monthly.length} ` +
      `indicadores=${indicators.length} úteis7=${indicators.filter((i) => i.w[7].helps).length} úteis30=${indicators.filter((i) => i.w[30].helps).length}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
