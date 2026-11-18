import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CaminoDB } from '../db/db'
import { crearAdjuntosService, type AlmacenSoportes } from './adjuntosService'
import { crearPendientesService } from './pendientesService'
import { crearServidorSimulado, type ServidorSimulado } from './servidorSimulado'
import { crearEscritor } from './writer'

let db: CaminoDB
let srv: ServidorSimulado
let eventos: string[]
let almacen: AlmacenSoportes & { subidos: Map<string, Blob>; falla: boolean }

beforeEach(() => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  srv = crearServidorSimulado()
  eventos = []
  const subidos = new Map<string, Blob>()
  almacen = {
    subidos,
    falla: false,
    async subir(path, blob) {
      if (almacen.falla) throw new TypeError('Failed to fetch')
      eventos.push(`subir:${path}`)
      subidos.set(path, blob)
    },
  }
  const original = srv.aplicar
  srv.aplicar = async (ops, signal) => {
    for (const o of ops) eventos.push(`op:${o.tipo}`)
    return original(ops, signal)
  }
})
afterEach(() => db.close())

const foto = () => new Blob([new Uint8Array(5000)], { type: 'image/jpeg' })
const comprimir = async () => ({ blob: new Blob([new Uint8Array(100)], { type: 'image/webp' }), mime: 'image/webp', ancho: 800, alto: 600 })

function servicio() {
  let n = 0
  return crearAdjuntosService({ db, api: srv, almacen, comprimir, nuevoId: () => `00000000-0000-7000-8000-00000000000${++n}` })
}
const guardar = (s: ReturnType<typeof servicio>, opId = 'op-1') => s.guardar({ opId, entidad: 'gasto', entidadId: 'g1', archivo: foto() })

describe('[RF-SYN-09] guardado local', () => {
  it('guarda el blob comprimido en adjuntos_locales como "local", con path <entidad>/<entidad_id>/<uuid>.webp', async () => {
    const a = await guardar(servicio())
    const fila = await db.adjuntos_locales.get(a.id)
    expect(fila).toMatchObject({ estado: 'local', op_id: 'op-1', entidad: 'gasto', entidad_id: 'g1', mime: 'image/webp' })
    expect(fila?.path).toBe(`gasto/g1/${a.id}.webp`)
    expect((fila?.blob as Blob).size).toBe(100)
  })

  it('guardar no sube ni llama al servidor (regla 5)', async () => {
    await guardar(servicio())
    expect(almacen.subidos.size).toBe(0)
    expect(srv.llamadas).toHaveLength(0)
  })
})

describe('[RF-SYN-09] subida solo tras aplicada la op', () => {
  it('mientras la op siga en outbox (pendiente, error o revisión) no se sube nada', async () => {
    const s = servicio()
    await guardar(s)
    await db.outbox.put({ op_id: 'op-1', tipo: 'gasto.registrar', datos: {}, estado: 'pendiente', created_at: 'x' })
    const r = await s.subirListas()
    expect(almacen.subidos.size).toBe(0)
    expect(srv.llamadas).toHaveLength(0)
    expect(r).toMatchObject({ vinculadas: 0, esperando: 1 })
    expect((await db.adjuntos_locales.toArray())[0]?.estado).toBe('local')
  })

  it('con la op aplicada: sube primero y luego vincula con adjunto.vincular y el path correcto', async () => {
    const s = servicio()
    const a = await guardar(s)
    const r = await s.subirListas()
    expect(r).toMatchObject({ vinculadas: 1, fallidas: 0 })
    expect(eventos).toEqual([`subir:gasto/g1/${a.id}.webp`, 'op:adjunto.vincular'])
    const op = srv.llamadas[0]?.[0]
    expect(op?.tipo).toBe('adjunto.vincular')
    expect(op?.datos).toMatchObject({ id: a.id, entidad: 'gasto', entidad_id: 'g1', path: `gasto/g1/${a.id}.webp`, mime: 'image/webp' })
    const fila = await db.adjuntos_locales.get(a.id)
    expect(fila?.estado).toBe('vinculada')
    expect(fila?.blob).toBeUndefined() // libera espacio
  })
})

describe('[RF-SYN-09] si la subida falla, el registro principal sigue siendo válido', () => {
  it('fallo de Storage: estado error, sin vincular, op principal intacta, y se reintenta a mano', async () => {
    const s = servicio()
    const a = await guardar(s)
    srv.aplicadas.set('op-1', { id: 'g1' })
    almacen.falla = true
    const r = await s.subirListas()
    expect(r).toMatchObject({ vinculadas: 0, fallidas: 1 })
    expect(srv.llamadas).toHaveLength(0)
    expect(srv.aplicadas.has('op-1')).toBe(true)
    const fila = await db.adjuntos_locales.get(a.id)
    expect(fila?.estado).toBe('error')
    expect(fila?.blob).toBeDefined()

    almacen.falla = false
    const r2 = await s.subirListas()
    expect(r2.vinculadas).toBe(1)
    expect((await db.adjuntos_locales.get(a.id))?.estado).toBe('vinculada')
  })

  it('subida ok pero vinculación sin red: queda "subida" y el reintento no vuelve a subir', async () => {
    const s = servicio()
    const a = await guardar(s)
    srv.caido = true
    const r = await s.subirListas()
    expect(r).toMatchObject({ vinculadas: 0, fallidas: 1 })
    expect((await db.adjuntos_locales.get(a.id))?.estado).toBe('subida')
    srv.caido = false
    await s.subirListas()
    expect(eventos.filter((e) => e.startsWith('subir:'))).toHaveLength(1)
    expect((await db.adjuntos_locales.get(a.id))?.estado).toBe('vinculada')
  })

  it('reenviar el vínculo es idempotente: usa el id del adjunto como op_id', async () => {
    const s = servicio()
    const a = await guardar(s)
    srv.perderRespuesta = true
    await s.subirListas()
    await s.subirListas()
    expect(srv.llamadas.map((l) => l[0]?.op_id)).toEqual([a.id, a.id])
    expect((await db.adjuntos_locales.get(a.id))?.estado).toBe('vinculada')
  })

  it('un rechazo del servidor deja estado error con el mensaje', async () => {
    const s = servicio()
    const a = await guardar(s)
    srv.manejadores['adjunto.vincular'] = () => ({ status: 'error', error: { codigo: 'E_X', mensaje: 'no' } })
    await s.subirListas()
    expect(await db.adjuntos_locales.get(a.id)).toMatchObject({ estado: 'error', error: { codigo: 'E_X', mensaje: 'no' } })
  })
})

describe('[RF-SYN-09] enganche con pendientesService.subir (acción explícita)', () => {
  it('al subir la op pendiente, sube después sus fotos; el resumen de ops no cambia', async () => {
    const adj = servicio()
    const esc = crearEscritor({ db, api: srv, nuevoId: () => 'op-1' })
    srv.caido = true
    await esc.commit({ tipo: 'gasto.registrar', datos: { id: 'g1', categoria: 'x', valor: 1000 } })
    await guardar(adj)
    srv.caido = false
    eventos.length = 0
    const p = crearPendientesService({ db, api: srv, adjuntos: adj })
    const r = await p.subir(['op-1'])
    expect(r.resultados[0]?.status).toBe('ok')
    expect(eventos).toEqual(['op:gasto.registrar', expect.stringMatching(/^subir:/), 'op:adjunto.vincular'])
    expect(r.adjuntos).toMatchObject({ vinculadas: 1 })
  })

  it('si la op es rechazada, la foto no se sube; si la foto falla, la op sigue ok', async () => {
    const adj = servicio()
    await db.outbox.put({ op_id: 'op-1', tipo: 'gasto.registrar', datos: { id: 'g1', categoria: 'x', valor: 1000 }, estado: 'pendiente', created_at: 'a' })
    await guardar(adj)
    srv.manejadores['gasto.registrar'] = () => ({ status: 'error', error: { codigo: 'E', mensaje: 'm' } })
    const p = crearPendientesService({ db, api: srv, adjuntos: adj })
    expect((await p.subir(['op-1'])).resultados[0]?.status).toBe('error')
    expect(almacen.subidos.size).toBe(0)

    srv.manejadores = {}
    await db.outbox.update('op-1', { estado: 'pendiente' })
    almacen.falla = true
    const r = await p.subir(['op-1'])
    expect(r.resultados[0]?.status).toBe('ok')
    expect(r.adjuntos).toMatchObject({ vinculadas: 0, fallidas: 1 })
  })
})
