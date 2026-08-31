// Sugestões de nível (suporte/resistência) pra alarme, derivadas do histórico
// de fechamentos. Nada de mágica: mínimas/máximas recentes + bandas Mayer
// (0,8 e 2,4 × SMA200), que a UI já explica. Pura e testável.

export type Suggestion = {
  kind: 'support' | 'resistance'
  price: number
  label: string
  direction: 'above' | 'below' // como o alarme deve disparar
}

const roundNice = (n: number) => Math.round(n / 100) * 100

// closes: fechamentos em ordem crescente (antigo → recente). current: preço vivo.
export function suggestLevels(closes: number[], current: number): Suggestion[] {
  if (!closes.length || !Number.isFinite(current)) return []
  const last = (n: number) => closes.slice(Math.max(0, closes.length - n))
  const sma200 = closes.length >= 200 ? last(200).reduce((a, b) => a + b, 0) / 200 : null

  const raw: Suggestion[] = []
  // Suportes (disparam quando o preço CAI até lá → compra).
  raw.push({ kind: 'support', price: Math.min(...last(90)), label: 'Suporte 90d', direction: 'below' })
  if (sma200) raw.push({ kind: 'support', price: sma200 * 0.8, label: 'Mayer 0,8 (barato histórico)', direction: 'below' })
  // Resistências (disparam quando o preço SOBE até lá → venda).
  raw.push({ kind: 'resistance', price: Math.max(...last(365)), label: 'Resistência 1a', direction: 'above' })
  if (sma200) raw.push({ kind: 'resistance', price: sma200 * 2.4, label: 'Mayer 2,4 (esticado histórico)', direction: 'above' })

  // Só o que ainda não foi cruzado (suporte abaixo, resistência acima do preço).
  const valid = raw
    .map((s) => ({ ...s, price: roundNice(s.price) }))
    .filter((s) => (s.kind === 'support' ? s.price < current : s.price > current))
    .sort((a, b) => a.price - b.price)

  // Dedup: descarta níveis a menos de 1,5% de outro já aceito.
  const out: Suggestion[] = []
  for (const s of valid) {
    if (!out.some((o) => Math.abs(o.price - s.price) / s.price < 0.015)) out.push(s)
  }
  return out
}
