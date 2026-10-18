// Sugestões de nível pra alarme — CURTO PRAZO (semanal/quinzenal), baseadas em
// métricas técnicas sobre os fechamentos diários. O painel cobre longo/médio
// prazo; aqui o foco é acionável agora: EMAs curtas, Bollinger 20 e swings de
// 7/14 dias. Pura e testável.

export type Suggestion = {
  kind: 'support' | 'resistance'
  price: number
  label: string
  direction: 'above' | 'below' // como o alarme deve disparar
}

import type { Ohlc } from './types'

export type LevelCandidate = { price: number; label: string }
export type PickedLevel = LevelCandidate & { side: 'above' | 'below' }

// EMA dia a dia: null até ter `period` pontos; seed = SMA dos primeiros `period`.
export function emaSeries(vals: number[], period: number): (number | null)[] {
  const out: (number | null)[] = vals.map(() => null)
  if (vals.length < period) return out
  const k = 2 / (period + 1)
  let e = vals.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = e
  for (let i = period; i < vals.length; i++) out[i] = e = vals[i] * k + e * (1 - k)
  return out
}

// EMA do último ponto.
function ema(vals: number[], period: number): number | null {
  return emaSeries(vals, period).at(-1) ?? null
}

// Níveis candidatos pra tabela de chances (spec 6.2). Swings por high/low dos
// últimos N candles (incluindo hoje), EMAs e Bollinger sobre o fechamento,
// máxima/mínima do mês civil anterior ao último candle.
export function candidateLevels(ohlc: Ohlc[]): LevelCandidate[] {
  const out: LevelCandidate[] = []
  for (const n of [7, 14, 30, 90]) {
    if (ohlc.length < n) continue
    const w = ohlc.slice(-n)
    out.push({ price: Math.max(...w.map((k) => k.high)), label: `Máxima de ${n}d` })
    out.push({ price: Math.min(...w.map((k) => k.low)), label: `Mínima de ${n}d` })
  }
  const closes = ohlc.map((k) => k.close)
  for (const p of [21, 50, 200]) {
    const e = ema(closes, p)
    if (e != null) out.push({ price: e, label: `EMA ${p}` })
  }
  if (closes.length >= 20) {
    const w = closes.slice(-20)
    const m = w.reduce((a, b) => a + b, 0) / 20
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20)
    out.push({ price: m + 2 * sd, label: 'Banda superior (Bollinger)' })
    out.push({ price: m - 2 * sd, label: 'Banda inferior (Bollinger)' })
  }
  const last = ohlc.at(-1)
  if (last) {
    const d = new Date(last.date + 'T00:00:00Z')
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
    const pm = ohlc.filter((k) => k.date.startsWith(prev))
    if (pm.length) {
      out.push({ price: Math.max(...pm.map((k) => k.high)), label: 'Máxima do mês anterior' })
      out.push({ price: Math.min(...pm.map((k) => k.low)), label: 'Mínima do mês anterior' })
    }
  }
  return out
}

// Escolhe pelo preço ao vivo: lado pelo preço, descarta <0,5% do preço,
// dedup <1% (mais perto vence), até `perSide` por lado. Maior preço primeiro.
export function pickLevels(cands: LevelCandidate[], price: number, perSide = 3): PickedLevel[] {
  const sorted = cands
    .filter((c) => c.price > 0 && Math.abs(c.price - price) / price >= 0.005)
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
  const kept: PickedLevel[] = []
  for (const c of sorted) {
    if (kept.some((k) => Math.abs(k.price - c.price) / c.price < 0.01)) continue
    const side = c.price > price ? 'above' : 'below'
    if (kept.filter((k) => k.side === side).length >= perSide) continue
    kept.push({ ...c, side })
  }
  return kept.sort((a, b) => b.price - a.price)
}

// closes: fechamentos diários em ordem crescente (antigo → recente). current: preço vivo.
export function suggestLevels(closes: number[], current: number): Suggestion[] {
  if (!closes.length || !Number.isFinite(current) || current <= 0) return []

  const cand: { price: number; label: string }[] = []
  const e9 = ema(closes, 9)
  if (e9) cand.push({ price: e9, label: 'EMA 9' })
  const e21 = ema(closes, 21)
  if (e21) cand.push({ price: e21, label: 'EMA 21' })

  // Bollinger 20 (SMA20 ± 2σ): bandas de curto prazo.
  if (closes.length >= 20) {
    const w = closes.slice(-20)
    const m = w.reduce((a, b) => a + b, 0) / 20
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20)
    cand.push({ price: m - 2 * sd, label: 'Banda inferior (Bollinger)' })
    cand.push({ price: m + 2 * sd, label: 'Banda superior (Bollinger)' })
  }

  // Swings recentes: 7d (semanal) e 14d (quinzenal).
  const sw = (n: number, lo: boolean) => {
    const w = closes.slice(-n)
    return w.length ? (lo ? Math.min(...w) : Math.max(...w)) : null
  }
  for (const [n, lo, label] of [[7, true, 'Mínima 7d'], [7, false, 'Máxima 7d'], [14, true, 'Mínima 14d'], [14, false, 'Máxima 14d']] as const) {
    const v = sw(n, lo)
    if (v != null) cand.push({ price: v, label })
  }

  // Classifica pelo lado (abaixo=suporte/compra, acima=resistência/venda) e
  // descarta o que está praticamente no preço (<0,2%).
  const sug: Suggestion[] = cand
    .filter((c) => c.price > 0 && Math.abs(c.price - current) / current > 0.002)
    .map((c): Suggestion => ({
      price: c.price,
      label: c.label,
      kind: c.price < current ? 'support' : 'resistance',
      direction: c.price < current ? 'below' : 'above',
    }))
    .sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current)) // mais perto primeiro

  // Dedup (<1%) e no máx. 3 por lado.
  const dedup: Suggestion[] = []
  for (const s of sug) if (!dedup.some((o) => Math.abs(o.price - s.price) / s.price < 0.01)) dedup.push(s)
  const support = dedup.filter((s) => s.kind === 'support').slice(0, 3)
  const resistance = dedup.filter((s) => s.kind === 'resistance').slice(0, 3)
  return [...support, ...resistance].sort((a, b) => a.price - b.price)
}
