// La outbox al aplicarse una op cuya resolución fue «usar el existente» (CAM-61, hallazgo de la revisión): la fila
// provisional del tercero nuevo nunca llegó al servidor y no debe quedar como un fantasma en Dexie, y lo que apuntaba a
// ella (la orden de compra) pasa a apuntar al tercero existente. Con «crear igual» el tercero sí existe: solo se desmarca.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CaminoDB } from '../db/db'
import { crearOutboxRepo } from './outboxRepo'

let db: CaminoDB
beforeEach(async () => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  await db.open()
})
afterEach(() => db.close())

const op = (tipo: string, datos: unknown, op_id = 'op-1') => ({ op_id, tipo, datos, estado: 'revision' as const, created_at: '2026-11-20T10:00:00Z' })

describe('completar con resolución «usar_existente»', () => {
  it('orden_compra.registrar: borra el proveedor provisional y reapunta la orden al existente', async () => {
    const repo = crearOutboxRepo(db)
    await repo.encolar(
      op('orden_compra.registrar', { orden: { id: 'o1' }, proveedor_nuevo: { id: 'pn', nombre: 'Don Hernán', resolucion: { tipo: 'usar_existente', tercero_id: 'p9' } } }),
      [
        { tabla: 'terceros', fila: { id: 'pn', nombre: 'Don Hernán', roles: ['proveedor'] } },
        { tabla: 'ordenes_compra', fila: { id: 'o1', proveedor_id: 'pn', total: 1000 } },
      ],
    )
    await repo.completar('op-1')
    expect(await db.terceros.get('pn')).toBeUndefined()
    const orden = await db.ordenes_compra.get('o1')
    expect(orden).toMatchObject({ id: 'o1', proveedor_id: 'p9' })
    expect(orden!._pendiente).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('tercero.crear con usar_existente: tampoco queda el tercero provisional', async () => {
    const repo = crearOutboxRepo(db)
    await repo.encolar(op('tercero.crear', { id: 't1', nombre: 'Doña María', es_proveedor: true, resolucion: { tipo: 'usar_existente', tercero_id: 't9' } }), [
      { tabla: 'terceros', fila: { id: 't1', nombre: 'Doña María', roles: ['proveedor'] } },
    ])
    await repo.completar('op-1')
    expect(await db.terceros.get('t1')).toBeUndefined()
  })

  it('con «crear_igual» el tercero sí existe en el servidor: se conserva y solo pierde la marca', async () => {
    const repo = crearOutboxRepo(db)
    await repo.encolar(op('orden_compra.registrar', { orden: { id: 'o1' }, proveedor_nuevo: { id: 'pn', nombre: 'X', resolucion: { tipo: 'crear_igual' } } }), [
      { tabla: 'terceros', fila: { id: 'pn', nombre: 'X', roles: ['proveedor'] } },
      { tabla: 'ordenes_compra', fila: { id: 'o1', proveedor_id: 'pn' } },
    ])
    await repo.completar('op-1')
    const t = await db.terceros.get('pn')
    expect(t).toMatchObject({ id: 'pn', nombre: 'X' })
    expect(t!._pendiente).toBeUndefined()
    expect(await db.ordenes_compra.get('o1')).toMatchObject({ proveedor_id: 'pn' })
  })

  it('sin resolución (op aplicada a la primera) todo se conserva y solo se quitan las marcas', async () => {
    const repo = crearOutboxRepo(db)
    await repo.encolar(op('orden_compra.registrar', { orden: { id: 'o1' }, proveedor_nuevo: { id: 'pn', nombre: 'X' } }, 'op-2'), [
      { tabla: 'terceros', fila: { id: 'pn', nombre: 'X' } },
    ])
    await repo.completar('op-2')
    expect(await db.terceros.get('pn')).toMatchObject({ id: 'pn' })
  })

  it('un tercero existente de otra op, que se llama igual, no se toca', async () => {
    const repo = crearOutboxRepo(db)
    await db.terceros.put({ id: 'pn', nombre: 'Propio del servidor' }) // sin `_pendiente`: llegó por pull
    await repo.encolar(op('orden_compra.registrar', { orden: { id: 'o1' }, proveedor_nuevo: { id: 'pn', nombre: 'X', resolucion: { tipo: 'usar_existente', tercero_id: 'p9' } } }), [])
    await repo.completar('op-1')
    expect(await db.terceros.get('pn')).toMatchObject({ nombre: 'Propio del servidor' })
  })
})
