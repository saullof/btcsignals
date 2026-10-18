// Retornos mensais (mapa verde/vermelho) e estatística por mês (spec 5.4).

export type MonthlyReturn = { year: number; month: number; ret: number; partial: boolean }

// ret = último close do mês ÷ último close do mês anterior − 1. O primeiro mês
// da série não tem anterior e sai; o último é parcial se não chegou ao fim do mês.
export function monthlyReturns(daily: { date: string; close: number }[], fromYear = 2013): MonthlyReturn[] {
  const lastByMonth = new Map<string, { date: string; close: number }>()
  for (const d of [...daily].sort((a, b) => a.date.localeCompare(b.date))) lastByMonth.set(d.date.slice(0, 7), d)
  const months = [...lastByMonth.keys()]
  const out: MonthlyReturn[] = []
  for (let i = 1; i < months.length; i++) {
    const [y, m] = months[i].split('-').map(Number)
    if (y < fromYear) continue
    const cur = lastByMonth.get(months[i])!
    const isLast = i === months.length - 1
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    out.push({ year: y, month: m, ret: cur.close / lastByMonth.get(months[i - 1])!.close - 1, partial: isLast && cur.date < monthEnd })
  }
  return out
}

// % de anos positivos e mediana de um mês (1–12), ignorando o mês parcial.
export function monthStats(rows: MonthlyReturn[], month: number): { positivePct: number | null; median: number | null; n: number } {
  const r = rows.filter((x) => x.month === month && !x.partial).map((x) => x.ret).sort((a, b) => a - b)
  if (!r.length) return { positivePct: null, median: null, n: 0 }
  const mid = Math.floor(r.length / 2)
  return {
    positivePct: r.filter((x) => x > 0).length / r.length,
    median: r.length % 2 ? r[mid] : (r[mid - 1] + r[mid]) / 2,
    n: r.length,
  }
}
