// Repositorio de la outbox (PLAN §5.1). Ciclo de vida: nace `pendiente`; ok/ya_aplicada la borran y quitan
// `_pendiente`; error → `error`; revision → `revision`. No existe `bloqueada` (D-009).
import type { CaminoDB, Fila, OpOutbox } from '../db/db'
import { TABLAS_CON_PENDIENTE, type TablaLocal } from './tiposOp'

export interface FilaLocal {
  tabla: TablaLocal
  fila: Fila
}

type Datos = Record<string, unknown>
const objeto = (v: unknown): Datos => (v && typeof v === 'object' ? (v as Datos) : {})

/**
 * Si la op creaba un tercero nuevo y el usuario resolvió «usar el existente», devuelve el id provisional (que nunca
 * llegó al servidor) y el del tercero existente que lo reemplaza.
 */
function sustitucionDeTercero(op: OpOutbox): { provisional: string; existente: string } | null {
  const d = objeto(op.datos)
  const nuevo = op.tipo === 'tercero.crear' ? d : objeto(d['proveedor_nuevo'] ?? d['cliente_nuevo'])
  const resolucion = objeto(nuevo['resolucion'])
  const provisional = nuevo['id']
  const existente = resolucion['tercero_id']
  return resolucion['tipo'] === 'usar_existente' && typeof provisional === 'string' && typeof existente === 'string' ? { provisional, existente } : null
}

export function crearOutboxRepo(db: CaminoDB) {
  const tablas = () => TABLAS_CON_PENDIENTE.map((t) => db.table<Fila>(t))

  return {
    /** Una sola transacción: filas locales con `_pendiente = op_id` + fila de outbox. */
    async encolar(op: OpOutbox, filas: FilaLocal[] = []): Promise<void> {
      await db.transaction('rw', [db.outbox, ...tablas()], async () => {
        for (const { tabla, fila } of filas) await db.table<Fila>(tabla).put({ ...fila, _pendiente: op.op_id })
        await db.outbox.put(op)
      })
    },

    /**
     * Op aplicada en el servidor: borra la fila de outbox (si existe) y quita `_pendiente` de las filas locales. Si la op
     * creaba un tercero y se resolvió «usar el existente», el tercero provisional se borra (no existe en el servidor y
     * quedaría como un fantasma) y lo que apuntaba a él pasa a apuntar al existente.
     */
    async completar(opId: string): Promise<void> {
      await db.transaction('rw', [db.outbox, ...tablas()], async () => {
        const op = await db.outbox.get(opId)
        const sustitucion = op ? sustitucionDeTercero(op) : null
        await db.outbox.delete(opId)
        if (sustitucion) {
          const provisional = await db.terceros.get(sustitucion.provisional)
          if (provisional?._pendiente === opId) await db.terceros.delete(sustitucion.provisional)
        }
        for (const t of tablas()) {
          await t
            .where('_pendiente')
            .equals(opId)
            .modify((f) => {
              if (sustitucion) {
                for (const clave of ['proveedor_id', 'cliente_id']) if (f[clave] === sustitucion.provisional) f[clave] = sustitucion.existente
              }
              delete f._pendiente
            })
        }
      })
    },

    /**
     * Descarte explícito del usuario (RF-SYN-04): borra la op, las filas locales provisionales que dejó
     * (`_pendiente = op_id`; nunca llegaron al servidor) y sus blobs. No envía nada.
     */
    async descartar(opIds: string[]): Promise<void> {
      await db.transaction('rw', [db.outbox, db.adjuntos_locales, ...tablas()], async () => {
        for (const t of tablas()) await t.where('_pendiente').anyOf(opIds).delete()
        await db.adjuntos_locales.where('op_id').anyOf(opIds).delete()
        await db.outbox.bulkDelete(opIds)
      })
    },

    async marcarError(opId: string, error: { codigo: string; mensaje: string }): Promise<void> {
      await db.outbox.update(opId, { estado: 'error', error })
    },

    async marcarRevision(opId: string, resultado: unknown): Promise<void> {
      await db.outbox.update(opId, { estado: 'revision', resultado })
    },

    /** Filas pedidas, ordenadas por `created_at` (y `op_id` como desempate). */
    async porIds(opIds: string[]): Promise<OpOutbox[]> {
      const filas = (await db.outbox.bulkGet(opIds)).filter((f): f is OpOutbox => f !== undefined)
      return filas.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.op_id.localeCompare(b.op_id))
    },

    obtener: (opId: string) => db.outbox.get(opId),
  }
}

export type OutboxRepo = ReturnType<typeof crearOutboxRepo>
