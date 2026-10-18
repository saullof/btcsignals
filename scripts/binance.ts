// Candles diários BTCUSDT da Binance desde 2017-08-17 (início do par), paginados
// pelo startTime. Sem startTime a API devolve só os ~1000 mais recentes.
import type { Ohlc } from '../src/lib/types.ts'

const DAY = 86_400_000

export async function fetchBinanceDaily(): Promise<Ohlc[]> {
  const out: Ohlc[] = []
  let start = Date.UTC(2017, 7, 17)
  for (let page = 0; page < 30; page++) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime=${start}`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${url} -> ${r.status}`)
    const k: any[] = await r.json()
    for (const c of k)
      out.push({ date: new Date(c[0]).toISOString().slice(0, 10), open: +c[1], high: +c[2], low: +c[3], close: +c[4] })
    if (k.length < 1000) break
    start = Number(k[k.length - 1][0]) + DAY
  }
  return out
}
