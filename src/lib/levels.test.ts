import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestLevels, emaSeries, candidateLevels, pickLevels } from './levels.ts'

// Datas consecutivas YYYY-MM-DD a partir de 2025-01-01.
const dayStr = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)

test('emaSeries: null até period, depois EMA', () => {
  const s = emaSeries([1, 2, 3, 4], 3)
  assert.deepEqual(s.slice(0, 2), [null, null])
  assert.equal(s[2], 2) // seed = SMA(1,2,3)
  assert.equal(s[3], 3) // 4*0.5 + 2*0.5
})

test('candidateLevels: rótulos e swing por high/low', () => {
  const ohlc = Array.from({ length: 250 }, (_, i) => ({
    date: dayStr(i), open: 100, high: 100 + (i === 245 ? 50 : 1), low: 99, close: 100,
  }))
  const c = candidateLevels(ohlc)
  assert.equal(c.find((x) => x.label === 'Máxima de 7d')!.price, 150)
  assert.equal(c.find((x) => x.label === 'Mínima de 14d')!.price, 99)
  assert.ok(c.some((x) => x.label === 'EMA 200'))
  assert.ok(c.some((x) => x.label === 'Banda superior (Bollinger)'))
  assert.ok(c.some((x) => x.label === 'Máxima do mês anterior'))
})

test('pickLevels: lado pelo preço, filtro 0,5%, dedup 1%, até 3 por lado', () => {
  const cands = [101, 100.3, 103, 103.5, 106, 110, 97, 95, 90, 85].map((p, i) => ({ price: p, label: 'L' + i }))
  const r = pickLevels(cands, 100)
  assert.ok(!r.some((x) => x.price === 100.3)) // <0,5%
  assert.ok(!(r.some((x) => x.price === 103) && r.some((x) => x.price === 103.5))) // dedup <1%
  assert.equal(r.filter((x) => x.side === 'above').length, 3)
  assert.equal(r.filter((x) => x.side === 'below').length, 3)
  assert.ok(r.every((x) => (x.side === 'above') === x.price > 100))
  assert.deepEqual(r.map((x) => x.price), [...r.map((x) => x.price)].sort((a, b) => b - a))
})

test('pickLevels: nível atravessado pelo preço ao vivo muda de lado', () => {
  const r = pickLevels([{ price: 105, label: 'x' }], 106)
  assert.equal(r[0].side, 'below')
})

// Série com ruído (senão desvio-padrão = 0 zera as bandas de Bollinger).
const series = Array.from({ length: 300 }, (_, i) => 10000 + i * 100 + (i % 5) * 80)
const current = series[series.length - 1] + 200 // logo acima do último fechamento

test('suporte abaixo, resistência acima do preço atual', () => {
  const s = suggestLevels(series, current)
  assert.ok(s.length > 0)
  for (const x of s) {
    if (x.kind === 'support') assert.ok(x.price < current, `suporte ${x.price} < ${current}`)
    else assert.ok(x.price > current, `resistência ${x.price} > ${current}`)
  }
})

test('direção casa com o tipo', () => {
  for (const x of suggestLevels(series, current)) {
    assert.equal(x.direction, x.kind === 'support' ? 'below' : 'above')
  }
})

test('usa métricas técnicas (EMA aparece), não números redondos', () => {
  const labels = suggestLevels(series, current).map((x) => x.label)
  assert.ok(labels.some((l) => l.includes('EMA')), `esperava EMA em ${labels.join(', ')}`)
  assert.ok(!labels.some((l) => l.includes('redondo')))
})

test('no máximo 3 por lado', () => {
  const s = suggestLevels(series, current)
  assert.ok(s.filter((x) => x.kind === 'support').length <= 3)
  assert.ok(s.filter((x) => x.kind === 'resistance').length <= 3)
})

test('histórico vazio ou preço inválido => sem sugestões', () => {
  assert.deepEqual(suggestLevels([], 30000), [])
  assert.deepEqual(suggestLevels([1, 2, 3], NaN), [])
})
