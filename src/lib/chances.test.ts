import { test } from 'node:test'
import assert from 'node:assert/strict'
import { levelRows, fmtProb } from './chances.ts'
import { buildModel, touchSamples } from './touch.ts'
import type { DecisionSnapshot, Ohlc } from './types.ts'

const dayStr = (i: number) => new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)
const trendSeries = (n: number): Ohlc[] =>
  Array.from({ length: n }, (_, i) => {
    const close = 100 * Math.exp(0.001 * i + 0.02 * Math.sin(i))
    return { date: dayStr(i), open: close, high: close * 1.01, low: close * 0.99, close }
  })

const model = buildModel(touchSamples(trendSeries(400)))
const snap = (over: Partial<DecisionSnapshot>): DecisionSnapshot => ({
  date: '2026-10-18',
  close: 100,
  sigma: 0.03,
  regime: 'mixed',
  model,
  calibration: {} as DecisionSnapshot['calibration'],
  levels: [
    { price: 103, label: 'x' },
    { price: 96, label: 'y' },
  ],
  monthly: [],
  ...over,
})

test('levelRows: mais perto => chance maior, mesmo lado', () => {
  const r = levelRows(snap({ levels: [{ price: 101.5, label: 'a' }, { price: 108, label: 'b' }] }), 100)
  const a = r.find((x) => x.label === 'a')!
  const b = r.find((x) => x.label === 'b')!
  assert.ok(a.prob[7] > b.prob[7], `${a.prob[7]} > ${b.prob[7]}`)
  assert.ok(a.prob[30] >= a.prob[7])
})

test('levelRows: 30 dias nunca menor que 7 dias', () => {
  for (const x of levelRows(snap({}), 100)) assert.ok(x.prob[30] >= x.prob[7] - 1e-9)
})

test('levelRows: lado e n vêm junto', () => {
  const r = levelRows(snap({}), 100)
  assert.deepEqual(r.map((x) => x.side), ['above', 'below'])
  assert.ok(r.every((x) => x.n[7] > 0 && x.n[30] > 0))
})

test('fmtProb: bordas', () => {
  assert.equal(fmtProb(0.004), '<1%')
  assert.equal(fmtProb(0.995), '>99%')
  assert.equal(fmtProb(0.234), '23%')
})
