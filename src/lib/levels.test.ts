import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestLevels } from './levels.ts'

test('suporte abaixo, resistência acima do preço atual', () => {
  // 300 dias subindo de ~10k a ~40k; preço vivo 30k.
  const closes = Array.from({ length: 300 }, (_, i) => 10000 + i * 100)
  const s = suggestLevels(closes, 30000)
  assert.ok(s.length > 0)
  for (const x of s) {
    if (x.kind === 'support') assert.ok(x.price < 30000, `suporte ${x.price} < 30000`)
    else assert.ok(x.price > 30000, `resistência ${x.price} > 30000`)
  }
})

test('direção casa com o tipo', () => {
  const closes = Array.from({ length: 300 }, (_, i) => 10000 + i * 100)
  for (const x of suggestLevels(closes, 30000)) {
    assert.equal(x.direction, x.kind === 'support' ? 'below' : 'above')
  }
})

test('histórico vazio ou preço inválido => sem sugestões', () => {
  assert.deepEqual(suggestLevels([], 30000), [])
  assert.deepEqual(suggestLevels([1, 2, 3], NaN), [])
})

test('dedup: níveis muito próximos colapsam', () => {
  const closes = Array.from({ length: 90 }, () => 20000) // tudo igual
  const s = suggestLevels(closes, 25000)
  // min90 = 20000 (suporte). Sem SMA200 (só 90 pts). 1 suporte, 0 resistência (max<preço).
  assert.equal(s.filter((x) => x.kind === 'support').length, 1)
})
