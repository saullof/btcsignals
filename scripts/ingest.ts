// Backfill + ingest (etapas 3/4/5) num script só. Reusa a lógica pura testada
// de ../src/lib/signals.ts. Roda no Node 24 (strip-types):
//   node --env-file=supabase/.env scripts/ingest.ts
//
// Fontes 100% sem chave: CBBI (métricas normalizadas + Price desde 2011),
// Fear&Greed, Binance (preço recente/preciso). BGeometrics fica plugável depois.
import { createClient } from '@supabase/supabase-js'
import {
  percentile,
  signalFromCheapness,
  composite as compositeOf,
  votes as votesOf,
  decile,
  futureReturns,
} from '../src/lib/signals.ts'
import type { Signal } from '../src/lib/types.ts'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltam SUPABASE_URL / SERVICE_ROLE_KEY (use --env-file=supabase/.env)')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Indicadores vindos do CBBI (já 0..1, alto = topo => cheapness = 1 - valor).
const CBBI_INDICATORS: { key: string; cbbi: string }[] = [
  { key: 'mvrv', cbbi: 'MVRV' },
  { key: 'puell', cbbi: 'Puell' },
  { key: 'rhodl', cbbi: 'RHODL' },
  { key: 'rupl', cbbi: 'RUPL' },
  { key: 'reserve_risk', cbbi: 'ReserveRisk' },
  { key: 'pi_cycle', cbbi: 'PiCycle' },
  { key: '2y_ma', cbbi: '2YMA' },
  { key: 'cbbi', cbbi: 'Confidence' },
]

type DayInd = { key: string; raw: number; cheap: number; signal: Signal; source: string }

const tsToDate = (unixSec: string | number): string =>
  new Date(Number(unixSec) * 1000).toISOString().slice(0, 10)

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

// Série CBBI {unixSec: valor} -> Map<dateStr, número>.
function seriesToMap(series: Record<string, number>): Map<string, number> {
  const m = new Map<string, number>()
  for (const [ts, v] of Object.entries(series)) {
    if (v != null && Number.isFinite(v)) m.set(tsToDate(ts), v)
  }
  return m
}

// Klines diários da Binance, paginado desde 2017 até hoje.
async function fetchBinanceCloses(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  let start = 0
  for (let guard = 0; guard < 30; guard++) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000${start ? `&startTime=${start}` : ''}`
    const k: any[] = await fetchJson(url)
    if (!k.length) break
    for (const c of k) out.set(tsToDate(Number(c[0]) / 1000), Number(c[4]))
    const lastOpen = Number(k[k.length - 1][0])
    if (k.length < 1000) break
    start = lastOpen + 86_400_000 // próximo dia
  }
  return out
}

async function chunkUpsert(table: string, rows: any[], conflict: string, size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size)
    const { error } = await db.from(table).upsert(slice, { onConflict: conflict })
    if (error) throw new Error(`upsert ${table}: ${error.message}`)
  }
}

async function main() {
  console.log('Buscando fontes…')
  const [cbbi, fngRaw, binance] = await Promise.all([
    fetchJson('https://colintalkscrypto.com/cbbi/data/latest.json'),
    fetchJson('https://api.alternative.me/fng/?limit=0'),
    fetchBinanceCloses(),
  ])

  // ── Preço p/ a tabela (UI + Mayer): Binance, recente e preciso.
  const priceRows = [...binance.entries()].map(([date, close]) => ({ date, close }))
  console.log(`price_history: ${priceRows.length} dias (Binance)`)

  // ── Mayer = preço / SMA200. Percentil sobre todo o histórico Binance.
  const binDates = [...binance.keys()].sort()
  const binCloses = binDates.map((d) => binance.get(d)!)
  const mayerByDate = new Map<string, number>()
  for (let i = 199; i < binCloses.length; i++) {
    const sma = binCloses.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200
    mayerByDate.set(binDates[i], binCloses[i] / sma)
  }
  const mayerVals = [...mayerByDate.values()]

  // ── F&G histórico: Map<dateStr, 0..100>.
  const fngByDate = new Map<string, number>()
  for (const d of fngRaw.data ?? []) fngByDate.set(tsToDate(d.timestamp), Number(d.value))

  // ── CBBI: Price (base p/ retornos, 2011+) + cheapness por métrica.
  const cbbiPrice = seriesToMap(cbbi.Price)
  const cbbiCheap = new Map<string, Map<string, number>>() // indKey -> (date -> cheap)
  for (const { key, cbbi: name } of CBBI_INDICATORS) {
    const src = cbbi[name]
    if (!src) continue
    const m = new Map<string, number>()
    for (const [date, v] of seriesToMap(src)) m.set(date, 1 - v) // alto=topo
    cbbiCheap.set(key, m)
  }

  // ── Por dia (base = datas do CBBI Price, cobre 2011+): indicadores + composto.
  const dates = [...cbbiPrice.keys()].sort()
  const compByDate: number[] = []
  const indsByDate = new Map<string, DayInd[]>()
  for (const date of dates) {
    const inds: DayInd[] = []
    for (const { key } of CBBI_INDICATORS) {
      const c = cbbiCheap.get(key)?.get(date)
      if (c != null) inds.push({ key, raw: 1 - c, cheap: c, signal: signalFromCheapness(c), source: 'cbbi' })
    }
    const fv = fngByDate.get(date)
    if (fv != null) {
      const c = 1 - fv / 100
      inds.push({ key: 'fng', raw: fv, cheap: c, signal: signalFromCheapness(c), source: 'alternative.me' })
    }
    const mv = mayerByDate.get(date)
    if (mv != null) {
      const c = 1 - percentile(mayerVals, mv)
      inds.push({ key: 'mayer', raw: mv, cheap: c, signal: signalFromCheapness(c), source: 'binance' })
    }
    indsByDate.set(date, inds)
    compByDate.push(compositeOf(inds.map((i) => i.cheap)) ?? 0)
  }

  // ── Base-rates (§7): retornos futuros do CBBI Price, por decil do composto.
  const closes = dates.map((d) => cbbiPrice.get(d)!)
  const horizons = [30, 90, 180] as const
  // Estatística por decil e horizonte: {probUp, n}. Calcula 1x, evita O(n²).
  const bucketStats: Record<number, { probUp: number | null; n: number }[]> = {}
  for (const h of horizons) {
    const rets = futureReturns(closes, h)
    const perDecile = Array.from({ length: 10 }, () => ({ up: 0, n: 0 }))
    for (let i = 0; i < dates.length; i++) {
      if (rets[i] == null) continue
      const b = perDecile[decile(compByDate[i])]
      b.n++
      if (rets[i]! > 0) b.up++
    }
    bucketStats[h] = perDecile.map((b) => ({ probUp: b.n ? b.up / b.n : null, n: b.n }))
  }

  // ── Linhas do composite_snapshots (histórico inteiro).
  const compRows = dates.map((date, i) => {
    const c = compByDate[i]
    const d = decile(c)
    const v = votesOf(indsByDate.get(date)!.map((x) => x.signal))
    return {
      date,
      composite: c,
      ...v,
      prob_up_30d: bucketStats[30][d].probUp,
      prob_up_90d: bucketStats[90][d].probUp,
      prob_up_180d: bucketStats[180][d].probUp,
      sample_30d: bucketStats[30][d].n,
      sample_90d: bucketStats[90][d].n,
      sample_180d: bucketStats[180][d].n,
    }
  })

  // ── Indicadores do dia mais recente (grade da UI).
  const latest = dates[dates.length - 1]
  const latestInds = indsByDate.get(latest)!
  const indRows = latestInds.map((x) => ({
    date: latest,
    indicator_key: x.key,
    raw_value: x.raw,
    cheapness: x.cheap,
    signal: x.signal,
    source: x.source,
  }))

  // ── Viradas de estado: compara o dia mais recente com o anterior.
  const prev = dates[dates.length - 2]
  const prevSig = new Map(indsByDate.get(prev)!.map((x) => [x.key, x.signal]))
  const events: any[] = []
  for (const x of latestInds) {
    const old = prevSig.get(x.key)
    if (old && old !== x.signal)
      events.push({ date: latest, scope: 'indicator', key: x.key, old_signal: old, new_signal: x.signal })
  }
  const compSigNow = signalFromCheapness(compByDate[compByDate.length - 1])
  const compSigPrev = signalFromCheapness(compByDate[compByDate.length - 2])
  if (compSigNow !== compSigPrev)
    events.push({ date: latest, scope: 'composite', key: 'composite', old_signal: compSigPrev, new_signal: compSigNow })

  // ── Gravar tudo.
  console.log('Gravando…')
  await chunkUpsert('price_history', priceRows, 'date')
  await chunkUpsert('composite_snapshots', compRows, 'date')
  await chunkUpsert('indicator_snapshots', indRows, 'date,indicator_key')
  if (events.length) {
    const { error } = await db.from('signal_events').insert(events)
    if (error) throw new Error(`insert events: ${error.message}`)
  }

  const cLatest = compByDate[compByDate.length - 1]
  console.log(
    `OK. Último dia ${latest}: composto=${cLatest.toFixed(3)} sinal=${compSigNow} ` +
      `indicadores=${latestInds.length} viradas=${events.length}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
