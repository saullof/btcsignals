import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestLevels } from './levels.ts'

const rising = Array.from({ length: 300 }, (_, i) => 10000 + i * 100)

test('suporte abaixo, resistência acima do preço atual', () => {
  const s = suggestLevels(rising, 30000)
  assert.ok(s.length > 0)
  for (const x of s) {
    if (x.kind === 'support') assert.ok(x.price < 30000, `suporte ${x.price} < 30000`)
    else assert.ok(x.price > 30000, `resistência ${x.price} > 30000`)
  }
})

test('direção casa com o tipo', () => {
  for (const x of suggestLevels(rising, 30000)) {
    assert.equal(x.direction, x.kind === 'support' ? 'below' : 'above')
  }
})

test('todas as sugestões ficam perto (≤25%) do preço', () => {
  for (const x of suggestLevels(rising, 30000)) {
    assert.ok(Math.abs(x.price - 30000) / 30000 <= 0.25, `${x.price} perto de 30000`)
  }
})

test('no máximo 2 por lado', () => {
  const s = suggestLevels(rising, 30000)
  assert.ok(s.filter((x) => x.kind === 'support').length <= 2)
  assert.ok(s.filter((x) => x.kind === 'resistance').length <= 2)
})

test('histórico vazio ou preço inválido => sem sugestões', () => {
  assert.deepEqual(suggestLevels([], 30000), [])
  assert.deepEqual(suggestLevels([1, 2, 3], NaN), [])
})
