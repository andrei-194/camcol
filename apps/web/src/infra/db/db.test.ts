import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CaminoDB, limpiarCacheDeServidor, TABLAS_CACHE_SERVIDOR } from './db'
import { obtenerDeviceId } from './deviceId'
import { esUuid } from '../../lib/uuid'

// Cada prueba usa un IndexedDB nuevo y aislado (una "instalación" distinta).
let idb: IDBFactory
let abiertas: Dexie[] = []

function abrir(nombre = 'camino'): CaminoDB {
  const d = new CaminoDB(nombre, { indexedDB: idb, IDBKeyRange })
  abiertas.push(d)
  return d
}

beforeEach(() => {
  idb = new IDBFactory()
})
afterEach(() => {
  abiertas.forEach((d) => d.close())
  abiertas = []
})

describe('[RNF-UX-01] esquema Dexie v1 (PLAN §5.1)', () => {
  it('declara todas las tablas del plan', async () => {
    const d = abrir()
    await d.open()
    expect(d.tables.map((t) => t.name).sort()).toEqual(
      [
        'adjuntos_locales',
        'articulos',
        'configuracion',
        'gastos',
        'kv',
        'listas_precio',
        'ordenes_compra',
        'outbox',
        'pedidos_venta',
        'precios',
        'productos',
        'stock',
        'sync_meta',
        'terceros',
        'unidades',
      ].sort(),
    )
    expect(d.verno).toBe(1)
  })

  it('claves primarias e índices según el plan', async () => {
    const d = abrir()
    await d.open()
    const pk = (t: string) => d.table(t).schema.primKey.name
    const idx = (t: string) => d.table(t).schema.indexes.map((i) => i.name).sort()
    expect(pk('unidades')).toBe('codigo')
    expect(pk('stock')).toBe('articulo_id')
    expect(pk('configuracion')).toBe('clave')
    expect(pk('outbox')).toBe('op_id')
    expect(pk('sync_meta')).toBe('tabla')
    expect(pk('kv')).toBe('clave')
    expect(pk('terceros')).toBe('id')
    expect(idx('terceros')).toEqual(
      ['_pendiente', 'nombre', 'numero_documento', 'roles', 'telefono'].sort(),
    )
    expect(d.table('terceros').schema.idxByName['roles']?.multi).toBe(true)
    expect(idx('precios')).toEqual(['[lista_id+articulo_id]'])
    expect(idx('outbox')).toEqual(['created_at', 'estado'])
    expect(idx('pedidos_venta')).toEqual(['_pendiente', 'cliente_id', 'estado', 'fecha'])
    expect(idx('ordenes_compra')).toEqual(['_pendiente', 'estado', 'fecha', 'proveedor_id'])
    expect(idx('gastos')).toEqual(['_pendiente', 'fecha'])
  })

  it('terceros se busca por rol (multiEntry) y por teléfono', async () => {
    const d = abrir()
    await d.terceros.bulkPut([
      { id: 'a', nombre: 'Ana', telefono: '300', roles: ['cliente'] },
      { id: 'b', nombre: 'Beto', telefono: '301', roles: ['cliente', 'proveedor'] },
      { id: 'c', nombre: 'Caro', telefono: '302', roles: ['proveedor'] },
    ])
    const proveedores = await d.terceros.where('roles').equals('proveedor').primaryKeys()
    expect(proveedores.sort()).toEqual(['b', 'c'])
    expect((await d.terceros.where('telefono').equals('300').first())?.id).toBe('a')
  })

  it('precios se consulta por [lista_id+articulo_id]', async () => {
    const d = abrir()
    await d.precios.bulkPut([
      { id: '1', lista_id: 'L1', articulo_id: 'A1', precio: 1000 },
      { id: '2', lista_id: 'L1', articulo_id: 'A2', precio: 2000 },
    ])
    const p = await d.precios.where('[lista_id+articulo_id]').equals(['L1', 'A2']).first()
    expect(p?.precio).toBe(2000)
  })

  it('las filas creadas offline viven en la misma tabla con _pendiente = op_id', async () => {
    const d = abrir()
    await d.gastos.bulkPut([
      { id: 'g1', fecha: '2026-11-17', valor: 5000 },
      { id: 'g2', fecha: '2026-11-17', valor: 7000, _pendiente: 'op-1' },
    ])
    const pend = await d.gastos.where('_pendiente').equals('op-1').toArray()
    expect(pend.map((g) => g.id)).toEqual(['g2'])
  })
})

describe('[RF-SYN-11] device_id estable por instalación', () => {
  it('se genera como UUID v7 en la primera apertura', async () => {
    const id = await obtenerDeviceId(abrir())
    expect(esUuid(id)).toBe(true)
    expect(id[14]).toBe('7')
  })

  it('es el mismo entre aperturas y reinicios de la app', async () => {
    const primero = await obtenerDeviceId(abrir())
    abiertas.forEach((d) => d.close())
    const segundo = await obtenerDeviceId(abrir())
    expect(segundo).toBe(primero)
  })

  it('llamadas simultáneas (dos pestañas) no generan dos ids', async () => {
    const ids = await Promise.all([
      obtenerDeviceId(abrir()),
      obtenerDeviceId(abrir()),
      obtenerDeviceId(abrir()),
    ])
    expect(new Set(ids).size).toBe(1)
    expect(await abrir().kv.count()).toBe(1)
  })

  it('instalaciones distintas tienen ids distintos', async () => {
    const a = await obtenerDeviceId(abrir())
    idb = new IDBFactory()
    const b = await obtenerDeviceId(abrir())
    expect(a).not.toBe(b)
  })

  it('sobrevive a limpiarCacheDeServidor (re-login)', async () => {
    const d = abrir()
    const antes = await obtenerDeviceId(d)
    await limpiarCacheDeServidor(d)
    expect(await obtenerDeviceId(d)).toBe(antes)
  })
})

describe('regla 10: la outbox no se pierde', () => {
  const op = (op_id: string) => ({
    op_id,
    tipo: 'gasto.registrar',
    datos: { valor: 1000 },
    estado: 'pendiente' as const,
    created_at: '2026-11-17T10:00:00.000Z',
  })

  it('sobrevive a cerrar y reabrir la base', async () => {
    const d = abrir()
    await d.outbox.put(op('op-1'))
    d.close()
    expect(await abrir().outbox.get('op-1')).toMatchObject({ tipo: 'gasto.registrar' })
  })

  it('sobrevive a una migración futura (versión n+1 que agrega un índice)', async () => {
    const d = abrir()
    await d.outbox.put(op('op-1'))
    await d.adjuntos_locales.put({ id: 'adj-1', op_id: 'op-1', estado: 'pendiente' })
    d.close()

    // Simula la app actualizada: mismas versiones previas + una nueva, con upgrade.
    class CaminoV2 extends CaminoDB {
      constructor() {
        super('camino', { indexedDB: idb, IDBKeyRange })
        this.version(2)
          .stores({ gastos: 'id, fecha, categoria, _pendiente' })
          .upgrade((tx) => tx.table('gastos').toCollection().modify({ categoria: 'otros' }))
      }
    }
    const v2 = new CaminoV2()
    abiertas.push(v2)
    await v2.open()
    expect(v2.verno).toBe(2)
    expect((await v2.outbox.get('op-1'))?.estado).toBe('pendiente')
    expect((await v2.adjuntos_locales.get('adj-1'))?.op_id).toBe('op-1')
  })

  it('limpiarCacheDeServidor borra el caché pero conserva outbox, adjuntos, kv y filas _pendiente', async () => {
    const d = abrir()
    await d.terceros.bulkPut([
      { id: 't1', nombre: 'Server', roles: ['cliente'] },
      { id: 't2', nombre: 'Local', roles: ['proveedor'], _pendiente: 'op-1' },
    ])
    await d.stock.put({ articulo_id: 'A1', fisico: 3 })
    await d.configuracion.put({ clave: 'x', valor: 1 })
    await d.sync_meta.put({ tabla: 'global', cursor: '2026-11-17T00:00:00Z' })
    await d.outbox.put(op('op-1'))
    await d.adjuntos_locales.put({ id: 'adj-1', op_id: 'op-1', estado: 'pendiente' })
    await d.kv.put({ clave: 'preferencia', valor: 'x' })

    await limpiarCacheDeServidor(d)

    expect((await d.terceros.toArray()).map((t) => t.id)).toEqual(['t2'])
    expect(await d.stock.count()).toBe(0)
    expect(await d.configuracion.count()).toBe(0)
    expect(await d.sync_meta.count()).toBe(0) // el próximo pull será snapshot completo
    expect(await d.outbox.count()).toBe(1)
    expect(await d.adjuntos_locales.count()).toBe(1)
    expect(await d.kv.count()).toBe(1)
  })

  it('la lista de tablas de caché nunca incluye outbox, adjuntos_locales ni kv', () => {
    for (const t of ['outbox', 'adjuntos_locales', 'kv']) {
      expect(TABLAS_CACHE_SERVIDOR as readonly string[]).not.toContain(t)
    }
  })
})
