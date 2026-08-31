// Espelha o schema Postgres (supabase/migrations/0001_init.sql).
export type Signal = 'buy' | 'sell' | 'neutral'

export type IndicatorSnapshot = {
  date: string
  indicator_key: string
  raw_value: number | null
  cheapness: number | null
  signal: Signal
  source: string | null
}

export type ConsensusRate = { prob: number | null; n: number }
export type Consensus = {
  total: number
  buy: number
  sell: number
  buy50: ConsensusRate // ≥50% em compra → freq. de alta em 90d
  sell50: ConsensusRate // ≥50% em venda → freq. de queda em 90d
}

export type CompositeSnapshot = {
  date: string
  composite: number | null
  votes_buy: number
  votes_sell: number
  votes_neutral: number
  prob_up_30d: number | null
  prob_up_90d: number | null
  prob_up_180d: number | null
  sample_30d: number | null
  sample_90d: number | null
  sample_180d: number | null
  consensus?: Consensus | null
}

export type PricePoint = { date: string; close: number }

export type SignalEvent = {
  id: number
  date: string
  scope: string
  key: string
  old_signal: string | null
  new_signal: string | null
  created_at: string
}

export type PriceAlert = {
  id: number
  target: number
  direction: 'above' | 'below'
  note: string | null
  active: boolean
  triggered_at: string | null
  created_at: string
}
