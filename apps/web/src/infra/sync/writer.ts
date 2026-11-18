// Escritor (PLAN §5.2): única ruta de escritura del cliente hacia `aplicar_ops` (regla 4).
//
//  1. Valida el payload con Zod.
//  2. Intenta enviar (AbortController, 8 s). ok/ya_aplicada → listo. revision → se devuelve a la UI (o queda en
//     outbox si el tipo admite offline). error o rechazo → ErrorDominio, NO se encola.
//  3. Fallo de red / no aplicado (401, 429, 5xx): solo si el tipo admite offline se encola (una transacción con las
//     filas locales `_pendiente` y la fila de outbox); si no, "Requiere conexión".
//
// Nada reintenta solo (regla 5): el reenvío es `pendientesService.subir`, invocado desde la UI.
import type { CaminoDB, OpOutbox } from '../db/db'
import { uuidV7 } from '../../lib/uuid'
import type { OpsApi, RespuestaApi, ResultadoOp } from '../supabase/opsApi'
import { crearOutboxRepo, type FilaLocal } from './outboxRepo'
import { TIPOS_OP } from './tiposOp'

export const TIMEOUT_MS = 8000

/** Rechazo del servidor o payload inválido: se muestra al usuario; no se encola. */
export class ErrorDominio extends Error {
  readonly codigo: string
  constructor(codigo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDominio'
    this.codigo = codigo
  }
}

/** La operación no admite offline y no hubo conexión (o el servidor no pudo aplicarla ahora). */
export class RequiereConexionError extends Error {
  constructor() {
    super('Requiere conexión')
    this.name = 'RequiereConexionError'
  }
}

export interface OpNueva {
  tipo: string
  datos: unknown
  /** Filas que la UI muestra con ⏳ mientras la op no se sube. Solo se escriben si la op se encola. */
  filasLocales?: FilaLocal[]
}

export type ResultadoCommit =
  | { estado: 'aplicada'; op_id: string; ya_aplicada: boolean; resultado: unknown }
  | {
      estado: 'encolada'
      op_id: string
      motivo: 'red' | 'sin_conexion' | 'no_aplicado'
      aviso?: string
      /** El servidor rechazó la sesión (401): pedir volver a entrar sin perder datos. */
      requiereLogin?: boolean
    }
  | { estado: 'revision'; op_id: string; candidatos: unknown[]; resultado: unknown; encolada: boolean }

export interface OpcionesEscritor {
  db: CaminoDB
  api: OpsApi
  timeoutMs?: number
  /** `navigator.onLine` es solo una pista (PLAN §5.2). */
  enLinea?: () => boolean
  nuevoId?: () => string
  ahora?: () => Date
}

/** Envía una op con timeout. Cualquier excepción (TypeError, AbortError) cuenta como fallo de red. */
export async function enviarConTimeout(api: OpsApi, op: OpOutbox | { op_id: string; tipo: string; datos: unknown }, timeoutMs: number): Promise<RespuestaApi> {
  const control = new AbortController()
  const t = setTimeout(() => control.abort(), timeoutMs)
  try {
    return await api.aplicar([{ op_id: op.op_id, tipo: op.tipo, datos: op.datos }], control.signal)
  } catch {
    return { clase: 'red' }
  } finally {
    clearTimeout(t)
  }
}

export function resultadoDe(resp: Extract<RespuestaApi, { clase: 'ok' }>, opId: string): ResultadoOp {
  const r = resp.respuesta.resultados.find((x) => x.op_id === opId) ?? resp.respuesta.resultados[0]
  return r ?? { op_id: opId, status: 'error', error: { codigo: 'ERROR_INTERNO', mensaje: 'Respuesta vacía del servidor' } }
}

export function candidatosDe(resultado: unknown): unknown[] {
  const c = (resultado as { candidatos?: unknown } | null | undefined)?.candidatos
  return Array.isArray(c) ? c : []
}

export function crearEscritor(opciones: OpcionesEscritor) {
  const { db, api, timeoutMs = TIMEOUT_MS, enLinea = () => (typeof navigator === 'undefined' ? true : navigator.onLine) } = opciones
  const nuevoId = opciones.nuevoId ?? uuidV7
  const ahora = opciones.ahora ?? (() => new Date())
  const outbox = crearOutboxRepo(db)

  async function encolar(op: OpOutbox, filas: FilaLocal[]) {
    await outbox.encolar(op, filas)
  }

  return {
    async commit(nueva: OpNueva): Promise<ResultadoCommit> {
      const def = TIPOS_OP[nueva.tipo]
      if (!def) throw new ErrorDominio('TIPO_DESCONOCIDO', `Tipo de operación desconocido: ${nueva.tipo}`)
      const valido = def.schema.safeParse(nueva.datos)
      if (!valido.success) {
        throw new ErrorDominio('DATOS_INVALIDOS', valido.error.issues.map((i) => `${i.path.join('.') || 'datos'}: ${i.message}`).join('; '))
      }

      const op: OpOutbox = {
        op_id: nuevoId(),
        tipo: nueva.tipo,
        datos: nueva.datos,
        estado: 'pendiente',
        created_at: ahora().toISOString(),
      }
      const filas = nueva.filasLocales ?? []

      let resp: RespuestaApi
      let sinConexion = false
      if (!enLinea()) {
        sinConexion = true
        resp = { clase: 'red' }
      } else {
        resp = await enviarConTimeout(api, op, timeoutMs)
      }

      switch (resp.clase) {
        case 'ok': {
          const r = resultadoDe(resp, op.op_id)
          if (r.status === 'ok' || r.status === 'ya_aplicada') {
            await outbox.completar(op.op_id) // por si hubiera marcas o fila previas
            return { estado: 'aplicada', op_id: op.op_id, ya_aplicada: r.status === 'ya_aplicada', resultado: r.resultado }
          }
          if (r.status === 'revision') {
            if (def.admiteOffline) await encolar({ ...op, estado: 'revision', resultado: r.resultado }, filas)
            return { estado: 'revision', op_id: op.op_id, candidatos: candidatosDe(r.resultado), resultado: r.resultado, encolada: def.admiteOffline }
          }
          throw new ErrorDominio(r.error?.codigo ?? 'ERROR_INTERNO', r.error?.mensaje ?? 'El servidor rechazó la operación')
        }
        case 'rechazo':
          throw new ErrorDominio(resp.codigo, resp.mensaje)
        case 'red':
        case 'no_aplicado': {
          if (!def.admiteOffline) throw new RequiereConexionError()
          await encolar(op, filas)
          if (resp.clase === 'red') {
            return { estado: 'encolada', op_id: op.op_id, motivo: sinConexion ? 'sin_conexion' : 'red' }
          }
          const sesion = resp.http === 401
          return {
            estado: 'encolada',
            op_id: op.op_id,
            motivo: 'no_aplicado',
            requiereLogin: sesion || undefined,
            aviso: sesion
              ? 'Tu sesión venció. Vuelve a entrar; lo guardado en este teléfono se conserva.'
              : 'El servidor no pudo aplicarlo ahora. Quedó guardado en este teléfono para subirlo después.',
          }
        }
      }
    },
  }
}

export type Escritor = ReturnType<typeof crearEscritor>
