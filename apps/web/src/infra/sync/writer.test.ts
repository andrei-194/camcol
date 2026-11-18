import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CaminoDB } from '../db/db'
import { crearEscritor, ErrorDominio, RequiereConexionError } from './writer'
import { crearPendientesService } from './pendientesService'
import { crearServidorSimulado, type ServidorSimulado } from './servidorSimulado'
import type { OpsApi } from '../supabase/opsApi'

let db: CaminoDB
let srv: ServidorSimulado

beforeEach(() => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  srv = crearServidorSimulado()
})
afterEach(() => db.close())

const gasto = (id = 'g1') => ({ id, categoria: 'transporte', valor: 15000, fecha: '2026-11-18' })
const proveedor = (id = 't1') => ({ id, nombre: 'Don Luis', es_cliente: false, es_proveedor: true, telefono: '3001234567' })
const compra = {
  orden: { id: 'oc1', modalidad: 'inmediata', proveedor_id: 'p1' },
  items: [{ id: 'i1', articulo_id: 'a1', cantidad: 10, costo_unitario: 10000 }],
  recepcion: null,
  pagos: [],
}
const pedido = {
  pedido: { id: 'pv1', cliente_id: 'c1' },
  items: [{ id: 'i1', articulo_id: 'a1', cantidad: 2, precio_lista: 5000, descuento_pct: 0, precio_unitario: 5000 }],
}

function escritor(extra: { enLinea?: () => boolean; timeoutMs?: number } = {}) {
  let n = 0
  return crearEscritor({ db, api: srv, nuevoId: () => `op-${++n}`, ...extra })
}

describe('[RF-SYN-01] commit: aplica en el servidor o encola si falla la red', () => {
  it('con red: ok, no deja nada en outbox', async () => {
    const r = await escritor().commit({ tipo: 'gasto.registrar', datos: gasto() })
    expect(r).toMatchObject({ estado: 'aplicada', ya_aplicada: false, op_id: 'op-1' })
    expect(await db.outbox.count()).toBe(0)
    expect(srv.aplicadas.has('op-1')).toBe(true)
  })

  it('red caída: encola en outbox como pendiente y marca la fila local con el op_id', async () => {
    srv.caido = true
    const r = await escritor().commit({
      tipo: 'gasto.registrar',
      datos: gasto(),
      filasLocales: [{ tabla: 'gastos', fila: { id: 'g1', valor: 15000 } }],
    })
    expect(r).toMatchObject({ estado: 'encolada', motivo: 'red', op_id: 'op-1' })
    const fila = await db.outbox.get('op-1')
    expect(fila).toMatchObject({ tipo: 'gasto.registrar', estado: 'pendiente' })
    expect(typeof fila?.created_at).toBe('string')
    expect((await db.gastos.get('g1'))?._pendiente).toBe('op-1')
  })

  it('timeout (aquí reducido de 8 s): el intento se aborta y se encola', async () => {
    const colgada: OpsApi = {
      aplicar: (_ops, signal) =>
        new Promise((_ok, no) => signal?.addEventListener('abort', () => no(new DOMException('x', 'AbortError')))),
    }
    const e = crearEscritor({ db, api: colgada, timeoutMs: 20 })
    const r = await e.commit({ tipo: 'gasto.registrar', datos: gasto() })
    expect(r).toMatchObject({ estado: 'encolada', motivo: 'red' })
    expect(await db.outbox.count()).toBe(1)
  })

  it('navigator.onLine=false solo es una pista: se salta el intento y se encola', async () => {
    const r = await escritor({ enLinea: () => false }).commit({ tipo: 'gasto.registrar', datos: gasto() })
    expect(r).toMatchObject({ estado: 'encolada', motivo: 'sin_conexion' })
    expect(srv.llamadas).toHaveLength(0)
  })

  it('502-504 del gateway (clase red) cuentan como fallo de red', async () => {
    srv.forzar.push({ clase: 'red' })
    const r = await escritor().commit({ tipo: 'tercero.crear', datos: proveedor() })
    expect(r).toMatchObject({ estado: 'encolada', motivo: 'red' })
  })

  it('un payload inválido (Zod) se rechaza antes de enviar y no se encola', async () => {
    await expect(escritor().commit({ tipo: 'gasto.registrar', datos: { ...gasto(), valor: -5 } })).rejects.toMatchObject({
      codigo: 'DATOS_INVALIDOS',
    })
    expect(srv.llamadas).toHaveLength(0)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('[RF-SYN-02] distinguir fallo de red de rechazo del servidor', () => {
  it('status:error de la op → error de dominio y NO se encola', async () => {
    srv.manejadores['gasto.registrar'] = () => ({ status: 'error', error: { codigo: 'E_FECHA', mensaje: 'fecha futura' } })
    const p = escritor().commit({ tipo: 'gasto.registrar', datos: gasto() })
    await expect(p).rejects.toBeInstanceOf(ErrorDominio)
    await expect(p).rejects.toMatchObject({ codigo: 'E_FECHA' })
    expect(await db.outbox.count()).toBe(0)
  })

  it('error PostgREST con SQLSTATE (rechazo de la llamada) → error de dominio y NO se encola', async () => {
    srv.forzar.push({ clase: 'rechazo', codigo: '22P02', mensaje: 'entrada inválida' })
    await expect(escritor().commit({ tipo: 'gasto.registrar', datos: gasto() })).rejects.toMatchObject({ codigo: '22P02' })
    expect(await db.outbox.count()).toBe(0)
  })

  it('respuesta perdida + reenvío por el usuario → ya_aplicada: se borra la fila y la marca', async () => {
    srv.perderRespuesta = true
    const r = await escritor().commit({
      tipo: 'gasto.registrar',
      datos: gasto(),
      filasLocales: [{ tabla: 'gastos', fila: { id: 'g1' } }],
    })
    expect(r.estado).toBe('encolada')
    expect(srv.aplicadas.has('op-1')).toBe(true) // el servidor sí la aplicó

    const res = await crearPendientesService({ db, api: srv }).subir(['op-1'])
    expect(res.resultados).toEqual([expect.objectContaining({ op_id: 'op-1', status: 'ya_aplicada' })])
    expect(await db.outbox.count()).toBe(0)
    const fila = await db.gastos.get('g1')
    expect(fila).toBeDefined() // la fila local se conserva (mismo id)
    expect(fila?._pendiente).toBeUndefined()
  })

  it.each([
    ['401', { clase: 'no_aplicado', http: 401, mensaje: 'JWT expired' }],
    ['429', { clase: 'no_aplicado', http: 429, mensaje: 'rate' }],
    ['500', { clase: 'no_aplicado', http: 500, mensaje: 'boom' }],
  ] as const)('HTTP %s: no se aplicó → se encola con aviso (no es rechazo)', async (_n, respuesta) => {
    srv.forzar.push({ ...respuesta })
    const r = await escritor().commit({ tipo: 'gasto.registrar', datos: gasto() })
    expect(r).toMatchObject({ estado: 'encolada', motivo: 'no_aplicado' })
    expect((r as { aviso?: string }).aviso).toBeTruthy()
    expect(await db.outbox.count()).toBe(1)
  })

  it('un 401 pide volver a entrar y conserva los datos', async () => {
    srv.forzar.push({ clase: 'no_aplicado', http: 401, mensaje: 'JWT expired' })
    const r = await escritor().commit({ tipo: 'gasto.registrar', datos: gasto() })
    expect(r).toMatchObject({ estado: 'encolada', requiereLogin: true })
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('[RF-SYN-01] solo los tipos que admiten offline se encolan (D-009)', () => {
  it('pedido_venta.crear sin red → "Requiere conexión" y no se encola', async () => {
    srv.caido = true
    const p = escritor().commit({ tipo: 'pedido_venta.crear', datos: pedido })
    await expect(p).rejects.toBeInstanceOf(RequiereConexionError)
    await expect(p).rejects.toThrow('Requiere conexión')
    expect(await db.outbox.count()).toBe(0)
  })

  it('pedido_venta.crear con navigator.onLine=false → "Requiere conexión" sin intentar', async () => {
    await expect(escritor({ enLinea: () => false }).commit({ tipo: 'pedido_venta.crear', datos: pedido })).rejects.toBeInstanceOf(
      RequiereConexionError,
    )
    expect(srv.llamadas).toHaveLength(0)
  })

  it.each([
    ['orden_compra.registrar', compra],
    ['tercero.crear', proveedor()],
    ['gasto.registrar', gasto()],
    ['adjunto.vincular', { entidad: 'gasto', entidad_id: 'g1', path: 'soportes/a.jpg', mime: 'image/jpeg' }],
  ])('%s sin red se encola', async (tipo, datos) => {
    srv.caido = true
    const r = await escritor().commit({ tipo, datos })
    expect(r.estado).toBe('encolada')
    expect((await db.outbox.toArray())[0]?.tipo).toBe(tipo)
  })

  it('un tipo desconocido se rechaza', async () => {
    await expect(escritor().commit({ tipo: 'cosa.rara', datos: {} })).rejects.toMatchObject({ codigo: 'TIPO_DESCONOCIDO' })
  })
})

describe('[RF-SYN-02] revisión', () => {
  const candidatos = [{ id: 'x', nombre: 'Luis', telefono: '300', municipio: 'Cali', motivo: 'telefono' }]

  it('revisión de un tipo offline: queda en outbox con estado revision y sus candidatos', async () => {
    srv.manejadores['tercero.crear'] = () => ({ status: 'revision', resultado: { candidatos } })
    const r = await escritor().commit({
      tipo: 'tercero.crear',
      datos: proveedor(),
      filasLocales: [{ tabla: 'terceros', fila: { id: 't1' } }],
    })
    expect(r).toMatchObject({ estado: 'revision', candidatos })
    expect(await db.outbox.get('op-1')).toMatchObject({ estado: 'revision', resultado: { candidatos } })
    expect((await db.terceros.get('t1'))?._pendiente).toBe('op-1') // la fila provisional se conserva
  })

  it('revisión de un tipo online (pedido_venta.crear): se devuelve a la UI y no se encola', async () => {
    srv.manejadores['pedido_venta.crear'] = () => ({ status: 'revision', resultado: { candidatos } })
    const r = await escritor().commit({ tipo: 'pedido_venta.crear', datos: pedido })
    expect(r).toMatchObject({ estado: 'revision', candidatos })
    expect(await db.outbox.count()).toBe(0)
  })

  it('resolver escribe la resolución dentro de datos y vuelve a pendiente; subir la aplica', async () => {
    srv.manejadores['tercero.crear'] = (op) =>
      (op.datos as { resolucion?: unknown }).resolucion
        ? { status: 'ok', resultado: { id: 't1', existente: true } }
        : { status: 'revision', resultado: { candidatos } }
    await escritor().commit({ tipo: 'tercero.crear', datos: proveedor() })
    const svc = crearPendientesService({ db, api: srv })
    await svc.resolver('op-1', { tipo: 'usar_existente', tercero_id: 'x' })
    const f = await db.outbox.get('op-1')
    expect(f?.estado).toBe('pendiente')
    expect((f?.datos as { resolucion?: unknown }).resolucion).toEqual({ tipo: 'usar_existente', tercero_id: 'x' })
    const res = await svc.subir(['op-1'])
    expect(res.resultados[0]?.status).toBe('ok')
    expect(await db.outbox.count()).toBe(0)
  })

  it('en una compra la resolución va dentro de proveedor_nuevo', async () => {
    srv.caido = true
    const datos = { ...compra, orden: { id: 'oc1', modalidad: 'inmediata' }, proveedor_nuevo: proveedor() }
    await escritor().commit({ tipo: 'orden_compra.registrar', datos })
    await db.outbox.update('op-1', { estado: 'revision' })
    await crearPendientesService({ db, api: srv }).resolver('op-1', { tipo: 'crear_igual' })
    const f = await db.outbox.get('op-1')
    expect((f?.datos as { proveedor_nuevo: { resolucion: unknown } }).proveedor_nuevo.resolucion).toEqual({ tipo: 'crear_igual' })
  })
})

describe('[RF-SYN-01] pendientesService.subir (solo desde la UI)', () => {
  async function tresPendientes() {
    srv.caido = true
    const e = escritor()
    await e.commit({ tipo: 'gasto.registrar', datos: gasto('g1') })
    await e.commit({ tipo: 'gasto.registrar', datos: gasto('g2') })
    await e.commit({ tipo: 'gasto.registrar', datos: gasto('g3') })
    srv.caido = false
    srv.llamadas.length = 0
  }

  it('nada se envía solo: encolar no provoca más llamadas', async () => {
    srv.caido = true
    await escritor().commit({ tipo: 'gasto.registrar', datos: gasto() })
    await new Promise((r) => setTimeout(r, 50))
    expect(srv.llamadas).toHaveLength(1) // solo el intento original
  })

  it('envía de una en una, por created_at, y borra las que salen ok', async () => {
    await tresPendientes()
    const res = await crearPendientesService({ db, api: srv }).subir(['op-3', 'op-1', 'op-2'])
    expect(res.resultados.map((r) => r.op_id)).toEqual(['op-1', 'op-2', 'op-3'])
    expect(srv.llamadas.map((l) => l.length)).toEqual([1, 1, 1])
    expect(await db.outbox.count()).toBe(0)
  })

  it('se detiene en la primera que no es ok: error queda en error con código; las siguientes siguen pendiente', async () => {
    await tresPendientes()
    let k = 0
    srv.manejadores['gasto.registrar'] = () =>
      ++k === 2 ? { status: 'error', error: { codigo: 'E_REF', mensaje: 'no existe' } } : { status: 'ok', resultado: {} }
    const res = await crearPendientesService({ db, api: srv }).subir(['op-1', 'op-2', 'op-3'])
    expect(res.resultados.map((r) => r.status)).toEqual(['ok', 'error'])
    expect(res.detenida).toBe(true)
    expect(await db.outbox.get('op-2')).toMatchObject({ estado: 'error', error: { codigo: 'E_REF', mensaje: 'no existe' } })
    expect((await db.outbox.get('op-3'))?.estado).toBe('pendiente')
    expect(srv.llamadas).toHaveLength(2)
  })

  it('revisión al subir: la fila pasa a revision con candidatos y se detiene', async () => {
    await tresPendientes()
    srv.manejadores['gasto.registrar'] = () => ({ status: 'revision', resultado: { candidatos: [{ id: 'z' }] } })
    const res = await crearPendientesService({ db, api: srv }).subir(['op-1', 'op-2'])
    expect(res.resultados.map((r) => r.status)).toEqual(['revision'])
    expect(await db.outbox.get('op-1')).toMatchObject({ estado: 'revision', resultado: { candidatos: [{ id: 'z' }] } })
  })

  it('fallo de red o 5xx al subir: la fila sigue pendiente y se detiene', async () => {
    await tresPendientes()
    srv.caido = true
    const res = await crearPendientesService({ db, api: srv }).subir(['op-1', 'op-2'])
    expect(res.resultados.map((r) => r.status)).toEqual(['red'])
    expect((await db.outbox.get('op-1'))?.estado).toBe('pendiente')
    srv.caido = false
    srv.forzar.push({ clase: 'no_aplicado', http: 503, mensaje: 'x' })
    const res2 = await crearPendientesService({ db, api: srv }).subir(['op-1'])
    expect(res2.resultados[0]?.status).toBe('no_aplicado')
    expect((await db.outbox.get('op-1'))?.estado).toBe('pendiente')
  })

  it('una fila en error se puede reenviar (la op no quedó registrada)', async () => {
    await tresPendientes()
    srv.manejadores['gasto.registrar'] = () => ({ status: 'error', error: { codigo: 'E_REF', mensaje: 'm' } })
    await crearPendientesService({ db, api: srv }).subir(['op-1'])
    srv.manejadores = {}
    const res = await crearPendientesService({ db, api: srv }).subir(['op-1'])
    expect(res.resultados[0]?.status).toBe('ok')
  })
})
