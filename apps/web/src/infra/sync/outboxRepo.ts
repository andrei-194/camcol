// Repositorio de la outbox (PLAN §5.1). Ciclo de vida: nace `pendiente`; ok/ya_aplicada la borran y quitan
// `_pendiente`; error → `error`; revision → `revision`. No existe `bloqueada` (D-009).
import type { CaminoDB, Fila, OpOutbox } from '../db/db'
import { TABLAS_CON_PENDIENTE, type TablaLocal } from './tiposOp'

export interface FilaLocal {
  tabla: TablaLocal
  fila: Fila
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

    /** Op aplicada en el servidor: borra la fila de outbox (si existe) y quita `_pendiente` de las filas locales. */
    async completar(opId: string): Promise<void> {
      await db.transaction('rw', [db.outbox, ...tablas()], async () => {
        await db.outbox.delete(opId)
        for (const t of tablas()) {
          await t
            .where('_pendiente')
            .equals(opId)
            .modify((f) => {
              delete f._pendiente
            })
        }
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
