import { useState } from 'react'
import { useDecision } from '../hooks/useDecision'
import { indicatorName, indicatorDesc } from '../lib/ui'
import type { IndicatorWeight } from '../lib/types'
import type { HorizonWeight } from '../lib/weights'
import { HelpBtn, InfoSheet } from './Panel'

const pct1 = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1).replace('.', ',')}%`
const p0 = (x: number) => `${Math.round(x * 100)}%`

function fmtValue(key: string, v: number): string {
  if (key === 'rsi' || key === 'fng') return v.toFixed(0)
  if (key === 'ema21' || key === 'ema50' || key === 'ret30') return pct1(v)
  if (key === 'vol20') return `${(v * 100).toFixed(1).replace('.', ',')}%/dia`
  if (key === 'pctb') return p0(v)
  if (key === 'funding') return `${(v * 100).toFixed(4).replace('.', ',')}%`
  return (Math.round(v * 100) / 100).toString().replace('.', ',')
}

// Inclinação vs o normal (~33% cada): o lado que mais se afastou da base.
function lean(w: HorizonWeight): string {
  const dev = w.dist.map((p) => p - 1 / 3)
  const k = dev.indexOf(Math.max(...dev))
  if (dev[k] < 0.03) return 'sem inclinação hoje'
  return ['mais chance de queda forte', 'mais chance de ficar de lado', 'mais chance de alta forte'][k]
}

function Bar({ w }: { w: HorizonWeight }) {
  const parts = [
    { p: w.dist[0], c: 'var(--sell)' },
    { p: w.dist[1], c: 'var(--neutral)' },
    { p: w.dist[2], c: 'var(--buy)' },
  ]
  return (
    <>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full">
        {parts.map((x, i) => (
          <div key={i} style={{ width: `${x.p * 100}%`, background: x.c }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular" style={{ color: 'var(--muted)' }}>
        <span style={{ color: 'var(--sell)' }}>queda {p0(w.dist[0])}</span>
        <span>lateral {p0(w.dist[1])}</span>
        <span style={{ color: 'var(--buy)' }}>alta {p0(w.dist[2])}</span>
      </div>
    </>
  )
}

const name = (k: string) => indicatorName[k] ?? k

function detail(i: IndicatorWeight): string {
  const line = (h: 7 | 30) => {
    const w = i.w[h]
    return (
      `Em ${h} dias: queda forte ${p0(w.dist[0])} · lateral ${p0(w.dist[1])} · alta forte ${p0(w.dist[2])}\n` +
      `(queda forte = cair mais de ${pct1(w.thresholds[0]).replace('−', '')}; alta forte = subir mais de ${pct1(w.thresholds[1]).replace('+', '')})\n` +
      `Teste: ${w.reason}.`
    )
  }
  return `${indicatorDesc[i.key] ?? ''}\n\nHoje: ${fmtValue(i.key, i.value)}\n\n${line(30)}\n\n${line(7)}\n\nBaseado em ${i.w[30].n.toLocaleString('pt-BR')} dias parecidos.`
}

// Spec 5.2: cards com a distribuição de 3 caminhos; os que não ajudam ficam recolhidos.
export default function IndicatorWeights() {
  const { snap } = useDecision()
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState<{ title: string; body: string } | null>(null)
  if (!snap) return null
  if (!snap.indicators)
    return (
      <section className="card px-4 py-4 text-sm" style={{ color: 'var(--muted)' }}>
        Os pesos dos indicadores aparecem depois do próximo cálculo diário.
      </section>
    )

  const useful = snap.indicators.filter((i) => i.w[30].helps || i.w[7].helps)
  const rest = snap.indicators.filter((i) => !(i.w[30].helps || i.w[7].helps))
  const helpBody =
    'Cada barra mostra, nos dias do passado em que o indicador estava parecido com hoje, o que o preço fez nos 30 dias seguintes: queda forte, lateral ou alta forte.\n\n' +
    'Os três grupos têm o mesmo tamanho no histórico, então o normal é ~33% cada. O que importa é o quanto a barra foge disso.\n\n' +
    'Só aparece aqui em cima o indicador que passou no teste sem olhar o futuro: melhorou a previsão em pelo menos 1% e nas duas metades do período. Os outros ficam em "Não ajudam neste prazo".'

  return (
    <section className="card px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Indicadores — peso em 30 dias</h2>
        <HelpBtn onClick={() => setSheet({ title: 'Peso dos indicadores', body: helpBody })} />
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        Normalmente: ~33% cada. Toque para ver 7 dias e os detalhes.
      </p>

      {useful.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
          Nenhum indicador passou no teste agora: nenhum antecipou o preço em 7 ou 30 dias de forma consistente.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {useful.map((i) => (
            <button
              key={i.key}
              onClick={() => setSheet({ title: name(i.key), body: detail(i) })}
              className="rounded-xl px-3 py-2.5 text-left"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{name(i.key)}</span>
                <span className="text-xs tabular" style={{ color: 'var(--muted)' }}>{fmtValue(i.key, i.value)}</span>
              </div>
              <Bar w={i.w[30]} />
              <p className="mt-1 text-[11px]" style={{ color: 'var(--text)' }}>{lean(i.w[30])}</p>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
      >
        <span>Não ajudam neste prazo ({rest.length})</span>
        <span>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {rest.map((i) => (
            <button
              key={i.key}
              onClick={() => setSheet({ title: name(i.key), body: detail(i) })}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs"
              style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              <span>
                <b style={{ color: 'var(--text)' }}>{name(i.key)}</b> · {i.w[30].reason}
              </span>
              <span className="tabular">{fmtValue(i.key, i.value)}</span>
            </button>
          ))}
          {snap.piCycle && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
              <b style={{ color: 'var(--text)' }}>Pi Cycle Top</b> · distância até o sinal de topo: {p0(snap.piCycle.ratio)} do caminho
            </div>
          )}
        </div>
      )}

      {sheet && <InfoSheet title={sheet.title} body={sheet.body} onClose={() => setSheet(null)} />}
    </section>
  )
}
