import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaminoDB, type Fila } from '../db/db'
import { ErrorPull, ejecutarPull, prepararCacheParaUsuario, type PullApi, type RespuestaSyncPull } from './puller'

let idb: IDBFactory
let db: CaminoDB

beforeEach(async () => {
  idb = new IDBFactory()
  db = new CaminoDB('camino', { indexedDB: idb, IDBKeyRange })
  await db.open()
})
afterEach(() => db.close())

function respuesta(parcial: Partial<RespuestaSyncPull> = {}): RespuestaSyncPull {
  return {
    server_time: '2026-11-18T15:00:00Z',
    cursor: '2026-11-18T14:59:00.000000Z',
    catalogo: { productos: [], articulos: [], listas_precio: [], precios: [], unidades: [] },
    terceros: [],
    configuracion: [],
    stock: [],
    pedidos_venta: [],
    ordenes_compra: [],
    ...parcial,
  }
}

/** Servidor simulado: devuelve las respuestas en orden y recuerda con qué cursor lo llamaron. */
function servidor(...respuestas: Array<RespuestaSyncPull | Error>) {
  const pull = vi.fn(async (desde: string | null) => {
    void desde
    const r = respuestas.shift() ?? respuesta()
    if (r instanceof Error) throw r
    return r
  })
  return { api: { pull } satisfies PullApi, pull }
}

describe('[RF-SYN-08] puller: carga inicial y cursor', () => {
  it('primer pull: cursor null, aplica el snapshot y guarda el cursor global', async () => {
    const { api, pull } = servidor(
      respuesta({
        catalogo: {
          productos: [{ id: 'p1', nombre: 'Café', updated_at: '2026-11-18T10:00:00Z' }],
          articulos: [{ id: 'a1', producto_id: 'p1', nombre: 'Café 500 g', updated_at: '2026-11-18T10:00:00Z' }],
          listas_precio: [{ id: 'l1' }],
          precios: [{ id: 'pr1', lista_id: 'l1', articulo_id: 'a1' }],
          unidades: [{ codigo: 'lb', nombre: 'Libra' }],
        },
        configuracion: [{ clave: 'negocio', valor: { nombre: 'Camino' }, updated_at: '2026-11-18T10:00:00Z' }],
        pedidos_venta: [{ id: 'pv1', estado: 'recibido', items: [{ id: 'i1' }], pagos: [] }],
        ordenes_compra: [{ id: 'oc1', estado: 'pedida', items: [], recepciones: [], pagos: [] }],
      }),
    )
    const r = await ejecutarPull(db, api)
    expect(r.ok).toBe(true)
    expect(pull).toHaveBeenCalledWith(null)
    expect(await db.productos.count()).toBe(1)
    expect((await db.articulos.get('a1'))?.nombre).toBe('Café 500 g')
    expect((await db.unidades.get('lb'))?.nombre).toBe('Libra')
    expect((await db.configuracion.get('negocio'))?.valor).toEqual({ nombre: 'Camino' })
    expect(((await db.pedidos_venta.get('pv1')) as Fila).items).toHaveLength(1)
    expect(await db.ordenes_compra.count()).toBe(1)
    const meta = await db.sync_meta.get('global')
    expect(meta?.cursor).toBe('2026-11-18T14:59:00.000000Z')
    expect(meta?.last_sync).toBe('2026-11-18T15:00:00Z')
  })

  it('pulls siguientes envían el cursor guardado menos 2 minutos', async () => {
    await db.sync_meta.put({ tabla: 'global', cursor: '2026-11-18T14:59:00.000000Z' })
    const { api, pull } = servidor()
    await ejecutarPull(db, api)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(pull.mock.calls[0][0]).toBe('2026-11-18T14:57:00.000Z')
  })

  it('cursor null con base vacía conserva el cursor anterior', async () => {
    await db.sync_meta.put({ tabla: 'global', cursor: '2026-11-18T14:59:00.000000Z' })
    const { api } = servidor(respuesta({ cursor: null }))
    await ejecutarPull(db, api)
    expect((await db.sync_meta.get('global'))?.cursor).toBe('2026-11-18T14:59:00.000000Z')
  })
})

describe('[RF-SYN-08] puller: reglas de aplicación', () => {
  it('no pisa filas con _pendiente', async () => {
    await db.gastos.put({ id: 'g1', _pendiente: 'op-1', concepto: 'local' })
    await db.pedidos_venta.put({ id: 'pv1', _pendiente: 'op-2', estado: 'local' })
    const { api } = servidor(
      respuesta({ pedidos_venta: [{ id: 'pv1', estado: 'servidor', updated_at: '2026-11-18T12:00:00Z' }] }),
    )
    await ejecutarPull(db, api)
    expect((await db.pedidos_venta.get('pv1'))?.estado).toBe('local')
    expect((await db.pedidos_venta.get('pv1'))?._pendiente).toBe('op-2')
    expect((await db.gastos.get('g1'))?.concepto).toBe('local')
  })

  it('last-write-wins: ignora filas más viejas que la local y acepta iguales o nuevas', async () => {
    await db.productos.bulkPut([
      { id: 'viejo', nombre: 'local', updated_at: '2026-11-18T12:00:00Z' },
      { id: 'igual', nombre: 'local', updated_at: '2026-11-18T12:00:00Z' },
      { id: 'nuevo', nombre: 'local', updated_at: '2026-11-18T12:00:00Z' },
    ])
    const { api } = servidor(
      respuesta({
        catalogo: {
          productos: [
            { id: 'viejo', nombre: 'srv', updated_at: '2026-11-18T11:00:00+00:00' },
            { id: 'igual', nombre: 'srv', updated_at: '2026-11-18T12:00:00+00:00' },
            { id: 'nuevo', nombre: 'srv', updated_at: '2026-11-18T13:00:00Z' },
          ],
          articulos: [],
          listas_precio: [],
          precios: [],
          unidades: [],
        },
      }),
    )
    await ejecutarPull(db, api)
    expect((await db.productos.get('viejo'))?.nombre).toBe('local')
    expect((await db.productos.get('igual'))?.nombre).toBe('srv')
    expect((await db.productos.get('nuevo'))?.nombre).toBe('srv')
  })

  it('deriva terceros.roles de es_cliente y es_proveedor', async () => {
    const { api } = servidor(
      respuesta({
        terceros: [
          { id: 't1', es_cliente: true, es_proveedor: false },
          { id: 't2', es_cliente: false, es_proveedor: true },
          { id: 't3', es_cliente: true, es_proveedor: true },
          { id: 't4', es_cliente: false, es_proveedor: false },
        ],
      }),
    )
    await ejecutarPull(db, api)
    expect((await db.terceros.get('t1'))?.roles).toEqual(['cliente'])
    expect((await db.terceros.get('t2'))?.roles).toEqual(['proveedor'])
    expect((await db.terceros.get('t3'))?.roles).toEqual(['cliente', 'proveedor'])
    expect((await db.terceros.get('t4'))?.roles).toEqual([])
    expect(await db.terceros.where('roles').equals('proveedor').count()).toBe(2)
  })

  it('reemplaza stock completo en cada llamada', async () => {
    await db.stock.bulkPut([
      { articulo_id: 'a1', fisico: 5 },
      { articulo_id: 'fuera', fisico: 9 },
    ])
    const { api } = servidor(respuesta({ stock: [{ articulo_id: 'a1', fisico: 7 }, { articulo_id: 'a2', fisico: 1 }] }))
    await ejecutarPull(db, api)
    expect((await db.stock.toArray()).map((s) => [s.articulo_id, s.fisico])).toEqual([
      ['a1', 7],
      ['a2', 1],
    ])
  })

  it('guarda marcadas las filas con deleted_at', async () => {
    const { api } = servidor(
      respuesta({ terceros: [{ id: 't1', es_cliente: true, es_proveedor: false, deleted_at: '2026-11-18T09:00:00Z' }] }),
    )
    await ejecutarPull(db, api)
    expect((await db.terceros.get('t1'))?.deleted_at).toBe('2026-11-18T09:00:00Z')
  })

  it('tolera pagos con direccion cobro o reembolso sin tocarlos', async () => {
    const pagos = [
      { id: 'g1', direccion: 'cobro', monto: 1000 },
      { id: 'g2', direccion: 'reembolso', monto: 400 },
    ]
    const { api } = servidor(respuesta({ pedidos_venta: [{ id: 'pv1', estado: 'finalizado', items: [], pagos }] }))
    const r = await ejecutarPull(db, api)
    expect(r.ok).toBe(true)
    expect(((await db.pedidos_venta.get('pv1')) as Fila).pagos).toEqual(pagos)
  })
})

describe('[RF-SYN-08] puller: fallos', () => {
  it('fallo de red: no borra nada ni mueve el cursor y lo informa', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Café' })
    await db.stock.put({ articulo_id: 'a1', fisico: 3 })
    await db.sync_meta.put({ tabla: 'global', cursor: 'C0' })
    const { api } = servidor(new ErrorPull('red', 'sin conexión'))
    const r = await ejecutarPull(db, api)
    expect(r).toMatchObject({ ok: false, motivo: 'red' })
    expect(await db.productos.count()).toBe(1)
    expect(await db.stock.count()).toBe(1)
    expect((await db.sync_meta.get('global'))?.cursor).toBe('C0')
  })

  it('rechazo del servidor también se informa sin borrar nada', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Café' })
    const { api } = servidor(new ErrorPull('rechazo', 'permiso denegado'))
    const r = await ejecutarPull(db, api)
    expect(r).toMatchObject({ ok: false, motivo: 'rechazo' })
    expect(await db.productos.count()).toBe(1)
  })

  it('una respuesta que falla a mitad no deja cambios parciales', async () => {
    await db.productos.put({ id: 'p1', nombre: 'viejo' })
    const mala = respuesta({
      catalogo: { productos: [{ id: 'p1', nombre: 'nuevo' }], articulos: [], listas_precio: [], precios: [], unidades: [] },
      terceros: [null as unknown as Fila],
    })
    const { api } = servidor(mala)
    const r = await ejecutarPull(db, api)
    expect(r.ok).toBe(false)
    expect((await db.productos.get('p1'))?.nombre).toBe('viejo')
  })
})

describe('[RF-SYN-08] cambio de usuario (PLAN §9)', () => {
  it('con usuario distinto limpia el caché pero conserva outbox, kv y filas _pendiente', async () => {
    await prepararCacheParaUsuario(db, 'u-1')
    await db.productos.put({ id: 'p1', nombre: 'Café' })
    await db.gastos.put({ id: 'g1', _pendiente: 'op-1' })
    await db.outbox.put({ op_id: 'op-1', tipo: 'gasto.registrar', datos: {}, estado: 'pendiente', created_at: 'x' })
    await db.kv.put({ clave: 'device_id', valor: 'dev' })
    await db.sync_meta.put({ tabla: 'global', cursor: 'C0' })

    expect(await prepararCacheParaUsuario(db, 'u-2')).toBe(true)

    expect(await db.productos.count()).toBe(0)
    expect(await db.sync_meta.count()).toBe(0)
    expect(await db.gastos.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
    expect((await db.kv.get('device_id'))?.valor).toBe('dev')
  })

  it('con el mismo usuario (o la primera vez) no limpia nada', async () => {
    expect(await prepararCacheParaUsuario(db, 'u-1')).toBe(false)
    await db.productos.put({ id: 'p1', nombre: 'Café' })
    expect(await prepararCacheParaUsuario(db, 'u-1')).toBe(false)
    expect(await db.productos.count()).toBe(1)
  })
})
