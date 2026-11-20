import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../application/auth/AuthProvider'
import { SyncProvider } from '../../application/sync/SyncProvider'
import { CaminoDB, type OpOutbox } from '../../infra/db/db'
import { crearPendientesService } from '../../infra/sync/pendientesService'
import { crearServidorSimulado, type ServidorSimulado } from '../../infra/sync/servidorSimulado'
import type { PullApi } from '../../infra/sync/puller'
import { servicioFalso } from '../../test/servicioAuthFalso'
import { PendientesProvider } from './contexto'
import { Pendientes } from './Pendientes'
import { BannerPendientes } from './BannerPendientes'
import * as descarga from './descargar'

vi.mock('./descargar', () => ({ descargarJson: vi.fn() }))

let db: CaminoDB
let srv: ServidorSimulado
const hace = (ms: number) => new Date(Date.now() - ms).toISOString()
const DIA = 86_400_000

beforeEach(async () => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  srv = crearServidorSimulado()
  await db.articulos.put({ id: 'a1', nombre: 'Café Sierra' })
  await db.terceros.put({ id: 'p1', nombre: 'Don Luis' })
  vi.mocked(descarga.descargarJson).mockClear()
  await db.open()
})
afterEach(() => db.close())

const compra = (id: string, creada: string): OpOutbox => ({
  op_id: id,
  tipo: 'orden_compra.registrar',
  estado: 'pendiente',
  created_at: creada,
  datos: {
    orden: { id: 'oc-' + id, proveedor_id: 'p1' },
    items: [{ articulo_id: 'a1', cantidad: 10, costo_unitario: 10000 }],
  },
})
const gasto = (id: string, creada: string): OpOutbox => ({
  op_id: id,
  tipo: 'gasto.registrar',
  estado: 'pendiente',
  created_at: creada,
  datos: { id: 'g-' + id, categoria: 'transporte', valor: 15000 },
})

function montar(extra?: { pull?: PullApi['pull'] }) {
  const servicio = crearPendientesService({ db, api: srv })
  const arbol = (
    <PendientesProvider db={db} servicio={servicio}>
      <MemoryRouter>
        <Pendientes />
      </MemoryRouter>
    </PendientesProvider>
  )
  if (!extra?.pull) return render(arbol)
  return render(
    <AuthProvider servicio={servicioFalso()}>
      <SyncProvider db={db} api={{ pull: extra.pull }}>
        {arbol}
      </SyncProvider>
    </AuthProvider>,
  )
}

const filas = () => screen.getAllByRole('listitem').filter((li) => li.querySelector('input[type="checkbox"]'))

describe('[RF-SYN-04] lista de pendientes', () => {
  it('«Volver» abre Más cuando se llega directo', async () => {
    montar()
    expect(await screen.findByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/mas')
  })

  it('estado vacío', async () => {
    montar()
    expect(await screen.findByText(/no tienes nada pendiente/i)).toBeInTheDocument()
  })

  it('resumen legible por tipo: compra y gasto, con antigüedad', async () => {
    await db.outbox.bulkPut([compra('c1', hace(2 * DIA)), gasto('g1', hace(5 * 60_000))])
    montar()
    expect(await screen.findByText('Compra a Don Luis · 10 × Café Sierra · $ 100.000 · hace 2 d')).toBeInTheDocument()
    expect(screen.getByText('Gasto · transporte · $ 15.000 · hace 5 min')).toBeInTheDocument()
  })

  it('muestra el estado de cada fila (pendiente, error, revisión)', async () => {
    await db.outbox.bulkPut([
      gasto('g1', hace(DIA)),
      { ...gasto('g2', hace(DIA)), estado: 'error', error: { codigo: 'E_X', mensaje: 'Categoría inválida' } },
      { ...gasto('g3', hace(DIA)), estado: 'revision', resultado: { candidatos: [] } },
    ])
    montar()
    await screen.findAllByText(/sin subir/i)
    expect(screen.getByText(/Categoría inválida/)).toBeInTheDocument()
    expect(screen.getByText(/requiere decisión/i)).toBeInTheDocument()
  })

  it('no ofrece Editar ni Importar (D-009)', async () => {
    await db.outbox.put(gasto('g1', hace(DIA)))
    montar()
    await screen.findByText(/Gasto/)
    expect(screen.queryByRole('button', { name: /editar|importar/i })).toBeNull()
  })
})

describe('[RF-SYN-03] nada se envía sin pulsar «Subir seleccionados»', () => {
  it('abrir la pantalla, seleccionar y esperar no llama al servidor', async () => {
    await db.outbox.put(gasto('g1', hace(DIA)))
    montar()
    fireEvent.click(await screen.findByRole('checkbox'))
    await new Promise((r) => setTimeout(r, 50))
    expect(srv.llamadas).toHaveLength(0)
    expect(await db.outbox.count()).toBe(1)
  })

  it('«Subir seleccionados» está deshabilitado sin selección', async () => {
    await db.outbox.put(gasto('g1', hace(DIA)))
    montar()
    await screen.findByRole('checkbox')
    expect(screen.getByRole('button', { name: /subir seleccionados/i })).toBeDisabled()
  })

  it('al pulsar sube solo lo seleccionado, de una en una, y muestra ✔ por fila', async () => {
    await db.outbox.bulkPut([gasto('g1', hace(3 * DIA)), gasto('g2', hace(2 * DIA)), gasto('g3', hace(DIA))])
    montar()
    const cajas = await screen.findAllByRole('checkbox')
    fireEvent.click(cajas[0]!)
    fireEvent.click(cajas[1]!)
    fireEvent.click(screen.getByRole('button', { name: /subir seleccionados/i }))
    await waitFor(() => expect(srv.llamadas).toHaveLength(2))
    expect(srv.llamadas.every((l) => l.length === 1)).toBe(true)
    expect(srv.llamadas.map((l) => l[0]!.op_id)).toEqual(['g1', 'g2'])
    const resultado = await screen.findByRole('list', { name: /resultado de la subida/i })
    expect(within(resultado).getAllByText(/✔/)).toHaveLength(2)
    expect((await db.outbox.toArray()).map((o) => o.op_id)).toEqual(['g3'])
  })

  it('tras subir con éxito pide un pull de datos', async () => {
    const pull = vi.fn(async () => ({
      server_time: '2026-11-18T15:00:00Z',
      cursor: null,
      catalogo: { productos: [], articulos: [], listas_precio: [], precios: [], unidades: [] },
      terceros: [],
      configuracion: [],
      stock: [],
      pedidos_venta: [],
      ordenes_compra: [],
    }))
    await db.outbox.put(gasto('g1', hace(DIA)))
    montar({ pull })
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1)) // pull de apertura
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /subir seleccionados/i }))
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(2))
  })

  it('sin red: ✖, la fila sigue pendiente y no se reintenta sola', async () => {
    srv.caido = true
    await db.outbox.put(gasto('g1', hace(DIA)))
    montar()
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /subir seleccionados/i }))
    const resultado = await screen.findByRole('list', { name: /resultado de la subida/i })
    expect(within(resultado).getByText(/✖.*sin conexión/i)).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(1)
    await new Promise((r) => setTimeout(r, 50))
    expect(srv.llamadas).toHaveLength(1)
  })

  it('error del servidor: ✖ con el mensaje y la fila queda en error', async () => {
    srv.manejadores['gasto.registrar'] = () => ({ status: 'error', error: { codigo: 'E_X', mensaje: 'Categoría inválida' } })
    await db.outbox.put(gasto('g1', hace(DIA)))
    montar()
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /subir seleccionados/i }))
    expect(await screen.findByText(/✖.*Categoría inválida/)).toBeInTheDocument()
    expect((await db.outbox.get('g1'))?.estado).toBe('error')
  })
})

describe('[RF-SYN-09] resumen de fotos tras subir', () => {
  it('muestra cuántas fotos se subieron, fallaron o esperan', async () => {
    const adjuntos = { subirListas: vi.fn(async () => ({ vinculadas: 2, fallidas: 1, esperando: 0 })) }
    await db.outbox.put(gasto('g1', hace(DIA)))
    render(
      <PendientesProvider db={db} servicio={crearPendientesService({ db, api: srv, adjuntos })}>
        <MemoryRouter>
          <Pendientes />
        </MemoryRouter>
      </PendientesProvider>,
    )
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /subir seleccionados/i }))
    expect(await screen.findByText(/Fotos: 2 subidas · 1 con error/)).toBeInTheDocument()
  })
})

describe('[RF-SYN-04] descartar', () => {
  it('pide confirmación y no borra si se cancela', async () => {
    await db.outbox.put(gasto('g1', hace(DIA)))
    montar()
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /^descartar/i }))
    expect(await screen.findByText(/no se puede deshacer/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(await db.outbox.count()).toBe(1)
  })

  it('al confirmar borra la op y su fila local, sin tocar el servidor', async () => {
    await db.outbox.put(gasto('g1', hace(DIA)))
    await db.gastos.put({ id: 'g-g1', valor: 15000, _pendiente: 'g1' })
    montar()
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /^descartar/i }))
    fireEvent.click(await screen.findByRole('button', { name: /sí, descartar/i }))
    await waitFor(async () => expect(await db.outbox.count()).toBe(0))
    expect(await db.gastos.count()).toBe(0)
    expect(srv.llamadas).toHaveLength(0)
    expect(await screen.findByText(/no tienes nada pendiente/i)).toBeInTheDocument()
  })
})

describe('[RF-SYN-03] banner con conteo y antigüedad', () => {
  it('«N sin subir (el más viejo: hace X)»', async () => {
    await db.outbox.bulkPut([gasto('g1', hace(3 * DIA)), gasto('g2', hace(60_000))])
    const servicio = crearPendientesService({ db, api: srv })
    render(
      <PendientesProvider db={db} servicio={servicio}>
        <MemoryRouter>
          <BannerPendientes />
        </MemoryRouter>
      </PendientesProvider>,
    )
    expect(await screen.findByText('2 sin subir (el más viejo: hace 3 d)')).toBeInTheDocument()
  })

  it('sin pendientes no muestra banner', async () => {
    const servicio = crearPendientesService({ db, api: srv })
    const { container } = render(
      <PendientesProvider db={db} servicio={servicio}>
        <MemoryRouter>
          <BannerPendientes />
        </MemoryRouter>
      </PendientesProvider>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(container).toBeEmptyDOMElement()
  })
})

describe('[RF-SYN-04] revisión: decidir con candidatos', () => {
  const enRevision = (): OpOutbox => ({
    op_id: 'c1',
    tipo: 'orden_compra.registrar',
    estado: 'revision',
    created_at: hace(DIA),
    datos: {
      orden: { id: 'oc1' },
      proveedor_nuevo: { id: 'n1', nombre: 'Luis Pérez', es_proveedor: true, telefono: '300' },
      items: [{ articulo_id: 'a1', cantidad: 1, costo_unitario: 5000 }],
    },
    resultado: { candidatos: [{ id: 'p1', nombre: 'Don Luis', telefono: '300' }] },
  })

  it('muestra candidatos y «usar existente» devuelve la fila a pendiente con la resolución', async () => {
    await db.outbox.put(enRevision())
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /decidir/i }))
    expect(await screen.findByText(/Don Luis/, { selector: '[data-candidato]' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /usar existente/i }))
    await waitFor(async () => expect((await db.outbox.get('c1'))?.estado).toBe('pendiente'))
    const datos = (await db.outbox.get('c1'))!.datos as { proveedor_nuevo: { resolucion: unknown } }
    expect(datos.proveedor_nuevo.resolucion).toEqual({ tipo: 'usar_existente', tercero_id: 'p1' })
    expect(srv.llamadas).toHaveLength(0) // resolver no envía: hay que pulsar Subir
  })

  it('«crear igual» resuelve con crear_igual', async () => {
    await db.outbox.put(enRevision())
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /decidir/i }))
    fireEvent.click(await screen.findByRole('button', { name: /crear igual/i }))
    await waitFor(async () => expect((await db.outbox.get('c1'))?.estado).toBe('pendiente'))
    const datos = (await db.outbox.get('c1'))!.datos as { proveedor_nuevo: { resolucion: unknown } }
    expect(datos.proveedor_nuevo.resolucion).toEqual({ tipo: 'crear_igual' })
  })

  it('al subir una op que devuelve revisión muestra ⚠ y la fila pasa a «requiere decisión»', async () => {
    srv.manejadores['gasto.registrar'] = () => ({ status: 'revision', resultado: { candidatos: [{ id: 'p1', nombre: 'Don Luis' }] } })
    await db.outbox.put(gasto('g1', hace(DIA)))
    montar()
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /subir seleccionados/i }))
    const resultado = await screen.findByRole('list', { name: /resultado de la subida/i })
    expect(within(resultado).getByText(/⚠/)).toBeInTheDocument()
    expect((await db.outbox.get('g1'))?.estado).toBe('revision')
  })
})

describe('[RF-SYN-10] exportar JSON desde la pantalla', () => {
  it('descarga un archivo con las ops pendientes', async () => {
    await db.outbox.bulkPut([gasto('g1', hace(DIA)), compra('c1', hace(DIA))])
    montar()
    fireEvent.click(await screen.findByRole('button', { name: /exportar json/i }))
    await waitFor(() => expect(descarga.descargarJson).toHaveBeenCalledTimes(1))
    const [nombre, contenido] = vi.mocked(descarga.descargarJson).mock.calls[0]!
    expect(nombre).toMatch(/^camino-pendientes-\d{4}-\d{2}-\d{2}\.json$/)
    const json = JSON.parse(contenido)
    expect(json.version).toBe(1)
    expect(json.ops).toHaveLength(2)
  })
})

describe('3 pendientes: filas', () => {
  it('renderiza una fila por pendiente', async () => {
    await db.outbox.bulkPut([gasto('g1', hace(DIA)), gasto('g2', hace(DIA)), gasto('g3', hace(DIA))])
    montar()
    await screen.findAllByRole('checkbox')
    expect(filas()).toHaveLength(3)
  })
})
