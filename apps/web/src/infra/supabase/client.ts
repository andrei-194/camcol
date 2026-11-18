import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cliente: SupabaseClient | undefined

/** Cliente único de Supabase. Usa solo la anon key (pública); la RLS protege los datos. */
export function obtenerClienteSupabase(): SupabaseClient {
  if (cliente) return cliente
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).')
  }
  cliente = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return cliente
}
