import { useEffect, useMemo, useState } from 'react'
import { enablePush } from '../lib/push'
import { supabase } from '../lib/supabase'
import { useBtcPrice } from '../hooks/useBtcPrice'
import { suggestLevels } from '../lib/levels'
import { fmtUsd } from '../lib/ui'
import type { PriceAlert } from '../lib/types'

// Busca o SW novo e recarrega — garante pegar o último deploy sem reinstalar.
async function updateApp() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } finally {
    location.reload()
  }
}

export default function Alerts() {
  const [msg, setMsg] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const ticker = useBtcPrice()
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [closes, setCloses] = useState<number[]>([])
  const [input, setInput] = useState('')

  const onEnable = async () => {
    setBusy(true)
    const r = await enablePush()
    setMsg(r.msg)
    setBusy(false)
  }

  const loadAlerts = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('active', true)
      .order('target', { ascending: false })
    if (data) setAlerts(data as PriceAlert[])
  }

  useEffect(() => {
    loadAlerts()
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase
        .from('price_history')
        .select('close')
        .order('date', { ascending: false })
        .limit(400)
      if (data) setCloses([...data].reverse().map((d) => d.close))
    })()
  }, [])

  const price = ticker?.price ?? null

  const addAlert = async (target: number, direction: 'above' | 'below', note: string | null) => {
    if (!supabase || !Number.isFinite(target)) return
    const { error } = await supabase.from('price_alerts').insert({ target, direction, note })
    if (!error) {
      setInput('')
      loadAlerts()
    }
  }

  const removeAlert = async (id: number) => {
    if (!supabase) return
    await supabase.from('price_alerts').delete().eq('id', id)
    loadAlerts()
  }

  const onManualAdd = () => {
    const target = Number(input.replace(/[^\d.]/g, ''))
    if (!target || !price) return
    // Direção automática: alvo acima do preço = alerta de subida, senão de queda.
    addAlert(target, target >= price ? 'above' : 'below', null)
  }

  const suggestions = useMemo(
    () => (price ? suggestLevels(closes, price) : []),
    [closes, price],
  )
  // Não sugerir nível que já virou alarme.
  const openSuggestions = suggestions.filter(
    (s) => !alerts.some((a) => Math.abs(a.target - s.price) / s.price < 0.005),
  )

  return (
    <div className="flex flex-col gap-4 pt-1">
      <section className="card px-4 py-4">
        <h2 className="text-base font-semibold">Notificações</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Push quando um indicador (ou o composto) muda de estado — e quando um alarme de preço é atingido.
        </p>
        <button
          onClick={onEnable}
          disabled={busy}
          className="mt-4 w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
          style={{ background: 'var(--btc)', color: '#0a0e17' }}
        >
          {busy ? 'Ativando…' : '🔔 Ativar notificações'}
        </button>
        {msg && (
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            {msg}
          </p>
        )}
      </section>

      {/* Alarmes de preço */}
      <section className="card px-4 py-4">
        <h2 className="text-base font-semibold">🎯 Alarmes de preço</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Avisa quando o BTC atinge o valor. {price ? `Agora: ${fmtUsd(price)}.` : ''}
        </p>

        {!supabase ? (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            Supabase não configurado — alarmes indisponíveis.
          </p>
        ) : (
          <>
            <div className="mt-3 flex gap-2">
              <div
                className="flex flex-1 items-center rounded-xl px-3"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
              >
                <span className="text-sm" style={{ color: 'var(--muted)' }}>$</span>
                <input
                  inputMode="decimal"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onManualAdd()}
                  placeholder="71000"
                  className="w-full bg-transparent px-2 py-2.5 text-sm tabular outline-none"
                  style={{ color: 'var(--text)' }}
                />
              </div>
              <button
                onClick={onManualAdd}
                disabled={!input || !price}
                className="rounded-xl px-4 text-sm font-bold disabled:opacity-40"
                style={{ background: 'var(--card-hi)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                Criar
              </button>
            </div>

            {/* Sugestões de suporte/resistência */}
            {openSuggestions.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Sugestões
                </p>
                <div className="flex flex-col gap-2">
                  {openSuggestions.map((s) => {
                    const tone = s.kind === 'support' ? 'var(--buy)' : 'var(--sell)'
                    return (
                      <button
                        key={s.label}
                        onClick={() => addAlert(s.price, s.direction, `${s.label} · ${s.kind === 'support' ? 'compra' : 'venda'}`)}
                        className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left"
                        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                      >
                        <div>
                          <div className="text-sm font-semibold tabular" style={{ color: 'var(--text)' }}>
                            {fmtUsd(s.price)}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                            {s.label} · {s.kind === 'support' ? 'compra' : 'venda'}
                          </div>
                        </div>
                        <span className="text-lg font-bold" style={{ color: tone }}>
                          {s.kind === 'support' ? '↓' : '↑'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Alarmes ativos */}
            {alerts.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Ativos
                </p>
                <div className="flex flex-col gap-2">
                  {alerts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5"
                      style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="text-base font-bold"
                          style={{ color: a.direction === 'above' ? 'var(--sell)' : 'var(--buy)' }}
                        >
                          {a.direction === 'above' ? '↑' : '↓'}
                        </span>
                        <div>
                          <div className="text-sm font-semibold tabular">{fmtUsd(a.target)}</div>
                          {a.note && (
                            <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                              {a.note}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeAlert(a.id)}
                        className="rounded-lg px-2 py-1 text-xs"
                        style={{ color: 'var(--muted)' }}
                        aria-label="Remover alarme"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card px-4 py-4 text-xs" style={{ color: 'var(--muted)' }}>
        <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>
          📱 iPhone: para receber push
        </p>
        <p className="leading-relaxed">
          Abra no Safari → botão Compartilhar → <b style={{ color: 'var(--text)' }}>Adicionar à Tela de Início</b>.
          Push no iOS só funciona com o app instalado, não na aba do Safari.
        </p>
      </section>

      <button
        onClick={updateApp}
        className="w-full rounded-xl py-2.5 text-sm font-medium"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}
      >
        ↻ Atualizar app
      </button>

      <section
        className="rounded-2xl px-4 py-3 text-xs leading-relaxed"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
      >
        Este app é apoio à decisão baseado em frequências históricas de amostra pequena.{' '}
        <b style={{ color: 'var(--text)' }}>Não é conselho financeiro.</b>
      </section>
    </div>
  )
}
