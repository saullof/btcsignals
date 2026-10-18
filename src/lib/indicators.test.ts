import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rsiSeries, emaDistSeries, returnSeries, volSeries, pctBSeries, piRatioSeries } from './indicators.ts'

const near = (a: number | null, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`)
const up = Array.from({ length: 40 }, (_, i) => 100 + i)
const down = Array.from({ length: 40 }, (_, i) => 200 - i)
// Alterna 99/101 terminando em 101 (endHigh) ou 99.
const alt = (n: number, endHigh: boolean) =>
  Array.from({ length: n }, (_, i) => ((n - 1 - i) % 2 === 0) === endHigh ? 101 : 99)

test('rsiSeries: só subindo = 100, só caindo = 0, null antes do período', () => {
  const r = rsiSeries(up)
  assert.equal(r[13], null)
  near(r[14], 100)
  near(r.at(-1)!, 100)
  near(rsiSeries(down).at(-1)!, 0)
})

test('emaDistSeries: série constante = 0', () => {
  const s = emaDistSeries(Array(30).fill(50), 21)
  assert.equal(s[19], null)
  near(s.at(-1)!, 0)
})

test('returnSeries: retorno de n dias', () => {
  const r = returnSeries([100, 110, 121], 1)
  assert.equal(r[0], null)
  near(r[1], 0.1)
  near(r[2], 0.1)
})

test('pctBSeries: posição dentro das bandas de Bollinger', () => {
  const hi = alt(20, true)
  assert.equal(hi.at(-1), 101)
  near(pctBSeries(hi).at(-1)!, 0.75) // média 100, σ 1: (101 − 98) / 4
  const lo = alt(20, false)
  assert.equal(lo.at(-1), 99)
  near(pctBSeries(lo).at(-1)!, 0.25)
})

test('volSeries: null no início, comprimento igual', () => {
  const v = volSeries(up)
  assert.equal(v.length, up.length)
  assert.equal(v[0], null)
  assert.ok(v.at(-1)! >= 0)
})

test('piRatioSeries: série constante = 0,5', () => {
  const s = piRatioSeries(Array(400).fill(10))
  assert.equal(s[348], null)
  near(s.at(-1)!, 0.5)
})
