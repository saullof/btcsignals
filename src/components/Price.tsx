import { useEffect, useState } from 'react'
import { useBtcPrice } from '../hooks/useBtcPrice'
import { supabase } from '../lib/supabase'
import type { PricePoint } from '../lib/types'
import { fmtUsd } from '../lib/ui'

export default function Price() {
  const ticker = useBtcPrice()
  const [history, setHistory] = useState<PricePoint[]>([])

  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase
        .from('price_history')
        .select('date, close')
        .order('date', { ascending: false })
        .limit(90)
      if (data) setHistory([...data].reverse())
    })()
  }, [])

  const up = (ticker?.changePct ?? 0) >= 0
  const closes = history.map((h) => h.close)
  const hi = closes.length ? Math.max(...closes) : 0
  const lo = closes.length ? Math.min(...closes) : 0

  return (
    <div className="flex flex-col gap-4 pt-1">
      <section className="card px-5 py-6 text-center">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          BTC / USDT — ao vivo
        </p>
        <p className="mt-1 text-5xl font-extrabold tabular leading-none">
          {ticker ? fmtUsd(ticker.price) : '—'}
        </p>
        <p className="mt-2 text-sm font-semibold tabular" style={{ color: up ? 'var(--buy)' : 'var(--sell)' }}>
          {ticker ? `${up ? '▲' : '▼'} ${Math.abs(ticker.changePct).toFixed(2)}% em 24h` : ' '}
        </p>
      </section>

      <section className="card px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Últimos {history.length || 90} dias
          </p>
          {closes.length > 1 && (
            <p className="text-[11px] tabular" style={{ color: 'var(--muted)' }}>
              {fmtUsd(lo)} – {fmtUsd(hi)}
            </p>
          )}
        </div>
        {closes.length > 1 ? (
          <Sparkline points={closes} />
        ) : (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            Sem histórico ainda — rode o backfill (etapa 3).
          </p>
        )}
      </section>
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
