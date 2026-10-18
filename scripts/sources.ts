// Auxiliares de fonte compartilhados pela ingestão e pelo snapshot de decisão.

// Indicadores vindos do CBBI (já 0..1, alto = topo).
export const CBBI_INDICATORS: { key: string; cbbi: string }[] = [
  { key: 'mvrv', cbbi: 'MVRV' },
  { key: 'puell', cbbi: 'Puell' },
  { key: 'rhodl', cbbi: 'RHODL' },
  { key: 'rupl', cbbi: 'RUPL' },
  { key: 'reserve_risk', cbbi: 'ReserveRisk' },
  { key: 'pi_cycle', cbbi: 'PiCycle' },
  { key: '2y_ma', cbbi: '2YMA' },
  { key: 'cbbi', cbbi: 'Confidence' },
]

export const tsToDate = (unixSec: string | number): string => new Date(Number(unixSec) * 1000).toISOString().slice(0, 10)

export async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

// Série CBBI {unixSec: valor} -> Map<dateStr, número>.
export function seriesToMap(series: Record<string, number>): Map<string, number> {
  const m = new Map<string, number>()
  for (const [ts, v] of Object.entries(series)) {
    if (v != null && Number.isFinite(v)) m.set(tsToDate(ts), v)
  }
  return m
}
