import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signalFromCheapness } from '../lib/signals'
import type { CompositeSnapshot, Consensus, IndicatorSnapshot, Signal } from '../lib/types'
import {
  signalColor,
  signalLabel,
  signalTint,
  indicatorName,
  indicatorDesc,
  pct,
  fmtRaw,
} from '../lib/ui'

export default function Panel() {
  const [composite, setComposite] = useState<CompositeSnapshot | null>(null)
  const [indicators, setIndicators] = useState<IndicatorSnapshot[]>([])
  const [state, setState] = useState<'loading' | 'empty' | 'ready' | 'no-db'>('loading')
  const [sel, setSel] = useState<IndicatorSnapshot | null>(null)

  useEffect(() => {
    if (!supabase) {
      setState('no-db')
      return
    }
    ;(async () => {
      const { data: comp } = await supabase
        .from('composite_snapshots')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!comp) {
        setState('empty')
        return
      }
      const { data: inds } = await supabase.from('indicator_snapshots').select('*').eq('date', comp.date)
      setComposite(comp)
      setIndicators(sortInds(inds ?? []))
      setState('ready')
    })()
  }, [])

  if (state === 'no-db') return <Notice text="Supabase não configurado. Preencha .env (etapa 2)." />
  if (state === 'loading') return <Notice text="Carregando…" />
  if (state === 'empty') return <Notice text="Sem snapshots ainda. Rode a ingestão (etapas 3–4)." />

  const c = composite!
  const cValue = c.composite ?? 0
  const cSignal = signalFromCheapness(cValue)

  return (
    <div className="flex flex-col gap-4 pt-1">
      {/* Hero: gauge do composto + sinal */}
      <section className="card flex flex-col items-center px-4 pt-5 pb-4">
        <div className="flex w-full items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
          <span>Composto de ciclo</span>
          <span className="tabular">{c.date}</span>
        </div>
        <Gauge value={cValue} signal={cSignal} />
        <VotesBar buy={c.votes_buy} sell={c.votes_sell} neutral={c.votes_neutral} />
        <p className="mt-3 text-center text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
          Média de todos os indicadores numa nota de <b>0 (caro/topo)</b> a <b>1 (barato/fundo)</b>.
        </p>
      </section>

      {/* Probabilidade (base-rates) */}
      <section className="card px-4 py-4">
        <p className="text-sm font-semibold">Chance histórica de subir</p>
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
          Em dias do passado com o composto na mesma faixa de hoje, com que frequência o preço estava
          mais alto depois:
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Prob label="30 dias" p={c.prob_up_30d} n={c.sample_30d} />
          <Prob label="90 dias" p={c.prob_up_90d} n={c.sample_90d} />
          <Prob label="180 dias" p={c.prob_up_180d} n={c.sample_180d} />
        </div>
        <p className="mt-3 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
          <b>n</b> = quantos dias do histórico (desde 2011) caíram nessa mesma faixa. Quanto maior o
          n, mais confiável o número. ⚠ Frequência histórica, <b>não</b> é previsão nem conselho
          financeiro.
        </p>
      </section>

      {/* Base-rate por consenso */}
      {c.consensus && <ConsensusCard cons={c.consensus} />}

      {/* Grade de indicadores */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">Indicadores</h2>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          toque para explicar
        </span>
      </div>
      <section className="grid grid-cols-2 gap-3">
        {indicators.map((i) => (
          <IndicatorCard key={i.indicator_key} ind={i} onClick={() => setSel(i)} />
        ))}
      </section>

      {sel && <Sheet ind={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

function Gauge({ value, signal }: { value: number; signal: Signal }) {
  const R = 92
  const cx = 110
  const cy = 116
  const len = Math.PI * R
  const track = `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`
  return (
    <div className="relative mt-1" style={{ width: 220, height: 132 }}>
      <svg viewBox="0 0 220 132" className="w-full">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--sell)" />
            <stop offset="0.5" stopColor="var(--neutral)" />
            <stop offset="1" stopColor="var(--buy)" />
          </linearGradient>
        </defs>
        <path d={track} fill="none" stroke="var(--border)" strokeWidth={14} strokeLinecap="round" />
        <path
          d={track}
          fill="none"
          stroke="url(#g)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${len * value} ${len}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <div className="text-4xl font-extrabold tabular leading-none">{value.toFixed(2)}</div>
        <div
          className="chip mt-2 px-3 py-1 text-xs"
          style={{ background: signalTint[signal], color: signalColor[signal] }}
        >
          {signalLabel[signal]}
        </div>
      </div>
    </div>
  )
}

function VotesBar({ buy, sell, neutral }: { buy: number; sell: number; neutral: number }) {
  const total = Math.max(1, buy + sell + neutral)
  const seg = (n: number, color: string) =>
    n > 0 ? <div style={{ width: `${(n / total) * 100}%`, background: color }} /> : null
  return (
    <div className="mt-4 w-full">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        {seg(buy, 'var(--buy)')}
        {seg(neutral, 'var(--neutral)')}
        {seg(sell, 'var(--sell)')}
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <Legend color="var(--buy)" label={`${buy} compra`} />
        <Legend color="var(--neutral)" label={`${neutral} incerto`} />
        <Legend color="var(--sell)" label={`${sell} venda`} />
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function Prob({ label, p, n }: { label: string; p: number | null; n: number | null }) {
  return (
    <div className="rounded-xl px-2 py-3 text-center" style={{ background: 'var(--bg-2)' }}>
      <div className="text-2xl font-bold tabular" style={{ color: 'var(--buy)' }}>
        {pct(p)}
      </div>
      <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="text-[11px] tabular" style={{ color: 'var(--muted)' }}>
        n={n ?? 0}
      </div>
    </div>
  )
}

function IndicatorCard({ ind, onClick }: { ind: IndicatorSnapshot; onClick: () => void }) {
  const barganha = ind.cheapness ?? 0
  const color = signalColor[ind.signal]
  return (
    <button onClick={onClick} className="card p-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold leading-tight">
          {indicatorName[ind.indicator_key] ?? ind.indicator_key}
        </span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, marginTop: 4 }} />
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="chip px-2 py-0.5 text-[10px]" style={{ background: signalTint[ind.signal], color }}>
          {signalLabel[ind.signal]}
        </span>
        <span className="text-[11px] tabular" style={{ color: 'var(--muted)' }}>
          {fmtRaw(ind.raw_value)}
        </span>
      </div>
      {/* barra "barganha": 0 = caro/topo, 1 = barato/fundo */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.round(barganha * 100)}%`, background: color }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px]" style={{ color: 'var(--muted)' }}>
        <span>caro</span>
        <span>barganha {pct(barganha)}</span>
        <span>barato</span>
      </div>
    </button>
  )
}

// Bottom sheet com a explicação do indicador tocado.
function Sheet({ ind, onClose }: { ind: IndicatorSnapshot; onClose: () => void }) {
  const color = signalColor[ind.signal]
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
      <div
        className="card relative mx-3 mb-3 w-full max-w-md px-5 pt-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--border)' }} />
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">{indicatorName[ind.indicator_key] ?? ind.indicator_key}</h3>
          <span className="chip px-2.5 py-1 text-[11px]" style={{ background: signalTint[ind.signal], color }}>
            {signalLabel[ind.signal]}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
          {indicatorDesc[ind.indicator_key] ?? 'Sem descrição.'}
        </p>
        <div className="mt-4 flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
          <span>
            barganha agora: <b style={{ color }}>{pct(ind.cheapness)}</b>
          </span>
          <span>valor: {fmtRaw(ind.raw_value)}</span>
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl py-2.5 text-sm font-semibold"
          style={{ background: 'var(--card-hi)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          Fechar
        </button>
      </div>
    </div>
  )
}

function ConsensusCard({ cons }: { cons: Consensus }) {
  return (
    <section className="card px-4 py-4">
      <p className="text-sm font-semibold">Consenso de compra</p>
      <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
        Hoje: <b style={{ color: 'var(--text)' }}>{cons.buy} de {cons.total}</b> indicadores em compra.
        Quanto mais concordaram no passado, maior a frequência de alta em 90 dias:
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {cons.curve90.map((r) => (
          <div key={r.thr} className="flex items-center gap-2">
            <span className="w-14 text-[11px] tabular" style={{ color: 'var(--muted)' }}>
              ≥{Math.round(r.thr * 100)}%
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round((r.prob ?? 0) * 100)}%`, background: 'var(--buy)' }}
              />
            </div>
            <span className="w-20 text-right text-[11px] tabular">
              {pct(r.prob)} <span style={{ color: 'var(--muted)' }}>n={r.n}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug" style={{ color: 'var(--muted)' }}>
        ≥50% = pelo menos metade dos indicadores em compra. Amostra pequena; não é conselho financeiro.
      </p>
    </section>
  )
}

function Notice({ text }: { text: string }) {
  return (
    <div className="card px-6 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
      {text}
    </div>
  )
}

// Ordena: sinais de compra primeiro, depois venda, depois neutro; barganha desc.
function sortInds(inds: IndicatorSnapshot[]): IndicatorSnapshot[] {
  const rank: Record<Signal, number> = { buy: 0, sell: 1, neutral: 2 }
  return [...inds].sort(
    (a, b) => rank[a.signal] - rank[b.signal] || (b.cheapness ?? 0) - (a.cheapness ?? 0),
  )
}
