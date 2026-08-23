import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Pode ser null antes do schema/env estarem prontos — a UI degrada com aviso
// em vez de quebrar. O app nunca chama fontes pagas ao vivo; só lê daqui.
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null
