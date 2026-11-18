// Llamada a `aplicar_ops` (PLAN §4.3) y clasificación de su resultado (PLAN §5.2).
//
// Tres clases de fallo, que el escritor trata distinto:
//  - `red`: no se sabe si el servidor llegó a aplicar (TypeError, AbortError/timeout, 502-504). Se puede reenviar:
//    el `op_id` es idempotente.
//  - `rechazo`: el servidor respondió con un error PostgREST con código SQLSTATE. No se encola.
//  - `no_aplicado`: todo lo demás (401, 429, otros 5xx, 4xx sin SQLSTATE). La op no quedó registrada y se puede reenviar.
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export interface OpEnviada {
  op_id: string
  tipo: string
  datos: unknown
}

export type StatusOp = 'ok' | 'ya_aplicada' | 'revision' | 'error'

export interface ResultadoOp {
  op_id: string
  status: StatusOp
  resultado?: unknown
  error?: { codigo: string; mensaje: string }
}

export interface RespuestaAplicar {
  detener_cola: boolean
  resultados: ResultadoOp[]
}

export type RespuestaApi =
  | { clase: 'ok'; respuesta: RespuestaAplicar }
  | { clase: 'red' }
  | { clase: 'rechazo'; codigo: string; mensaje: string }
  | { clase: 'no_aplicado'; http?: number; mensaje: string }

/** Puerto del servidor para el escritor. Puede lanzar (TypeError, AbortError): el escritor lo trata como red. */
export interface OpsApi {
  aplicar(ops: OpEnviada[], signal?: AbortSignal): Promise<RespuestaApi>
}

const esquemaRespuesta = z.object({
  detener_cola: z.boolean().optional().default(false),
  resultados: z.array(
    z.object({
      op_id: z.string(),
      status: z.enum(['ok', 'ya_aplicada', 'revision', 'error']),
      resultado: z.unknown().optional(),
      error: z.object({ codigo: z.string(), mensaje: z.string() }).optional(),
    }),
  ),
})

interface ErrorRpc {
  message?: string
  code?: string
}

/** SQLSTATE: 5 caracteres alfanuméricos (los códigos propios de PostgREST son `PGRSTnnn`, de 8). */
const RE_SQLSTATE = /^[0-9A-Z]{5}$/

/** Clasifica lo que devuelve `supabase.rpc` (o lo que lanza `fetch`). Pura: se prueba sin red. */
export function clasificarRespuestaRpc(r: { data: unknown; error: ErrorRpc | null; status: number }): RespuestaApi {
  const { data, error, status } = r
  if (!error) {
    const p = esquemaRespuesta.safeParse(data)
    if (!p.success) return { clase: 'no_aplicado', http: status, mensaje: 'Respuesta inesperada del servidor' }
    return { clase: 'ok', respuesta: p.data as RespuestaAplicar }
  }
  const mensaje = error.message ?? 'Error del servidor'
  const codigo = error.code ?? ''
  // Sin respuesta HTTP (fetch lanzó TypeError o AbortError; postgrest-js lo convierte en error con status 0).
  if (status === 0 || /^(TypeError|AbortError)/.test(mensaje) || /Failed to fetch|NetworkError|aborted/i.test(mensaje)) {
    return { clase: 'red' }
  }
  if (status >= 502 && status <= 504) return { clase: 'red' }
  if (status === 401 || status === 429 || status >= 500) return { clase: 'no_aplicado', http: status, mensaje }
  if (RE_SQLSTATE.test(codigo)) return { clase: 'rechazo', codigo, mensaje }
  return { clase: 'no_aplicado', http: status, mensaje }
}

export function crearOpsApi(cliente: SupabaseClient): OpsApi {
  return {
    async aplicar(ops, signal) {
      const llamada = cliente.rpc('aplicar_ops', { ops })
      const { data, error, status } = await (signal ? llamada.abortSignal(signal) : llamada)
      return clasificarRespuestaRpc({ data, error, status })
    },
  }
}
