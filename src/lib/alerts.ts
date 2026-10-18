import { supabase } from './supabase'

// Cria um alarme de preço (tabela price_alerts). Usado pela aba Alertas e pela
// tabela de chances do Painel.
export async function createPriceAlert(
  target: number,
  direction: 'above' | 'below',
  note: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase não configurado.' }
  if (!Number.isFinite(target) || target <= 0) return { ok: false, error: 'Preço inválido.' }
  const { error } = await supabase.from('price_alerts').insert({ target, direction, note })
  return error ? { ok: false, error: error.message } : { ok: true }
}
