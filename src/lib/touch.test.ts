import { test } from 'node:test'
import assert from 'node:assert/strict'
import { regimeOf, survival, probAt, touchSamples, buildModel, curveFor } from './touch.ts'
import type { Ohlc } from './types.ts'

const dayStr = (i: number) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)

// Série com tendência leve + oscilação determinística.
const trendSeries = (n: number): Ohlc[] =>
  Array.from({ length: n }, (_, i) => {
    const close = 100 * Math.exp(0.001 * i + 0.02 * Math.sin(i))
    return { date: dayStr(i), open: close, high: close * 1.01, low: close * 0.99, close }
  })

test('regimeOf', () => {
  assert.equal(regimeOf(110, 100, 105), 'bull')
  assert.equal(regimeOf(90, 100, 105), 'bear')
  assert.equal(regimeOf(102, 100, 105), 'mixed')
})

test('survival: fração >= z na grade', () => {
  const c = survival([0, 0.5, 1, 2])
  assert.equal(c.p.length, 41)
  assert.equal(c.p[0], 1) // z=0: todas
  assert.equal(c.p[5], 0.75) // z=0.5: 0.5, 1, 2
  assert.equal(c.p[20], 0.25) // z=2
  assert.equal(c.p[40], 0)
  assert.equal(c.n, 4)
})

test('probAt: bordas e interpolação', () => {
  const c = survival([0, 0.5, 1, 2])
  assert.equal(probAt(c, -1), 1)
  assert.equal(probAt(c, 99), c.p[40])
  assert.ok(Math.abs(probAt(c, 0.55) - (c.p[5] + c.p[6]) / 2) < 1e-9)
})

test('touchSamples: excursão usa high/low do futuro e é null sem futuro', () => {
  const s = touchSamples(trendSeries(300))
  assert.ok(s.length > 0)
  assert.equal(s.at(-1)!.exc[7], null)
  const x = s.find((v) => v.exc[7])!
  assert.ok(x.exc[7]!.up >= 0 && x.exc[7]!.down >= 0)
  assert.ok(x.sigma > 0)
})

test('buildModel walk-forward ignora resultados ainda não conhecidos', () => {
  const s = touchSamples(trendSeries(400))
  const cut = s[150].i
  const m = buildModel(s, cut)
  assert.equal(m[30].up.all.n, s.filter((v) => v.exc[30] && v.i + 30 < cut).length)
})

test('curveFor cai para all com amostra pequena', () => {
  const m = buildModel(touchSamples(trendSeries(400)))
  m[7].up.bear = { p: m[7].up.bear.p, n: 10 }
  assert.equal(curveFor(m, 7, 'up', 'bear'), m[7].up.all)
})
