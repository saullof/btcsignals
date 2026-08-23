// Núcleo puro de sinal + base-rates (§6/§7 do guia).
// Sem I/O, sem dependências — mesma lógica usada pela ingestão e testável isolada.
import type { Signal } from './types'

export type Direction =
  | 'low_cheap' // baixo = barato (mvrv_z, puell, mayer, supply_in_profit)
  | 'high_top' // alto = topo (cbbi, cycle_extreme, macro_risk) — valor já 0..1 ou normalizado
  | 'contrarian' // Fear & Greed: medo (baixo) = barato

// Fração do histórico <= value (0..1). Auto-recalibra por ciclo: o limiar é o
// percentil, não um número fixo que envelhece.
export function percentile(history: number[], value: number): number {
  if (history.length === 0) return 0.5
  const below = history.reduce((acc, h) => acc + (h <= value ? 1 : 0), 0)
  return below / history.length
}

// cheapness 0..1 (1 = compra máxima). `normalizedHint` é usado só p/ high_top
// quando o valor já vem numa escala conhecida (ex.: cycle_extreme 0..10).
export function cheapnessFor(
  direction: Direction,
  rawValue: number,
  history: number[],
  scaleMax?: number,
): number {
  switch (direction) {
    case 'low_cheap':
      return clamp01(1 - percentile(history, rawValue))
    case 'high_top': {
      // se soubermos a escala (0..scaleMax), normaliza direto; senão percentil.
      const norm = scaleMax != null ? clamp01(rawValue / scaleMax) : percentile(history, rawValue)
      return clamp01(1 - norm)
    }
    case 'contrarian':
      // F&G 0..100; medo (baixo) => cheapness alta.
      return clamp01(1 - rawValue / 100)
  }
}

// Sinal por bandas de cheapness. Simétrico e consistente entre indicadores;
// as bandas correspondem a percentil ≤15 / ≥85 do guia.
export function signalFromCheapness(cheapness: number, buyBand = 0.85, sellBand = 0.15): Signal {
  if (cheapness >= buyBand) return 'buy'
  if (cheapness <= sellBand) return 'sell'
  return 'neutral'
}

// Composto = média das cheapness disponíveis no dia (0..1).
export function composite(cheapnesses: number[]): number | null {
  if (cheapnesses.length === 0) return null
  return cheapnesses.reduce((a, b) => a + b, 0) / cheapnesses.length
}

export function votes(signals: Signal[]) {
  return {
    votes_buy: signals.filter((s) => s === 'buy').length,
    votes_sell: signals.filter((s) => s === 'sell').length,
    votes_neutral: signals.filter((s) => s === 'neutral').length,
  }
}

// ─── Base-rates (§7) ─────────────────────────────────────────────────────────
export type Sample = { composite: number; futureReturn: number }
export type BaseRate = { probUp: number | null; median: number | null; n: number }

// Decil do composto: 0.0–0.1, …, 0.9–1.0 (1.0 cai no último decil).
export function decile(c: number): number {
  return Math.min(9, Math.floor(clamp01(c) * 10))
}

// Frequência histórica de retorno > 0 na MESMA faixa (decil) do composto atual.
export function baseRateForBucket(samples: Sample[], currentComposite: number): BaseRate {
  const d = decile(currentComposite)
  const inBucket = samples.filter((s) => decile(s.composite) === d)
  const n = inBucket.length
  if (n === 0) return { probUp: null, median: null, n: 0 }
  const up = inBucket.filter((s) => s.futureReturn > 0).length
  return { probUp: up / n, median: medianOf(inBucket.map((s) => s.futureReturn)), n }
}

// Retornos futuros a partir de uma série de closes ordenada por data crescente.
// close[i+h]/close[i] - 1. Ignora dias sem futuro suficiente.
export function futureReturns(closes: number[], horizon: number): (number | null)[] {
  return closes.map((c, i) => {
    const f = closes[i + horizon]
    return f == null ? null : f / c - 1
  })
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
