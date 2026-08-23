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
  zonaFromComposite,
  probPhrase,
  toneEmoji,
} from '../lib/ui'
import type { ConsensusRate } from '../lib/types'

export default function Panel() {
  const [composite, setComposite] = useState<CompositeSnapshot | null>(null)
  const [indicators, setIndicators] = useState<IndicatorSnapshot[]>([])
  const [state, setState] = useState<'loading' | 'empty' | 'ready' | 'no-db'>('loading')
  const [sel, setSel] = useState<IndicatorSnapshot | null>(null)
  const [info, setInfo] = useState<{ title: string; body: string } | null>(null)

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
      {/* Resumo em uma frase — a tradução de tudo em português comum */}
      <Resumo c={c} />

      {/* Hero: gauge do composto + sinal */}
      <section className="card flex flex-col items-center px-4 pt-5 pb-4">
        <div className="flex w-full items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
          <span className="flex items-center gap-1.5">
            Composto de ciclo <HelpBtn onClick={() => setInfo(EXPLAIN.composto)} />
          </span>
          <span className="tabular">{c.date}</span>
        </div>
        <Gauge value={cValue} signal={cSignal} />
        <VotesBar buy={c.votes_buy} sell={c.votes_sell} neutral={c.votes_neutral} />
        <p className="mt-3 text-center text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
          Média da <b>barganha</b> dos 10 indicadores: <b>0 = caro/topo</b>, <b>1 = barato/fundo</b>.
        </p>
      </section>

      {/* Probabilidade (base-rates) */}
      <section className="card px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Chance histórica de subir</p>
          <HelpBtn onClick={() => setInfo(EXPLAIN.chance)} />
        </div>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
          Nos dias do passado com nota parecida com a de hoje ({cValue.toFixed(2)}), com que frequência
          o preço estava mais alto depois:
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Prob label="30 dias" p={c.prob_up_30d} n={c.sample_30d} />
          <Prob label="90 dias" p={c.prob_up_90d} n={c.sample_90d} />
          <Prob label="180 dias" p={c.prob_up_180d} n={c.sample_180d} />
        </div>
        <p className="mt-3 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
          <b>dias</b> = quantos dias do histórico (desde 2011) tinham nota parecida com a de hoje.
          Quanto mais dias, mais confiável o número. ⚠ Frequência histórica, <b>não</b> é previsão
          nem conselho financeiro.
        </p>
      </section>

      {/* Base-rate por consenso */}
      {c.consensus && <ConsensusCard cons={c.consensus} onHelp={() => setInfo(EXPLAIN.consenso)} />}

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
      {info && <InfoSheet title={info.title} body={info.body} onClose={() => setInfo(null)} />}
    </div>
  )
}

// Explicações em linguagem simples, abertas pelo "?" de cada card.
const EXPLAIN = {
  composto: {
    title: 'Barganha e composto',
    body: 'Cada indicador vira uma nota de "barganha" de 0 a 100%, comparando o BTC de hoje com a própria história:\n\n• 100% = tão barato quanto nos fundos de ciclo → compra forte.\n• 0% = tão caro quanto nos topos → venda.\n\nO "composto" é a média dessas notas dos 10 indicadores. Hoje ~0.54 = meio-termo (nem barato, nem caro).',
  },
  chance: {
    title: 'Chance histórica de subir',
    body: 'Pega a nota (composto) de hoje e procura, no histórico desde 2011, todos os dias que tinham nota parecida.\n\nNesses dias, conta em quantos o preço estava MAIS ALTO 30, 90 e 180 dias depois. Esse percentual é a "chance de subir".\n\nn = quantos dias parecidos existiram (quanto maior, mais confiável).\n\nNÃO é previsão. É só a frequência do que já aconteceu em situações parecidas.',
  },
  consenso: {
    title: 'Consenso dos indicadores',
    body: 'Em vez da média (composto), olha QUANTOS dos 10 indicadores apontam o mesmo lado ao mesmo tempo.\n\n🟢 Compra: nos dias em que metade ou mais diziam "compra", em quantos o preço estava MAIS ALTO 90 dias depois.\n\n🔴 Venda: nos dias em que metade ou mais diziam "venda", em quantos o preço estava MAIS BAIXO 90 dias depois.\n\nA ideia é ver se, quando muitos concordam, o resultado seguinte foi mais previsível. Amostra pequena; não é garantia nem conselho.',
  },
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
        {n ?? 0} dias
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

function Resumo({ c }: { c: CompositeSnapshot }) {
  const cv = c.composite ?? 0
  const z = zonaFromComposite(cv)
  const total = c.votes_buy + c.votes_sell + c.votes_neutral
  const concl =
    z.tone === 'buy'
      ? 'Zonas assim, no passado, estiveram mais perto de fundos de ciclo.'
      : z.tone === 'sell'
        ? 'Zonas assim, no passado, estiveram mais perto de topos de ciclo.'
        : 'Sem sinal claro para nenhum dos lados no momento.'
  return (
    <section className="card px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{toneEmoji[z.tone]}</span>
        <p className="text-sm font-bold">Resumo de hoje</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed">
        O mercado está em zona <b style={{ color: signalColor[z.tone] }}>{z.label}</b>. Dos {total}{' '}
        indicadores, <b style={{ color: 'var(--buy)' }}>{c.votes_buy} em compra</b>,{' '}
        <b style={{ color: 'var(--sell)' }}>{c.votes_sell} em venda</b> e {c.votes_neutral} indecisos.
        Em situações parecidas, o preço estava mais alto em <b>{pct(c.prob_up_30d)}</b> das vezes um
        mês depois ({probPhrase(c.prob_up_30d)}). {concl}
      </p>
    </section>
  )
}

function ConsensusCard({ cons, onHelp }: { cons: Consensus; onHelp: () => void }) {
  return (
    <section className="card px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Consenso dos indicadores</p>
        <HelpBtn onClick={onHelp} />
      </div>
      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
        No passado, quando <b style={{ color: 'var(--text)' }}>metade ou mais</b> dos {cons.total}{' '}
        indicadores apontavam o mesmo lado, o que aconteceu em 90 dias:
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <ConsRow emoji="🟢" label={`Compra — hoje ${cons.buy}/${cons.total}`} verb="subiu" rate={cons.buy50} color="var(--buy)" />
        <ConsRow emoji="🔴" label={`Venda — hoje ${cons.sell}/${cons.total}`} verb="caiu" rate={cons.sell50} color="var(--sell)" />
      </div>
      <p className="mt-2 text-[10px] leading-snug" style={{ color: 'var(--muted)' }}>
        Amostra pequena (poucos ciclos); não é conselho financeiro.
      </p>
    </section>
  )
}

function ConsRow({
  emoji,
  label,
  verb,
  rate,
  color,
}: {
  emoji: string
  label: string
  verb: string
  rate: ConsensusRate
  color: string
}) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-2)' }}>
      <div className="flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-1.5 font-medium">
          <span>{emoji}</span>
          {label}
        </span>
        <span className="tabular text-base font-bold" style={{ color }}>
          {pct(rate.prob)}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
        o preço {verb} em 90 dias — em {rate.n} dias parecidos do passado
      </p>
    </div>
  )
}

function HelpBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="O que é isto?"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: 'var(--border)', color: 'var(--muted)' }}
    >
      ?
    </button>
  )
}

function InfoSheet({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
      <div className="card relative mx-3 mb-3 w-full max-w-md px-5 pt-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--border)' }} />
        <h3 className="text-base font-bold">{title}</h3>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
          {body}
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl py-2.5 text-sm font-semibold"
          style={{ background: 'var(--card-hi)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          Entendi
        </button>
      </div>
    </div>
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
