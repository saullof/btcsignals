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

// Explicação em português simples: o que mede + o que compra/venda significa.
export const indicatorDesc: Record<string, string> = {
  mvrv: 'Compara o preço atual com o preço médio que todos pagaram pelas moedas. Muito acima = mercado esticado (topo); perto ou abaixo = fundo. Verde quando bem baixo.',
  puell: 'Mede quanto os mineradores estão faturando vs a média de 1 ano. Faturamento altíssimo marcou topos; capitulação marcou fundos.',
  rhodl: 'Compara moedas movidas há pouco com moedas paradas há anos. Picos historicamente coincidiram com topos de ciclo.',
  rupl: 'Lucro ou prejuízo "no papel" da rede inteira — quão no lucro o mercado está. Euforia (quase todos no lucro) = topo; capitulação = fundo. É o parente do seu "% no lucro".',
  reserve_risk: 'Confiança dos holders de longo prazo em relação ao preço. Baixo = boa relação risco/retorno para acumular.',
  pi_cycle: 'Cruzamento de médias móveis que, no passado, marcou topos de ciclo com boa precisão.',
  '2y_ma': 'Preço dividido pela média móvel de 2 anos. Abaixo da média = zona histórica de compra; muito acima = zona de venda.',
  cbbi: 'Índice que junta ~9 métricas num só número (0–100) de "quão perto do topo estamos". Entra como um composto independente.',
  fng: 'Termômetro de sentimento (0–100). É contrário: medo extremo costuma ser compra; ganância extrema, venda.',
  mayer: 'Preço dividido pela média de 200 dias. Abaixo de 0,8 foi historicamente barato; acima de 2,4, esticado.',
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

// USD compacto p/ volume: $1.23B, $45.6M, $12K.
export const fmtCompactUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${Math.round(n)}`
}

export const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n * 100)}%`

// Traduz o composto (0..1) numa zona em português comum.
export function zonaFromComposite(c: number): { label: string; tone: Signal } {
  if (c >= 0.75) return { label: 'muito barato (fundo de ciclo)', tone: 'buy' }
  if (c >= 0.6) return { label: 'barato', tone: 'buy' }
  if (c >= 0.4) return { label: 'neutro (meio-termo)', tone: 'neutral' }
  if (c >= 0.25) return { label: 'caro', tone: 'sell' }
  return { label: 'muito caro (topo de ciclo)', tone: 'sell' }
}

// Traduz uma probabilidade histórica numa frase.
export function probPhrase(p: number | null): string {
  if (p == null) return 'sem dados suficientes'
  if (p >= 0.7) return 'tendência forte de alta'
  if (p >= 0.58) return 'leve viés de alta'
  if (p >= 0.42) return 'quase um cara-ou-coroa'
  if (p >= 0.3) return 'leve viés de baixa'
  return 'tendência de baixa'
}

export const toneEmoji: Record<Signal, string> = { buy: '🟢', sell: '🔴', neutral: '🟡' }

// Arredonda sem lixo de float; até 2 casas.
export const fmtRaw = (n: number | null | undefined) =>
  n == null ? '—' : (Math.round(n * 100) / 100).toString()
