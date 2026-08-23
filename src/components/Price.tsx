import { useEffect, useMemo, useState } from 'react'
import { useBtcPrice } from '../hooks/useBtcPrice'
import { supabase } from '../lib/supabase'
import type { PricePoint } from '../lib/types'
import { fmtUsd, fmtCompactUsd, pct } from '../lib/ui'

const TFS = [
  { label: '30D', n: 30 },
  { label: '90D', n: 90 },
  { label: '1A', n: 365 },
  { label: 'Máx', n: 9999 },
]

export default function Price() {
  const ticker = useBtcPrice()
  const [history, setHistory] = useState<PricePoint[]>([])
  const [tf, setTf] = useState(90)

  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase
        .from('price_history')
        .select('date, close')
        .order('date', { ascending: false })
        .limit(1000)
      if (data) setHistory([...data].reverse())
    })()
  }, [])

  const closes = useMemo(() => history.map((h) => h.close), [history])
  const up = (ticker?.changePct ?? 0) >= 0
  const sliced = closes.slice(Math.max(0, closes.length - tf))

  // Retorno de N dias atrás até o último fechamento armazenado.
  const ret = (days: number): number | null => {
    if (closes.length <= days) return null
    return closes[closes.length - 1] / closes[closes.length - 1 - days] - 1
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      {/* Hero */}
      <section className="card px-5 py-6 text-center">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          BTC / USDT — ao vivo
        </p>
        <p className="mt-1 text-5xl font-extrabold tabular leading-none">
          {ticker ? fmtUsd(ticker.price) : '—'}
        </p>
        <p className="mt-2 text-sm font-semibold tabular" style={{ color: up ? 'var(--buy)' : 'var(--sell)' }}>
          {ticker
            ? `${up ? '▲' : '▼'} ${fmtUsd(Math.abs(ticker.changeAbs))} (${Math.abs(ticker.changePct).toFixed(2)}%) em 24h`
            : ' '}
        </p>
      </section>

      {/* Stats 24h ao vivo */}
      <section className="grid grid-cols-3 gap-3">
        <Stat label="Máx 24h" value={ticker ? fmtUsd(ticker.high) : '—'} />
        <Stat label="Mín 24h" value={ticker ? fmtUsd(ticker.low) : '—'} />
        <Stat label="Volume 24h" value={ticker ? fmtCompactUsd(ticker.volQuote) : '—'} />
      </section>

      {/* Gráfico com seletor de período */}
      <section className="card px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Histórico</p>
          <div className="flex gap-1">
            {TFS.map((t) => {
              const active = tf === t.n
              return (
                <button
                  key={t.n}
                  onClick={() => setTf(t.n)}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    background: active ? 'var(--card-hi)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--muted)',
                    border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
        {sliced.length > 1 ? (
          <>
            <Sparkline points={sliced} />
            <div className="mt-1 flex justify-between text-[11px] tabular" style={{ color: 'var(--muted)' }}>
              <span>{fmtUsd(Math.min(...sliced))}</span>
              <span>{sliced.length} dias</span>
              <span>{fmtUsd(Math.max(...sliced))}</span>
            </div>
          </>
        ) : (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            Sem histórico ainda — rode o backfill (etapa 3).
          </p>
        )}
      </section>

      {/* Retornos */}
      <section className="card px-4 py-4">
        <p className="mb-3 text-sm font-semibold">Retorno</p>
        <div className="grid grid-cols-3 gap-3">
          <Ret label="7 dias" r={ret(7)} />
          <Ret label="30 dias" r={ret(30)} />
          <Ret label="1 ano" r={ret(365)} />
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-3 text-center">
      <div className="text-sm font-bold tabular">{value}</div>
      <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
    </div>
  )
}

function Ret({ label, r }: { label: string; r: number | null }) {
  const color = r == null ? 'var(--muted)' : r >= 0 ? 'var(--buy)' : 'var(--sell)'
  const txt = r == null ? '—' : `${r >= 0 ? '+' : ''}${pct(r)}`
  return (
    <div className="rounded-xl px-2 py-3 text-center" style={{ background: 'var(--bg-2)' }}>
      <div className="text-lg font-bold tabular" style={{ color }}>
        {txt}
      </div>
      <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
    </div>
  )
}

function Sparkline({ points }: { points: number[] }) {
  const w = 320
  const h = 96
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - ((p - min) / span) * h])
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const rising = points[points.length - 1] >= points[0]
  const stroke = rising ? 'var(--buy)' : 'var(--sell)'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#area)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}
