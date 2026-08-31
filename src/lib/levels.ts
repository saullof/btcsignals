// Sugestões de nível (suporte/resistência) pra alarme, PERTO do preço atual —
// úteis pra alarme prático, não escala de ciclo. Mistura números redondos logo
// acima/abaixo com a máxima/mínima recente (30d). Pura e testável.

export type Suggestion = {
  kind: 'support' | 'resistance'
  price: number
  label: string
  direction: 'above' | 'below' // como o alarme deve disparar
}

// Passo "redondo" proporcional ao preço (~5%), arredondado pra 1/2/5×10^n.
// Ex.: ~77k → 5000; ~20k → 1000.
function niceStep(p: number): number {
  const raw = p * 0.05
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / mag
  const mult = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10
  return mult * mag
}

// closes: fechamentos em ordem crescente (antigo → recente). current: preço vivo.
export function suggestLevels(closes: number[], current: number): Suggestion[] {
  if (!closes.length || !Number.isFinite(current) || current <= 0) return []
  const step = niceStep(current)

  const raw: Suggestion[] = []
  // Números redondos: 1 e 2 passos pra cada lado.
  const below = Math.floor(current / step) * step
  const above = Math.ceil(current / step) * step
  for (const p of [below, below - step]) if (p > 0) raw.push({ kind: 'support', price: p, label: 'Nível redondo', direction: 'below' })
  for (const p of [above, above + step]) raw.push({ kind: 'resistance', price: p, label: 'Nível redondo', direction: 'above' })

  // Estrutura recente (30d): mínima = suporte, máxima = resistência.
  const last30 = closes.slice(-30)
  if (last30.length) {
    raw.push({ kind: 'support', price: Math.min(...last30), label: 'Mínima 30d', direction: 'below' })
    raw.push({ kind: 'resistance', price: Math.max(...last30), label: 'Máxima 30d', direction: 'above' })
  }

  // Só o lado certo (suporte abaixo, resistência acima) e PERTO (≤25%).
  const near = (p: number) => Math.abs(p - current) / current <= 0.25
  const valid = raw
    .filter((s) => (s.kind === 'support' ? s.price < current : s.price > current) && near(s.price))
    .sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current)) // mais perto primeiro

  // Dedup (<1,5%) e no máx. 2 por lado.
  const dedup: Suggestion[] = []
  for (const s of valid) if (!dedup.some((o) => Math.abs(o.price - s.price) / s.price < 0.015)) dedup.push(s)
  const sup = dedup.filter((s) => s.kind === 'support').slice(0, 2)
  const res = dedup.filter((s) => s.kind === 'resistance').slice(0, 2)
  return [...sup, ...res].sort((a, b) => a.price - b.price)
}
