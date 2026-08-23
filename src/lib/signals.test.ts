import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  percentile,
  cheapnessFor,
  signalFromCheapness,
  composite,
  votes,
  decile,
  baseRateForBucket,
  futureReturns,
} from './signals.ts'

test('percentile: fração <= value', () => {
  assert.equal(percentile([1, 2, 3, 4], 2), 0.5)
  assert.equal(percentile([], 5), 0.5) // sem histórico = neutro
  assert.equal(percentile([10, 20, 30], 30), 1)
})

test('cheapnessFor low_cheap: valor baixo no histórico => cheap alto', () => {
  const hist = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  assert.ok(cheapnessFor('low_cheap', 1, hist) > 0.85) // fundo = compra
  assert.ok(cheapnessFor('low_cheap', 10, hist) < 0.15) // topo = venda
})

test('cheapnessFor high_top com escala conhecida (cycle_extreme 0..10)', () => {
  assert.equal(cheapnessFor('high_top', 0, [], 10), 1) // extremo baixo = compra
  assert.equal(cheapnessFor('high_top', 10, [], 10), 0) // extremo alto = venda
})

test('cheapnessFor contrarian (F&G): medo => cheap alto', () => {
  assert.equal(cheapnessFor('contrarian', 0, []), 1) // medo extremo
  assert.equal(cheapnessFor('contrarian', 100, []), 0) // ganância extrema
})

test('signalFromCheapness: bandas 0.85/0.15', () => {
  assert.equal(signalFromCheapness(0.9), 'buy')
  assert.equal(signalFromCheapness(0.1), 'sell')
  assert.equal(signalFromCheapness(0.5), 'neutral')
})

test('composite e votos', () => {
  assert.ok(Math.abs(composite([0.2, 0.4, 0.6])! - 0.4) < 1e-9)
  assert.equal(composite([]), null)
  assert.deepEqual(votes(['buy', 'buy', 'sell', 'neutral']), {
    votes_buy: 2,
    votes_sell: 1,
    votes_neutral: 1,
  })
})

test('decile: 1.0 cai no último decil', () => {
  assert.equal(decile(0.05), 0)
  assert.equal(decile(0.95), 9)
  assert.equal(decile(1.0), 9)
})

test('futureReturns: ignora dias sem futuro', () => {
  const closes = [100, 110, 121]
  const r = futureReturns(closes, 1)
  assert.ok(Math.abs(r[0]! - 0.1) < 1e-9)
  assert.ok(Math.abs(r[1]! - 0.1) < 1e-9)
  assert.equal(r[2], null)
})

test('baseRateForBucket: prob e N da faixa atual', () => {
  const samples = [
    { composite: 0.05, futureReturn: 0.2 }, // decil 0
    { composite: 0.02, futureReturn: -0.1 }, // decil 0
    { composite: 0.09, futureReturn: 0.3 }, // decil 0
    { composite: 0.55, futureReturn: 0.1 }, // decil 5 (fora)
  ]
  const r = baseRateForBucket(samples, 0.03) // decil 0
  assert.equal(r.n, 3)
  assert.equal(r.probUp, 2 / 3)
  assert.equal(r.median, 0.2)
  // faixa sem amostra => null honesto
  assert.deepEqual(baseRateForBucket(samples, 0.95), { probUp: null, median: null, n: 0 })
})
