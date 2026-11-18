import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CaminoDB } from '../db/db'
import { construirExportacion } from './exportar'
import { crearPendientesService } from './pendientesService'
import { crearServidorSimulado } from './servidorSimulado'

let db: CaminoDB
beforeEach(() => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
})
afterEach(() => db.close())

async function sembrar() {
  await db.outbox.bulkPut([
    { op_id: 'a', tipo: 'gasto.registrar', datos: { id: 'g1', categoria: 'transporte', valor: 1000 }, estado: 'pendiente', created_at: '2026-11-18T10:00:00.000Z' },
    { op_id: 'b', tipo: 'tercero.crear', datos: { nombre: 'Don Luis' }, estado: 'error', created_at: '2026-11-18T11:00:00.000Z', error: { codigo: 'X', mensaje: 'malo' } },
  ])
  await db.gastos.put({ id: 'g1', valor: 1000, _pendiente: 'a' })
  await db.adjuntos_locales.bulkPut([
    { id: 'f1', op_id: 'a', estado: 'local', blob: new Blob(['x']) },
    { id: 'f2', op_id: 'b', estado: 'local', blob: new Blob(['y']) },
  ])
}

describe('[RF-SYN-04] descartar un pendiente', () => {
  it('borra la op, sus filas locales provisionales y sus blobs; deja intactas las demás', async () => {
    await sembrar()
    const servicio = crearPendientesService({ db, api: crearServidorSimulado() })
    await servicio.descartar(['a'])
    expect(await db.outbox.toArray()).toHaveLength(1)
    expect((await db.outbox.toArray())[0]!.op_id).toBe('b')
    expect(await db.gastos.count()).toBe(0)
    expect((await db.adjuntos_locales.toArray()).map((f) => f.id)).toEqual(['f2'])
  })

  it('descartar no envía nada al servidor', async () => {
    await sembrar()
    const srv = crearServidorSimulado()
    await crearPendientesService({ db, api: srv }).descartar(['a', 'b'])
    expect(srv.llamadas).toHaveLength(0)
  })
})

describe('[RF-SYN-10] exportar pendientes a JSON (PLAN §5.3)', () => {
  it('formato versión 1 con device_id, fecha UTC y las ops sin blobs', async () => {
    await sembrar()
    await db.kv.put({ clave: 'device_id', valor: 'dev-1' })
    const r = await construirExportacion(db, () => new Date('2026-11-18T15:00:00.000Z'))
    expect(r.version).toBe(1)
    expect(r.device_id).toBe('dev-1')
    expect(r.exportado_en).toBe('2026-11-18T15:00:00.000Z')
    expect(r.ops.map((o) => o.op_id)).toEqual(['a', 'b'])
    expect(Object.keys(r.ops[0]!).sort()).toEqual(['created_at', 'datos', 'estado', 'op_id', 'tipo'])
    expect(r.fotos_locales_sin_exportar).toBe(2)
    expect(JSON.stringify(r)).not.toContain('blob')
  })

  it('sin pendientes exporta una lista vacía', async () => {
    const r = await construirExportacion(db)
    expect(r.ops).toEqual([])
  })
})
