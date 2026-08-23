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
  buy: number
  total: number
  buyFrac: number
  today: Record<string, ConsensusRate> // '30' | '90' | '180'
  curve90: { thr: number; prob: number | null; n: number }[]
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
