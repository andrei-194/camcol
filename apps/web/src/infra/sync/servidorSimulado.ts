// Servidor simulado de `aplicar_ops` para pruebas del escritor: aplica de verdad (idempotente por op_id) y
// permite simular red caída, respuesta perdida, 401/429/5xx y rechazos.
import type { OpEnviada, OpsApi, RespuestaApi, ResultadoOp } from '../supabase/opsApi'

export type Manejador = (op: OpEnviada) => Omit<ResultadoOp, 'op_id'>

export interface ServidorSimulado extends OpsApi {
  /** Respuestas forzadas de la llamada completa (se consumen en orden, antes de aplicar nada). */
  forzar: RespuestaApi[]
  /** Si es true, la próxima llamada aplica las ops y luego pierde la respuesta (TypeError). */
  perderRespuesta: boolean
  /** Si es true, toda llamada falla por red. */
  caido: boolean
  /** Resultado por tipo; por defecto `ok` con `{ id: 'x' }`. */
  manejadores: Record<string, Manejador>
  /** op_id → resultado de las ops aplicadas (el `sync_ops` del servidor). */
  aplicadas: Map<string, unknown>
  /** Cada llamada recibida (para comprobar que nada se envía solo). */
  llamadas: OpEnviada[][]
}

export function crearServidorSimulado(): ServidorSimulado {
  const s: ServidorSimulado = {
    forzar: [],
    perderRespuesta: false,
    caido: false,
    manejadores: {},
    aplicadas: new Map(),
    llamadas: [],
    async aplicar(ops, signal) {
      s.llamadas.push(ops)
      if (s.caido) throw new TypeError('Failed to fetch')
      const forzada = s.forzar.shift()
      if (forzada) return forzada
      const resultados: ResultadoOp[] = []
      let detener = false
      for (const op of ops) {
        if (s.aplicadas.has(op.op_id)) {
          resultados.push({ op_id: op.op_id, status: 'ya_aplicada', resultado: s.aplicadas.get(op.op_id) })
          continue
        }
        const manejador = s.manejadores[op.tipo] ?? (() => ({ status: 'ok' as const, resultado: { id: 'x' } }))
        const r = manejador(op)
        if (r.status === 'ok') s.aplicadas.set(op.op_id, r.resultado)
        if (r.status === 'revision' || r.status === 'error') detener = true
        resultados.push({ op_id: op.op_id, ...r })
      }
      if (s.perderRespuesta) {
        s.perderRespuesta = false
        throw new TypeError('Failed to fetch')
      }
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return { clase: 'ok', respuesta: { detener_cola: detener, resultados } }
    },
  }
  return s
}
