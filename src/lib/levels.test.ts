import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestLevels } from './levels.ts'

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
