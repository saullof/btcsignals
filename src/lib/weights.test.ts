import { test } from 'node:test'
import assert from 'node:assert/strict'
import { terciles, quintileEdges, binOf, condDist, brier, horizonWeight } from './weights.ts'

// PRNG determinístico (mulberry32) + normal (Box-Muller).
const rng = (seed: number) => {
  let a = seed
  const u = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u())
}
const walk = (n: number, seed: number) => {
  const g = rng(seed)
  let c = 100
  return Array.from({ length: n }, () => (c *= Math.exp(0.03 * g())))
}

test('terciles: quantis 1/3 e 2/3 com interpolação linear', () => {
  const [a, b] = terciles([1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.ok(Math.abs(a - (1 + 8 / 3)) < 1e-9 && Math.abs(b - (1 + 16 / 3)) < 1e-9)
})

test('quintileEdges e binOf: 4 cortes, faixas 0..4, empate vai pra faixa de baixo', () => {
  const e = quintileEdges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  assert.equal(e.length, 4)
  assert.equal(binOf(-100, e), 0)
  assert.equal(binOf(100, e), 4)
  assert.equal(binOf(e[1], e), 1)
})

test('condDist: Laplace nunca zera, cada faixa soma 1', () => {
  const d = condDist([1, 1, 1], [2, 2, 2], [0, 5, 10, 15])
  for (const p of d) {
    assert.ok(p.every((x) => x > 0))
    assert.ok(Math.abs(p[0] + p[1] + p[2] - 1) < 1e-9)
  }
})

test('brier: previsão perfeita = 0', () => {
  assert.equal(brier([0, 0, 1], 2), 0)
  assert.ok(Math.abs(brier([1 / 3, 1 / 3, 1 / 3], 0) - 2 / 3) < 1e-9)
})

test('horizonWeight: indicador que antecipa o retorno passa no teste', () => {
  const closes = walk(3000, 7)
  const g = rng(99)
  const h = 7
  const series = closes.map((c, i) => (i + h < closes.length ? Math.sign(closes[i + h] / c - 1) + 0.5 * g() : g()))
  const w = horizonWeight(series, closes, h)!
  assert.equal(w.helps, true, w.reason)
  assert.ok(w.skill > 0.01)
  assert.ok(Math.abs(w.dist[0] + w.dist[1] + w.dist[2] - 1) < 1e-9)
  assert.ok(w.thresholds[0] < 0 && w.thresholds[1] > 0)
})

test('horizonWeight: ruído puro não passa', () => {
  const closes = walk(3000, 11)
  const g = rng(5)
  const w = horizonWeight(closes.map(() => g()), closes, 30)!
  assert.equal(w.helps, false)
  assert.equal(w.reason, 'não melhorou a previsão nos testes')
})

test('horizonWeight: histórico curto e valor de hoje ausente', () => {
  const closes = walk(3000, 3)
  const g = rng(1)
  const short = closes.map((_, i) => (i < 2500 ? null : g()))
  assert.equal(horizonWeight(short, closes, 7)!.reason, 'histórico curto')
  const noToday = closes.map((_, i) => (i === closes.length - 1 ? null : g()))
  assert.equal(horizonWeight(noToday, closes, 7), null)
})
