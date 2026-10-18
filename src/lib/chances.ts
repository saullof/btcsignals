// Linhas da tabela "Chances desta semana e deste mês": escolhe os níveis pelo
// preço ao vivo e aplica as curvas de toque do snapshot (spec 5.1 / 6.3).
import { pickLevels, type PickedLevel } from './levels.ts'
import { curveFor, probAt, HORIZONS, type Horizon } from './touch.ts'
import type { DecisionSnapshot } from './types'

export type LevelRow = PickedLevel & { prob: Record<Horizon, number>; n: Record<Horizon, number> }

export function levelRows(snap: DecisionSnapshot, price: number): LevelRow[] {
  return pickLevels(snap.levels, price).map((lv) => {
    const dir = lv.side === 'above' ? 'up' : 'down'
    const prob = {} as Record<Horizon, number>
    const n = {} as Record<Horizon, number>
    for (const h of HORIZONS) {
      const curve = curveFor(snap.model, h, dir, snap.regime)
      prob[h] = probAt(curve, Math.abs(Math.log(lv.price / price)) / (snap.sigma * Math.sqrt(h)))
      n[h] = curve.n
    }
    // Quem toca em 7 dias já tocou em 30. As curvas são estimadas com amostras um
    // pouco diferentes (a de 30d não tem os últimos 23 dias), então impomos a regra.
    prob[30] = Math.max(prob[30], prob[7])
    return { ...lv, prob, n }
  })
}

export function fmtProb(p: number): string {
  if (p < 0.01) return '<1%'
  if (p > 0.99) return '>99%'
  return `${Math.round(p * 100)}%`
}
