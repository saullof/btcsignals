import { useState } from 'react'
import { enablePush } from '../lib/push'

export default function Alerts() {
  const [msg, setMsg] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const onEnable = async () => {
    setBusy(true)
    const r = await enablePush()
    setMsg(r.msg)
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <section className="card px-4 py-4">
        <h2 className="text-base font-semibold">Notificações</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Push só quando um indicador (ou o composto) muda de estado — nunca o valor diário.
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

      <section className="card px-4 py-4 text-xs" style={{ color: 'var(--muted)' }}>
        <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>
          📱 iPhone: para receber push
        </p>
        <p className="leading-relaxed">
          Abra no Safari → botão Compartilhar → <b style={{ color: 'var(--text)' }}>Adicionar à Tela de Início</b>.
          Push no iOS só funciona com o app instalado, não na aba do Safari.
        </p>
      </section>

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
