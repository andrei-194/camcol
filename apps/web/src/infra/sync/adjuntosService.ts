// Fotos locales y su subida posterior (RF-SYN-09, PLAN §5.1).
//
// Ciclo de `adjuntos_locales.estado`:
//   local      guardada comprimida en el teléfono; su op principal aún no se aplica (o no se ha intentado subir)
//   subiendo   subida a Storage en curso (si la app se cierra aquí, se trata como `local`)
//   subida     ya está en Storage; falta la op `adjunto.vincular`
//   vinculada  terminó; se borra el blob para liberar espacio
//   error      falló la subida o el servidor rechazó el vínculo; `error` guarda el motivo. Reintento MANUAL
//              (el siguiente `subirListas`, que solo dispara el usuario: regla 5).
// `path` en Storage: `<entidad>/<entidad_id>/<uuid del adjunto>.<webp|jpg>`; único y estable entre reintentos.
// Una foto solo se sube cuando su op principal (`op_id`) ya no está en la outbox (aplicada). Si la subida falla,
// el registro principal sigue siendo válido: aquí no se toca nada de él.
import type { AdjuntoLocal, CaminoDB } from '../db/db'
import { uuidV7 } from '../../lib/uuid'
import { comprimirImagen, type ImagenComprimida } from '../../lib/imagen'
import type { OpsApi } from '../supabase/opsApi'
import { enviarConTimeout, resultadoDe, TIMEOUT_MS } from './writer'

export type EntidadAdjunto = 'pago' | 'gasto' | 'recepcion' | 'orden_compra' | 'tercero'

/** Puerto de Storage: lanza si falla. */
export interface AlmacenSoportes {
  subir(path: string, blob: Blob, mime: string): Promise<void>
}

export interface ResumenAdjuntos {
  vinculadas: number
  /** Subida o vínculo fallido (quedan reintentables, salvo rechazo del servidor). */
  fallidas: number
  /** Su op principal aún no está aplicada. */
  esperando: number
}

export interface OpcionesAdjuntos {
  db: CaminoDB
  api: OpsApi
  almacen: AlmacenSoportes
  comprimir?: (archivo: Blob) => Promise<Pick<ImagenComprimida, 'blob' | 'mime' | 'ancho' | 'alto'>>
  nuevoId?: () => string
  timeoutMs?: number
}

export function crearAdjuntosService(opciones: OpcionesAdjuntos) {
  const { db, api, almacen, comprimir = comprimirImagen, nuevoId = uuidV7, timeoutMs = TIMEOUT_MS } = opciones

  async function procesar(a: AdjuntoLocal): Promise<'vinculada' | 'fallida'> {
    const path = a['path'] as string
    const mime = a['mime'] as string
    if (a.estado !== 'subida') {
      await db.adjuntos_locales.update(a.id, { estado: 'subiendo' })
      try {
        await almacen.subir(path, a['blob'] as Blob, mime)
      } catch (e) {
        await db.adjuntos_locales.update(a.id, { estado: 'error', error: { codigo: 'SUBIDA', mensaje: e instanceof Error ? e.message : 'No se pudo subir la foto' } })
        return 'fallida'
      }
      await db.adjuntos_locales.update(a.id, { estado: 'subida', error: undefined })
    }
    // El id del adjunto es también el op_id: reenviar el vínculo es idempotente.
    const op = { op_id: a.id, tipo: 'adjunto.vincular', datos: { id: a.id, entidad: a['entidad'], entidad_id: a['entidad_id'], path, mime } }
    const resp = await enviarConTimeout(api, op, timeoutMs)
    if (resp.clase === 'ok') {
      const r = resultadoDe(resp, a.id)
      if (r.status === 'ok' || r.status === 'ya_aplicada') {
        await db.adjuntos_locales.update(a.id, { estado: 'vinculada', blob: undefined, error: undefined })
        return 'vinculada'
      }
      const error = r.error ?? { codigo: 'ERROR_INTERNO', mensaje: 'El servidor no pudo vincular la foto' }
      await db.adjuntos_locales.update(a.id, { estado: 'error', error })
      return 'fallida'
    }
    if (resp.clase === 'rechazo') {
      await db.adjuntos_locales.update(a.id, { estado: 'error', error: { codigo: resp.codigo, mensaje: resp.mensaje } })
    }
    return 'fallida' // red / no aplicado: se queda en `subida` y se reintenta
  }

  return {
    /** Comprime y guarda en el teléfono. No sube ni llama al servidor. `opId` es el de la op principal. */
    async guardar(p: { opId: string; entidad: EntidadAdjunto; entidadId: string; archivo: Blob }): Promise<AdjuntoLocal> {
      const img = await comprimir(p.archivo)
      const id = nuevoId()
      const fila: AdjuntoLocal = {
        id,
        op_id: p.opId,
        estado: 'local',
        entidad: p.entidad,
        entidad_id: p.entidadId,
        path: `${p.entidad}/${p.entidadId}/${id}.${img.mime === 'image/webp' ? 'webp' : 'jpg'}`,
        mime: img.mime,
        blob: img.blob,
        ancho: img.ancho,
        alto: img.alto,
        created_at: new Date().toISOString(),
      }
      await db.adjuntos_locales.put(fila)
      return fila
    },

    /** Sube y vincula todo lo que esté listo (op aplicada). Solo lo invoca una acción explícita del usuario. */
    async subirListas(): Promise<ResumenAdjuntos> {
      const resumen: ResumenAdjuntos = { vinculadas: 0, fallidas: 0, esperando: 0 }
      const filas = (await db.adjuntos_locales.toArray()).filter((a) => a.estado !== 'vinculada')
      filas.sort((x, y) => String(x['created_at'] ?? '').localeCompare(String(y['created_at'] ?? '')))
      for (const a of filas) {
        if (a.op_id && (await db.outbox.get(a.op_id))) {
          resumen.esperando++
          continue
        }
        if ((await procesar(a)) === 'vinculada') resumen.vinculadas++
        else resumen.fallidas++
      }
      return resumen
    },
  }
}

export type AdjuntosService = ReturnType<typeof crearAdjuntosService>
