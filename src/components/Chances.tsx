import { useState } from 'react'
import { useBtcPrice } from '../hooks/useBtcPrice'
import { useDecision } from '../hooks/useDecision'
import { levelRows, fmtProb } from '../lib/chances'
import { curveFor } from '../lib/touch'
import { createPriceAlert } from '../lib/alerts'
import { fmtUsd } from '../lib/ui'
import { HelpBtn, InfoSheet } from './Panel'

const REGIME_PT = { bull: 'tendência de alta', bear: 'tendência de baixa', mixed: 'tendência mista' } as const

// Spec 5.1: níveis acima e abaixo com a chance de o preço encostar em 7 e 30 dias.
export default function Chances() {
  const { snap, state } = useDecision()
  const ticker = useBtcPrice()
  const [open, setOpen] = useState<number | null>(null)
  const [done, setDone] = useState<Record<number, string>>({})
  const [help, setHelp] = useState(false)

  if (state === 'loading') return null
  if (!snap)
    return (
      <section className="card px-4 py-4 text-sm" style={{ color: 'var(--muted)' }}>
        As chances aparecem depois do primeiro cálculo diário.
      </section>
    )

  const live = ticker?.price ?? null
  const price = live ?? snap.close
  const rows = levelRows(snap, price)
  const n30 = curveFor(snap.model, 30, 'up', snap.regime).n
  const mae = snap.calibration[30].mae * 100
  const maeTxt = `${mae.toFixed(1).replace('.', ',')} ${mae < 2 ? 'ponto' : 'pontos'}`

  const alarm = async (level: number, side: 'above' | 'below', label: string) => {
    const r = await createPriceAlert(level, side, `${label} · painel`)
    setDone((d) => ({ ...d, [level]: r.ok ? 'Alarme criado ✓' : `Não deu: ${r.error}` }))
  }

  const helpBody =
    'Para cada nível, a chance de o preço ENCOSTAR nele em algum momento nos próximos 7 ou 30 dias (mesmo que volte depois). É o mesmo gatilho dos alarmes.\n\n' +
    'Como calculamos: olhamos todos os dias desde 2017 com a mesma tendência de hoje (preço acima/abaixo das médias de 50 e 200 dias) e contamos com que frequência o preço andou essa distância, levando em conta o quanto ele costuma oscilar.\n\n' +
    `Hoje: ${REGIME_PT[snap.regime]}.\n\n` +
    'Teste sem olhar o futuro (30 dias):\n' +
    snap.calibration[30].buckets.map((b) => `previu ~${Math.round(b.pred * 100)}% → aconteceu ${Math.round(b.obs * 100)}%`).join('\n')

  return (
    <section className="card px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Chances desta semana e deste mês</h2>
        <HelpBtn onClick={() => setHelp(true)} />
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        BTC a <b className="tabular" style={{ color: 'var(--text)' }}>{fmtUsd(price)}</b>
        {live == null && ' (preço de fechamento)'} · {REGIME_PT[snap.regime]}
      </p>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px]" style={{ color: 'var(--muted)' }}>
        <span>Nível</span>
        <span className="w-12 text-right">7 dias</span>
        <span className="w-12 text-right">30 dias</span>
      </div>
      <div className="mt-1 flex flex-col gap-1.5">
        {rows.map((r) => {
          const up = r.side === 'above'
          const isOpen = open === r.price
          return (
            <div key={r.price} className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
              <button onClick={() => setOpen(isOpen ? null : r.price)} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-4 text-left">
                <div>
                  <div className="text-sm font-semibold tabular" style={{ color: 'var(--text)' }}>
                    <span style={{ color: up ? 'var(--buy)' : 'var(--sell)' }}>{up ? '↑' : '↓'}</span> {fmtUsd(r.price)}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{r.label}</div>
                </div>
                <span className="w-12 text-right text-sm font-bold tabular">{fmtProb(r.prob[7])}</span>
                <span className="w-12 text-right text-sm font-bold tabular">{fmtProb(r.prob[30])}</span>
              </button>
              {isOpen && (
                <div className="mt-2 border-t pt-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <p>
                    Chance de o preço encostar em {fmtUsd(r.price)} em algum momento nos próximos 7 dias ({fmtProb(r.prob[7])}) ou 30 dias (
                    {fmtProb(r.prob[30])}).
                  </p>
                  {done[r.price] ? (
                    <p className="mt-2 font-semibold" style={{ color: 'var(--text)' }}>{done[r.price]}</p>
                  ) : (
                    <button
                      onClick={() => alarm(r.price, r.side, r.label)}
                      className="mt-2 w-full rounded-lg py-2 text-xs font-bold"
                      style={{ background: 'var(--btc)', color: '#0a0e17' }}
                    >
                      Criar alarme neste nível
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
        Baseado em {n30.toLocaleString('pt-BR')} situações parecidas desde 2017. Teste sem olhar o futuro: as chances erraram em
        média ±{maeTxt}.
      </p>

      {help && <InfoSheet title="Chances por nível" body={helpBody} onClose={() => setHelp(false)} />}
    </section>
  )
}
