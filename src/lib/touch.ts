// Chance de o preço TOCAR um nível em h dias (spec 6.3). Empírico: para cada dia
// do histórico, mede a maior excursão para cima (high) e para baixo (low) nos h
// dias seguintes, em unidades de volatilidade (σ diária · √h). A curva de
// sobrevivência dessas excursões, por regime de tendência, dá P(tocar | z).
// Pura e testável; usada pelo worker (montar) e pelo app (aplicar ao preço vivo).
import { emaSeries } from './levels.ts'
import type { Ohlc } from './types'

export const Z_STEP = 0.1
export const Z_MAX = 4
export const HORIZONS = [7, 30] as const
export const MIN_REGIME_N = 200
export const VOL_WINDOW = 20

const GRID = Array.from({ length: Math.round(Z_MAX / Z_STEP) + 1 }, (_, k) => Math.round(k * Z_STEP * 1e6) / 1e6)

export type Horizon = (typeof HORIZONS)[number]
export type Regime = 'bull' | 'bear' | 'mixed'
export type TouchCurve = { p: number[]; n: number }
export type TouchSample = {
  i: number
  regime: Regime
  sigma: number
  exc: Record<Horizon, { up: number; down: number } | null>
}
export type TouchModel = Record<Horizon, Record<'up' | 'down', Record<Regime | 'all', TouchCurve>>>

// Tendência pelas médias de 50 e 200 dias.
export function regimeOf(close: number, ema50: number, ema200: number): Regime {
  if (close > ema50 && close > ema200) return 'bull'
  if (close < ema50 && close < ema200) return 'bear'
  return 'mixed'
}

// Desvio-padrão amostral dos log-retornos diários que terminam em `end`.
export function realizedVol(closes: number[], end: number, window = VOL_WINDOW): number | null {
  if (end - window < 0) return null
  const r: number[] = []
  for (let j = end - window + 1; j <= end; j++) r.push(Math.log(closes[j] / closes[j - 1]))
  const m = r.reduce((a, b) => a + b, 0) / r.length
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1))
}

// Uma amostra por dia com EMA200 e vol disponíveis. Regime e σ usam só dados até
// o dia; a excursão usa os h dias seguintes (null se ainda não existem).
export function touchSamples(ohlc: Ohlc[]): TouchSample[] {
  const closes = ohlc.map((k) => k.close)
  const e50 = emaSeries(closes, 50)
  const e200 = emaSeries(closes, 200)
  const out: TouchSample[] = []
  for (let i = 0; i < ohlc.length; i++) {
    const sigma = realizedVol(closes, i)
    if (e200[i] == null || e50[i] == null || !sigma) continue
    const exc = {} as TouchSample['exc']
    for (const h of HORIZONS) {
      if (i + h >= ohlc.length) {
        exc[h] = null
        continue
      }
      const fut = ohlc.slice(i + 1, i + h + 1)
      const scale = sigma * Math.sqrt(h)
      exc[h] = {
        up: Math.max(0, Math.log(Math.max(...fut.map((k) => k.high)) / closes[i]) / scale),
        down: Math.max(0, Math.log(closes[i] / Math.min(...fut.map((k) => k.low))) / scale),
      }
    }
    out.push({ i, regime: regimeOf(closes[i], e50[i]!, e200[i]!), sigma, exc })
  }
  return out
}

// p[k] = fração dos valores >= z_k.
export function survival(values: number[]): TouchCurve {
  const n = values.length
  return { p: GRID.map((z) => (n ? values.filter((v) => v >= z).length / n : 0)), n }
}

// Interpolação linear na grade. z<=0 → 1 (já está no nível); além da grade → último ponto.
export function probAt(curve: TouchCurve, z: number): number {
  if (z <= 0) return 1
  if (z >= Z_MAX) return curve.p[curve.p.length - 1]
  const x = z / Z_STEP
  const k = Math.floor(x)
  return curve.p[k] + (curve.p[k + 1] - curve.p[k]) * (x - k)
}

// Curvas por prazo × direção × regime (+ 'all'), só com resultados já conhecidos
// antes de `knownBefore` (índice de dia) — base da avaliação walk-forward.
export function buildModel(samples: TouchSample[], knownBefore = Infinity): TouchModel {
  const model = {} as TouchModel
  for (const h of HORIZONS) {
    const known = samples.filter((s) => s.exc[h] && s.i + h < knownBefore)
    model[h] = { up: {}, down: {} } as TouchModel[Horizon]
    for (const dir of ['up', 'down'] as const)
      for (const r of ['bull', 'bear', 'mixed', 'all'] as const)
        model[h][dir][r] = survival(known.filter((s) => r === 'all' || s.regime === r).map((s) => s.exc[h]![dir]))
  }
  return model
}

// Curva do regime atual, ou a geral se o regime tem poucas amostras.
export function curveFor(model: TouchModel, h: Horizon, dir: 'up' | 'down', regime: Regime): TouchCurve {
  const c = model[h][dir][regime]
  return c.n >= MIN_REGIME_N ? c : model[h][dir].all
}
