import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyReturns, monthStats } from './seasonality.ts'

test('monthlyReturns: retorno fim-a-fim e mês parcial', () => {
  const d = [
    { date: '2024-01-31', close: 100 },
    { date: '2024-02-29', close: 110 },
    { date: '2024-03-15', close: 99 },
  ]
  const r = monthlyReturns(d, 2024)
  assert.equal(r.length, 2)
  assert.ok(Math.abs(r[0].ret - 0.1) < 1e-9)
  assert.deepEqual([r[0].year, r[0].month, r[0].partial], [2024, 2, false])
  assert.equal(r[1].partial, true)
})

test('monthlyReturns: filtra anos antes de fromYear', () => {
  const d = [
    { date: '2012-11-30', close: 10 },
    { date: '2012-12-31', close: 12 },
    { date: '2013-01-31', close: 15 },
  ]
  const r = monthlyReturns(d, 2013)
  assert.deepEqual(r.map((x) => [x.year, x.month]), [[2013, 1]])
  assert.ok(Math.abs(r[0].ret - 0.25) < 1e-9)
})

test('monthStats: ignora parcial, mediana robusta', () => {
  const rows = [0.1, -0.2, 4.49, 0.05].map((ret, i) => ({ year: 2013 + i, month: 11, ret, partial: false }))
  rows.push({ year: 2026, month: 11, ret: -0.5, partial: true })
  const s = monthStats(rows, 11)
  assert.equal(s.n, 4)
  assert.equal(s.positivePct, 0.75)
  assert.ok(Math.abs(s.median! - 0.075) < 1e-9)
})

test('monthStats: sem dados', () => {
  assert.deepEqual(monthStats([], 3), { positivePct: null, median: null, n: 0 })
})
