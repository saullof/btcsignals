// Sugestões de nível pra alarme — CURTO PRAZO (semanal/quinzenal), baseadas em
// métricas técnicas sobre os fechamentos diários. O painel cobre longo/médio
// prazo; aqui o foco é acionável agora: EMAs curtas, Bollinger 20 e swings de
// 7/14 dias. Pura e testável.

export type Suggestion = {
  kind: 'support' | 'resistance'
  price: number
  label: string
  direction: 'above' | 'below' // como o alarme deve disparar
}

// EMA do último ponto (seed = SMA dos primeiros `period`).
function ema(vals: number[], period: number): number | null {
  if (vals.length < period) return null
  const k = 2 / (period + 1)
  let e = vals.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < vals.length; i++) e = vals[i] * k + e * (1 - k)
  return e
}

// closes: fechamentos diários em ordem crescente (antigo → recente). current: preço vivo.
export function suggestLevels(closes: number[], current: number): Suggestion[] {
  if (!closes.length || !Number.isFinite(current) || current <= 0) return []

  const cand: { price: number; label: string }[] = []
  const e9 = ema(closes, 9)
  if (e9) cand.push({ price: e9, label: 'EMA 9' })
  const e21 = ema(closes, 21)
  if (e21) cand.push({ price: e21, label: 'EMA 21' })

  // Bollinger 20 (SMA20 ± 2σ): bandas de curto prazo.
  if (closes.length >= 20) {
    const w = closes.slice(-20)
    const m = w.reduce((a, b) => a + b, 0) / 20
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20)
    cand.push({ price: m - 2 * sd, label: 'Banda inferior (Bollinger)' })
    cand.push({ price: m + 2 * sd, label: 'Banda superior (Bollinger)' })
  }

  // Swings recentes: 7d (semanal) e 14d (quinzenal).
  const sw = (n: number, lo: boolean) => {
    const w = closes.slice(-n)
    return w.length ? (lo ? Math.min(...w) : Math.max(...w)) : null
  }
  for (const [n, lo, label] of [[7, true, 'Mínima 7d'], [7, false, 'Máxima 7d'], [14, true, 'Mínima 14d'], [14, false, 'Máxima 14d']] as const) {
    const v = sw(n, lo)
    if (v != null) cand.push({ price: v, label })
  }

  // Classifica pelo lado (abaixo=suporte/compra, acima=resistência/venda) e
  // descarta o que está praticamente no preço (<0,2%).
  const sug: Suggestion[] = cand
    .filter((c) => c.price > 0 && Math.abs(c.price - current) / current > 0.002)
    .map((c) => ({
      price: c.price,
      label: c.label,
      kind: c.price < current ? 'support' : 'resistance',
      direction: c.price < current ? 'below' : 'above',
    }))
    .sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current)) // mais perto primeiro

  // Dedup (<1%) e no máx. 3 por lado.
  const dedup: Suggestion[] = []
  for (const s of sug) if (!dedup.some((o) => Math.abs(o.price - s.price) / s.price < 0.01)) dedup.push(s)
  const support = dedup.filter((s) => s.kind === 'support').slice(0, 3)
  const resistance = dedup.filter((s) => s.kind === 'resistance').slice(0, 3)
  return [...support, ...resistance].sort((a, b) => a.price - b.price)
}
