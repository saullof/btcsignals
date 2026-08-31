import { useEffect, useMemo, useState } from 'react'
import { enablePush } from '../lib/push'
import { supabase } from '../lib/supabase'
import { useBtcPrice } from '../hooks/useBtcPrice'
import { suggestLevels } from '../lib/levels'
import { fmtUsd, indicatorName, signalLabel } from '../lib/ui'
import type { PriceAlert, SignalEvent, Signal } from '../lib/types'

// Busca o SW novo e recarrega — garante pegar o último deploy sem reinstalar.
async function updateApp() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } finally {
    location.reload()
  }
}

type Notif = { id: string; ts: string; text: string; tone: Signal | 'price' }

// Tempo relativo curto em pt: "agora", "há 3h", "há 2d".
function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)}min`
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`
  return `há ${Math.floor(s / 86400)}d`
}

function eventToNotif(e: SignalEvent): Notif {
  const side = signalLabel[(e.new_signal ?? 'neutral') as Signal]
  const text =
    e.scope === 'consensus'
      ? `🔥 5+ indicadores em ${side}`
      : e.scope === 'composite'
        ? `Composto entrou em zona de ${side}`
        : `${indicatorName[e.key] ?? e.key} entrou em ${side}`
  return { id: `ev-${e.id}`, ts: e.created_at, text, tone: (e.new_signal ?? 'neutral') as Signal }
}

// Itens dispensados ficam por dispositivo (localStorage) — o histórico é
// compartilhado no banco, então não apagamos a linha, só escondemos aqui.
function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem('notif_dismissed') ?? '[]')
  } catch {
    return []
  }
}

function alertToNotif(a: PriceAlert): Notif {
  const verb = a.direction === 'above' ? 'subiu para' : 'caiu para'
  return {
    id: `al-${a.id}`,
    ts: a.triggered_at!,
    text: `🎯 BTC ${verb} ${fmtUsd(a.target)}${a.note ? ` — ${a.note}` : ''}`,
    tone: 'price',
  }
}

export default function Alerts() {
  const [msg, setMsg] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const ticker = useBtcPrice()
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [closes, setCloses] = useState<number[]>([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<Notif[]>([])
  const [lastSeen, setLastSeen] = useState<string>('')

  const loadHistory = async () => {
    if (!supabase) return
    let prev = ''
    try {
      prev = localStorage.getItem('notif_last_seen') ?? ''
    } catch {
      /* modo privado bloqueia localStorage — segue sem "novo" */
    }
    setLastSeen(prev)
    const [ev, al] = await Promise.all([
      supabase.from('signal_events').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('price_alerts').select('*').not('triggered_at', 'is', null).order('triggered_at', { ascending: false }).limit(20),
    ])
    const dismissed = readDismissed()
    const items = [
      ...((ev.data ?? []) as SignalEvent[]).map(eventToNotif),
      ...((al.data ?? []) as PriceAlert[]).map(alertToNotif),
    ]
      .filter((n) => !dismissed.includes(n.id))
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 20)
    setHistory(items)
    if (items.length) {
      try {
        localStorage.setItem('notif_last_seen', items[0].ts)
      } catch {
        /* idem */
      }
    }
  }

  const onEnable = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await enablePush()
      setMsg(r.msg)
    } catch (e) {
      // Sem isso, qualquer exceção (SW não pronto, subscribe falhou) morria calada.
      setMsg('Erro: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
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
    loadHistory()
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

  const dismissNotif = (id: string) => {
    setHistory((h) => h.filter((n) => n.id !== id))
    try {
      const d = readDismissed()
      if (!d.includes(id)) localStorage.setItem('notif_dismissed', JSON.stringify([...d, id].slice(-200)))
    } catch {
      /* localStorage indisponível — some só nesta sessão */
    }
  }

  const unread = history.filter((n) => n.ts > lastSeen).length

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
                  className="w-full bg-transparent px-2 py-2.5 tabular outline-none"
                  style={{ color: 'var(--text)', fontSize: 16 }}
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

      {/* Histórico de notificações */}
      {supabase && (
        <section className="card px-4 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Histórico</h2>
            {unread > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ background: 'var(--btc)', color: '#0a0e17' }}
              >
                {unread} novo{unread > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {history.length === 0 ? (
            <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
              Nenhuma notificação ainda.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {history.map((n) => {
                const isNew = n.ts > lastSeen
                const dot =
                  n.tone === 'price' ? 'var(--btc)' : n.tone === 'buy' ? 'var(--buy)' : n.tone === 'sell' ? 'var(--sell)' : 'var(--neutral)'
                return (
                  <div
                    key={n.id}
                    className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: isNew ? dot : 'transparent', border: isNew ? 'none' : '1px solid var(--border)' }} />
                    <div className="flex-1">
                      <div className="text-sm" style={{ color: 'var(--text)' }}>{n.text}</div>
                      <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{ago(n.ts)}</div>
                    </div>
                    <button
                      onClick={() => dismissNotif(n.id)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs"
                      style={{ color: 'var(--muted)' }}
                      aria-label="Remover notificação"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      <button
        onClick={updateApp}
        className="w-full rounded-xl py-2.5 text-sm font-medium"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}
      >
        ↻ Atualizar app
      </button>
    </div>
  )
}
