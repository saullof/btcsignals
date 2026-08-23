import { useState } from 'react'
import Panel from './components/Panel'
import Price from './components/Price'
import Alerts from './components/Alerts'
import { useBtcPrice } from './hooks/useBtcPrice'
import { fmtUsd } from './lib/ui'

type Tab = 'panel' | 'price' | 'alerts'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'panel', label: 'Painel', icon: '💻' },
  { id: 'price', label: 'Preço', icon: '📈' },
  { id: 'alerts', label: 'Alertas', icon: '🔔' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('panel')
  const ticker = useBtcPrice()
  const up = (ticker?.changePct ?? 0) >= 0

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <img src="/icons/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
            <h1 className="text-base font-bold">BTC Cycle Signals</h1>
          </div>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
            Apoio à decisão — não é conselho financeiro
          </p>
        </div>
        {ticker && (
          <div className="text-right">
            <div className="text-sm font-bold tabular">{fmtUsd(ticker.price)}</div>
            <div className="text-[11px] font-medium tabular" style={{ color: up ? 'var(--buy)' : 'var(--sell)' }}>
              {up ? '▲' : '▼'} {Math.abs(ticker.changePct).toFixed(2)}%
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 px-4 pb-28">
        {tab === 'panel' && <Panel />}
        {tab === 'price' && <Price />}
        {tab === 'alerts' && <Alerts />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-center pb-[max(env(safe-area-inset-bottom),12px)]">
        <div
          className="flex gap-1 rounded-2xl p-1.5"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
        >
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: active ? 'var(--card-hi)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--muted)',
                }}
              >
                <span className="text-base">{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
