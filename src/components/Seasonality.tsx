import { useState } from 'react'
import { useDecision } from '../hooks/useDecision'
import { monthStats, type MonthlyReturn } from '../lib/seasonality'
import { signalTint } from '../lib/ui'
import { HelpBtn, InfoSheet } from './Panel'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const pctTxt = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1).replace('.', ',')}%`

// Spec 5.4: anos × meses, verde/vermelho, com % de anos positivos e mediana por mês.
export default function Seasonality() {
  const { snap } = useDecision()
  const [help, setHelp] = useState(false)
  if (!snap || !snap.monthly.length) return null

  const byKey = new Map<string, MonthlyReturn>(snap.monthly.map((m) => [`${m.year}-${m.month}`, m]))
  const years = [...new Set(snap.monthly.map((m) => m.year))].sort((a, b) => b - a)
  const cur = Number(snap.date.slice(5, 7))
  const next = (cur % 12) + 1
  const stats = MONTHS.map((_, i) => monthStats(snap.monthly, i + 1))
  const hi = (m: number) => (m === cur || m === next ? { boxShadow: 'inset 0 0 0 1px var(--btc)' } : {})

  return (
    <section className="card px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Retornos por mês</h2>
        <HelpBtn onClick={() => setHelp(true)} />
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        Mês atual e próximo em destaque. Arraste para o lado para ver todos.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-max border-separate border-spacing-[3px] text-[11px] tabular">
          <thead>
            <tr style={{ color: 'var(--muted)' }}>
              <th className="sticky left-0 z-10 pr-1 text-left font-medium" style={{ background: 'var(--card)' }}>
                Ano
              </th>
              {MONTHS.map((m, i) => (
                <th key={m} className="min-w-[52px] rounded px-1 py-1 font-medium" style={hi(i + 1)}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y}>
                <td className="sticky left-0 z-10 pr-1 font-semibold" style={{ background: 'var(--card)', color: 'var(--muted)' }}>
                  {y}
                </td>
                {MONTHS.map((_, i) => {
                  const m = byKey.get(`${y}-${i + 1}`)
                  if (!m) return <td key={i} />
                  const up = m.ret >= 0
                  return (
                    <td
                      key={i}
                      title={m.partial ? 'mês em andamento (parcial)' : undefined}
                      className="rounded px-1 py-1.5 text-center font-semibold"
                      style={{
                        background: up ? signalTint.buy : signalTint.sell,
                        color: up ? 'var(--buy)' : 'var(--sell)',
                        outline: m.partial ? '1px dashed var(--muted)' : undefined,
                        ...hi(i + 1),
                      }}
                    >
                      {pctTxt(m.ret)}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 pr-1 pt-2 font-semibold" style={{ background: 'var(--card)' }}>
                Positivo
              </td>
              {stats.map((s, i) => (
                <td key={i} className="rounded px-1 pt-2 text-center font-bold" style={hi(i + 1)}>
                  {s.positivePct == null ? '—' : `${Math.round(s.positivePct * 100)}%`}
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 pr-1 font-semibold" style={{ background: 'var(--card)' }}>
                Mediana
              </td>
              {stats.map((s, i) => (
                <td key={i} className="rounded px-1 text-center font-bold" style={hi(i + 1)}>
                  {s.median == null ? '—' : pctTxt(s.median)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {help && (
        <InfoSheet
          title="Retornos por mês"
          body={
            'Cada célula é quanto o BTC subiu (verde) ou caiu (vermelho) naquele mês.\n\n' +
            '"Positivo" = em quantos % dos anos aquele mês fechou no verde. "Mediana" = o retorno do meio, que não é distorcido por um ano extremo.\n\n' +
            'O mês atual (contorno tracejado) ainda não terminou e fica fora das contas.\n\n' +
            'Contexto, não previsão: são só ~13 exemplos por mês.'
          }
          onClose={() => setHelp(false)}
        />
      )}
    </section>
  )
}
