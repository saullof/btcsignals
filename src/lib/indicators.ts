// Séries de indicadores de curto prazo (e a razão do Pi Cycle), alinhadas a
// `closes`: null onde ainda não há dados suficientes. Puras e testáveis.
import { emaSeries } from './levels.ts'
import { realizedVol } from './touch.ts'

type S = (number | null)[]

const sma = (c: number[], end: number, n: number) => {
  let s = 0
  for (let j = end - n + 1; j <= end; j++) s += c[j]
  return s / n
}

// RSI de Wilder.
export function rsiSeries(closes: number[], period = 14): S {
  const out: S = closes.map(() => null)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  const rsi = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
  out[period] = rsi()
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = rsi()
  }
  return out
}

// close / EMA − 1.
export function emaDistSeries(closes: number[], period: number): S {
  return emaSeries(closes, period).map((e, i) => (e == null ? null : closes[i] / e - 1))
}

// close / close[i−n] − 1.
export function returnSeries(closes: number[], n: number): S {
  return closes.map((c, i) => (i < n ? null : c / closes[i - n] - 1))
}

export function volSeries(closes: number[], window = 20): S {
  return closes.map((_, i) => realizedVol(closes, i, window))
}

// %B de Bollinger: 0 = banda inferior, 1 = superior (σ populacional).
export function pctBSeries(closes: number[], period = 20): S {
  return closes.map((c, i) => {
    if (i < period - 1) return null
    const m = sma(closes, i, period)
    let v = 0
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2
    const sd = Math.sqrt(v / period)
    return sd === 0 ? 0.5 : (c - (m - 2 * sd)) / (4 * sd)
  })
}

// Pi Cycle Top: SMA111 / (2·SMA350). 1 = sinal de topo.
export function piRatioSeries(closes: number[]): S {
  return closes.map((_, i) => (i < 349 ? null : sma(closes, i, 111) / (2 * sma(closes, i, 350))))
}
