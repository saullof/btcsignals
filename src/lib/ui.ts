import type { Signal } from './types'

export const signalColor: Record<Signal, string> = {
  buy: 'var(--buy)',
  sell: 'var(--sell)',
  neutral: 'var(--neutral)',
}

export const signalLabel: Record<Signal, string> = {
  buy: 'COMPRA',
  sell: 'VENDA',
  neutral: 'INCERTO',
}

// Fundo levemente tingido pra chips/cards por sinal.
export const signalTint: Record<Signal, string> = {
  buy: 'rgba(22,199,132,0.14)',
  sell: 'rgba(234,57,67,0.14)',
  neutral: 'rgba(107,118,136,0.14)',
}

// Nomes legíveis dos indicadores (o key técnico fica pra lógica).
export const indicatorName: Record<string, string> = {
  mvrv: 'MVRV Z-Score',
  puell: 'Puell Multiple',
  rhodl: 'RHODL Ratio',
  rupl: 'RUPL / NUPL',
  reserve_risk: 'Reserve Risk',
  pi_cycle: 'Pi Cycle Top',
  '2y_ma': '2Y MA Multiplier',
  cbbi: 'CBBI Confidence',
  fng: 'Fear & Greed',
  mayer: 'Mayer Multiple',
}

export const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n * 100)}%`

// Arredonda sem lixo de float; até 2 casas.
export const fmtRaw = (n: number | null | undefined) =>
  n == null ? '—' : (Math.round(n * 100) / 100).toString()
