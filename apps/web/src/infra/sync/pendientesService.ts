// Subida de pendientes (PLAN §5.2). Solo se invoca desde la UI (botón "Subir"): PROHIBIDO el reintento
// automático o Background Sync de escrituras (regla 5).
import type { CaminoDB } from '../db/db'
import type { OpsApi } from '../supabase/opsApi'
import type { AdjuntosService, ResumenAdjuntos } from './adjuntosService'
import { crearOutboxRepo } from './outboxRepo'
import { candidatosDe, enviarConTimeout, resultadoDe, TIMEOUT_MS } from './writer'

export type StatusSubida = 'ok' | 'ya_aplicada' | 'revision' | 'error' | 'red' | 'no_aplicado'

export interface ResultadoSubida {
  op_id: string
  status: StatusSubida
  error?: { codigo: string; mensaje: string }
  candidatos?: unknown[]
}

export interface ResumenSubida {
  resultados: ResultadoSubida[]
  /** `true` si quedaron ops sin intentar porque una anterior no salió ok/ya_aplicada. */
  detenida: boolean
  /** Resultado de la subida de fotos (solo si se inyectó el servicio y hubo conexión). */
  adjuntos?: ResumenAdjuntos
}

export interface Resolucion {
  tipo: 'usar_existente' | 'crear_igual'
  tercero_id?: string
}

export function crearPendientesService(opciones: { db: CaminoDB; api: OpsApi; timeoutMs?: number; adjuntos?: Pick<AdjuntosService, 'subirListas'> }) {
  const { db, api, timeoutMs = TIMEOUT_MS, adjuntos } = opciones
  const outbox = crearOutboxRepo(db)

  async function subirOps(opIds: string[]): Promise<ResumenSubida> {
      const filas = await outbox.porIds(opIds)
      const resultados: ResultadoSubida[] = []
      for (const fila of filas) {
        if (fila.estado === 'revision') {
          resultados.push({ op_id: fila.op_id, status: 'revision', candidatos: candidatosDe(fila.resultado) })
          return { resultados, detenida: true }
        }
        const resp = await enviarConTimeout(api, fila, timeoutMs)
        if (resp.clase === 'red') {
          resultados.push({ op_id: fila.op_id, status: 'red' })
          return { resultados, detenida: true }
        }
        if (resp.clase === 'no_aplicado') {
          resultados.push({ op_id: fila.op_id, status: 'no_aplicado', error: { codigo: String(resp.http ?? ''), mensaje: resp.mensaje } })
          return { resultados, detenida: true }
        }
        if (resp.clase === 'rechazo') {
          const error = { codigo: resp.codigo, mensaje: resp.mensaje }
          await outbox.marcarError(fila.op_id, error)
          resultados.push({ op_id: fila.op_id, status: 'error', error })
          return { resultados, detenida: true }
        }
        const r = resultadoDe(resp, fila.op_id)
        if (r.status === 'ok' || r.status === 'ya_aplicada') {
          await outbox.completar(fila.op_id)
          resultados.push({ op_id: fila.op_id, status: r.status })
          continue
        }
        if (r.status === 'revision') {
          await outbox.marcarRevision(fila.op_id, r.resultado)
          resultados.push({ op_id: fila.op_id, status: 'revision', candidatos: candidatosDe(r.resultado) })
        } else {
          const error = r.error ?? { codigo: 'ERROR_INTERNO', mensaje: 'El servidor rechazó la operación' }
          await outbox.marcarError(fila.op_id, error)
          resultados.push({ op_id: fila.op_id, status: 'error', error })
        }
        return { resultados, detenida: true }
      }
      return { resultados, detenida: resultados.length < opIds.length }
  }

  return {
    /**
     * Envía las ops indicadas de una en una, por `created_at`, y se detiene en la primera que no sea
     * ok/ya_aplicada. Las filas en `revision` no se envían hasta que se resuelvan: cuentan como parada.
     * Después, y solo si hubo conexión, sube las fotos cuya op ya está aplicada (RF-SYN-09). Un fallo de foto
     * no cambia el resultado de las ops. CONTRATO PARA LA UI: esta es la única vía de subida de fotos.
     */
    async subir(opIds: string[]): Promise<ResumenSubida> {
      const r = await subirOps(opIds)
      const sinRed = r.resultados.some((x) => x.status === 'red' || x.status === 'no_aplicado')
      if (adjuntos && !sinRed) r.adjuntos = await adjuntos.subirListas()
      return r
    },

    /**
     * Resolución de una revisión (no es edición del usuario): escribe `resolucion` dentro de `datos` (en una compra,
     * dentro de `proveedor_nuevo`) y devuelve la fila a `pendiente`. La fila local `_pendiente` se conserva.
     */
    async resolver(opId: string, resolucion: Resolucion): Promise<void> {
      const fila = await outbox.obtener(opId)
      if (!fila) throw new Error(`No existe la operación pendiente ${opId}`)
      const datos = { ...(fila.datos as Record<string, unknown>) }
      const anidado = datos['proveedor_nuevo'] ?? datos['cliente_nuevo']
      if (anidado && typeof anidado === 'object') {
        const clave = datos['proveedor_nuevo'] ? 'proveedor_nuevo' : 'cliente_nuevo'
        datos[clave] = { ...(anidado as object), resolucion }
      } else {
        datos['resolucion'] = resolucion
      }
      await db.outbox.update(opId, { datos, estado: 'pendiente', resultado: undefined, error: undefined })
    },
  }
}

export type PendientesService = ReturnType<typeof crearPendientesService>
