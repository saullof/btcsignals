// Peso de um indicador num prazo (spec 6.4/6.5): distribuição "queda forte /
// lateral / alta forte" (tercis do retorno) na faixa (quintil) do valor de hoje,
// e um teste walk-forward que decide se o indicador ajuda de verdade.

export type Dist = [number, number, number] // queda, lateral, alta
export type HorizonWeight = {
  dist: Dist
  thresholds: [number, number]
  n: number
  skill: number
  helps: boolean
  reason: string
}

const MIN_SKILL = 0.01
const MIN_TESTS = 30

function quantile(sorted: number[], p: number): number {
  const x = (sorted.length - 1) * p
  const k = Math.floor(x)
  return k + 1 < sorted.length ? sorted[k] + (sorted[k + 1] - sorted[k]) * (x - k) : sorted[k]
}

export function terciles(values: number[]): [number, number] {
  const s = [...values].sort((a, b) => a - b)
  return [quantile(s, 1 / 3), quantile(s, 2 / 3)]
}

export function quintileEdges(values: number[]): number[] {
  const s = [...values].sort((a, b) => a - b)
  return [0.2, 0.4, 0.6, 0.8].map((p) => quantile(s, p))
}

// Quantos cortes x ultrapassa (estritamente): empate fica na faixa de baixo.
export function binOf(x: number, edges: number[]): number {
  return edges.filter((e) => x > e).length
}

const classify = (y: number, [lo, hi]: [number, number]) => (y <= lo ? 0 : y >= hi ? 2 : 1)

// Distribuição de classes por faixa, com +1 em cada classe (Laplace).
export function condDist(xs: number[], cls: number[], edges: number[]): Dist[] {
  const c = Array.from({ length: edges.length + 1 }, () => [1, 1, 1])
  xs.forEach((x, i) => c[binOf(x, edges)][cls[i]]++)
  return c.map((r) => {
    const t = r[0] + r[1] + r[2]
    return [r[0] / t, r[1] / t, r[2] / t] as Dist
  })
}

export function brier(p: Dist, cls: number): number {
  return p.reduce((a, v, k) => a + (v - (k === cls ? 1 : 0)) ** 2, 0)
}

type Sample = { i: number; x: number; y: number }

function fit(train: Sample[]) {
  const q = terciles(train.map((s) => s.y))
  const edges = quintileEdges(train.map((s) => s.x))
  const cls = train.map((s) => classify(s.y, q))
  const cd = condDist(train.map((s) => s.x), cls, edges)
  const counts = [1, 1, 1]
  cls.forEach((k) => counts[k]++)
  const t = counts[0] + counts[1] + counts[2]
  const base: Dist = [counts[0] / t, counts[1] / t, counts[2] / t]
  return { q, edges, cd, base, cls }
}

export function horizonWeight(
  series: (number | null)[],
  closes: number[],
  h: number,
  { warmup = 1095, step = 7, refit = 30 }: { warmup?: number; step?: number; refit?: number } = {},
): HorizonWeight | null {
  const today = series.at(-1)
  if (today == null) return null
  const samples: Sample[] = []
  series.forEach((x, i) => {
    if (x != null && i + h < closes.length) samples.push({ i, x, y: closes[i + h] / closes[i] - 1 })
  })

  // Walk-forward: refaz o modelo a cada `refit` dias só com resultados já conhecidos.
  const bm: number[] = []
  const bb: number[] = []
  let model: ReturnType<typeof fit> | null = null
  let fittedAt = -Infinity
  for (let t = warmup; t < samples.length; t += step) {
    const s = samples[t]
    if (!model || s.i - fittedAt >= refit) {
      model = fit(samples.filter((p) => p.i + h < s.i))
      fittedAt = s.i
    }
    const cls = classify(s.y, model.q)
    bm.push(brier(model.cd[binOf(s.x, model.edges)], cls))
    bb.push(brier(model.base, cls))
  }

  const now = fit(samples)
  const bin = binOf(today, now.edges)
  const card = { dist: now.cd[bin], thresholds: now.q, n: samples.filter((s) => binOf(s.x, now.edges) === bin).length }

  if (bm.length < MIN_TESTS) return { ...card, skill: 0, helps: false, reason: 'histórico curto' }
  const sk = (a: number, b: number) => {
    const m = bm.slice(a, b).reduce((x, y) => x + y, 0)
    const z = bb.slice(a, b).reduce((x, y) => x + y, 0)
    return 1 - m / z
  }
  const half = Math.floor(bm.length / 2)
  const skill = sk(0, bm.length)
  const helps = skill >= MIN_SKILL && sk(0, half) > 0 && sk(half, bm.length) > 0
  const reason = helps
    ? `melhorou a previsão em ${(skill * 100).toFixed(1).replace('.', ',')}% nos testes`
    : 'não melhorou a previsão nos testes'
  return { ...card, skill, helps, reason }
}
