import type { SupabaseClient } from '@supabase/supabase-js'
import { ErrorPull, type PullApi, type RespuestaSyncPull } from '../sync/puller'

const TIEMPO_MAXIMO_MS = 20_000

/** `sync_pull` por RPC. Distingue fallo de red (sin respuesta, 502-504, timeout) de rechazo del servidor. */
export function crearPullApi(cliente: SupabaseClient): PullApi {
  return {
    async pull(desde) {
      const control = new AbortController()
      const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS)
      try {
        const { data, error, status } = await cliente
          .rpc('sync_pull', { desde })
          .abortSignal(control.signal)
        if (error) {
          // supabase-js devuelve los fallos de fetch como error sin código SQLSTATE/PostgREST.
          const sinRespuesta = !error.code || status === 0 || (status >= 502 && status <= 504)
          throw new ErrorPull(sinRespuesta ? 'red' : 'rechazo', error.message)
        }
        return data as RespuestaSyncPull
      } catch (e) {
        if (e instanceof ErrorPull) throw e
        throw new ErrorPull('red', e instanceof Error ? e.message : String(e))
      } finally {
        clearTimeout(reloj)
      }
    },
  }
}
