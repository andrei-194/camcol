// Pantalla «Nueva compra» (T-M5-01, CAM-61): compra inmediata (finca) y encargo, con y sin conexión. RF-COM-01 a 05,
// D-009, [E1]. Datos ficticios.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../application/auth/AuthProvider'
import type { CatalogoApi } from '../../application/catalogo/catalogoApi'
import { CatalogoProvider } from '../../application/catalogo/contexto'
import { CaminoDB } from '../../infra/db/db'
import { crearPendientesService } from '../../infra/sync/pendientesService'
import { crearServidorSimulado, type ServidorSimulado } from '../../infra/sync/servidorSimulado'
import { crearEscritor } from '../../infra/sync/writer'
import { AppRoutes } from '../../routes'
import { servicioFalso } from '../../test/servicioAuthFalso'
import { PendientesProvider } from '../pendientes/contexto'
import { CompraNueva } from './CompraNueva'

let db: CaminoDB
let srv: ServidorSimulado
let enLinea = true
const guardar = vi.fn(async () => ({ id: 'adj1' }))
const subirListas = vi.fn(async () => ({ vinculadas: 1, fallidas: 0, esperando: 0 }))

beforeEach(async () => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  srv = crearServidorSimulado()
  enLinea = true
  guardar.mockClear()
  subirListas.mockClear()
  await db.open()
  await db.productos.put({ id: 'pr1', nombre: 'Café Jardín', activo: true })
  await db.articulos.bulkPut([
    { id: 'a1', producto_id: 'pr1', nombre: 'Café pergamino 5 lb', unidad_inventario: 'und', controla_vencimiento: false, controla_lote: false, activo: true },
    { id: 'a2', producto_id: 'pr1', nombre: 'Crema de cacao, naranja', unidad_inventario: 'und', controla_vencimiento: true, controla_lote: true, activo: true },
    { id: 'a3', producto_id: 'pr1', nombre: 'Artículo retirado', unidad_inventario: 'und', activo: false },
  ])
  await db.terceros.bulkPut([
    { id: 'p1', nombre: 'Finca La Tulia', roles: ['proveedor'], es_proveedor: true },
    { id: 'p2', nombre: 'Cacao de Bolívar', roles: ['proveedor'], es_proveedor: true },
    { id: 'c1', nombre: 'Cafetería La Plaza', roles: ['cliente'], es_cliente: true },
  ])
})
afterEach(() => db.close())

const apiCatalogo = {} as unknown as CatalogoApi

function montar(ruta = '/compras/nueva', conAdjuntos = true) {
  const servicio = crearPendientesService({ db, api: srv })
  const escritor = crearEscritor({ db, api: srv, enLinea: () => enLinea })
  return render(
    <CatalogoProvider db={db} api={apiCatalogo} refrescar={async () => {}}>
      <PendientesProvider db={db} servicio={servicio} escritor={escritor} adjuntos={conAdjuntos ? ({ guardar, subirListas } as never) : undefined}>
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route path="/compras/nueva" element={<CompraNueva />} />
            <Route path="/compras" element={<p>Pantalla de compras</p>} />
            <Route path="/pendientes" element={<p>Pantalla de pendientes</p>} />
          </Routes>
        </MemoryRouter>
      </PendientesProvider>
    </CatalogoProvider>,
  )
}

const escribir = (etiqueta: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const registrar = () => fireEvent.click(screen.getByRole('button', { name: /Registrar (compra|encargo)/ }))
const proveedor = (id: string) => fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: id } })
/** Llena la primera línea con el café. */
const lineaCafe = (cantidad = '20', costo = '30.000') => {
  escribir('Artículo 1', 'a1')
  escribir('Cantidad 1', cantidad)
  escribir('Costo unitario 1', costo)
}
const compraLista = async () => {
  await screen.findByRole('option', { name: 'Finca La Tulia' })
  proveedor('p1')
  lineaCafe()
}

describe('[RF-COM-01] formulario', () => {
  it('trae la compra inmediata por defecto, una línea y solo proveedores (no clientes ni artículos retirados)', async () => {
    montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Nueva compra' })).toBeInTheDocument()
    const tipo = screen.getByRole('group', { name: 'Tipo de compra' })
    expect(within(tipo).getByRole('button', { name: 'Inmediata' })).toHaveAttribute('aria-pressed', 'true')
    const prov = await screen.findByLabelText('Proveedor')
    await screen.findByRole('option', { name: 'Finca La Tulia' }) // los proveedores llegan de Dexie, en vivo
    expect(within(prov).getAllByRole('option').map((o) => o.textContent)).toEqual(['Elige…', 'Cacao de Bolívar', 'Finca La Tulia', 'Nuevo proveedor'])
    const art = screen.getByLabelText('Artículo 1')
    expect(within(art).getAllByRole('option').map((o) => o.textContent)).toEqual(['Elige…', 'Café pergamino 5 lb', 'Crema de cacao, naranja'])
    expect(screen.getByText(/funciona sin conexión/i)).toBeInTheDocument()
  })

  it('el total sube con las líneas y se escribe en pesos', async () => {
    montar()
    await compraLista()
    expect(screen.getByLabelText('Total de la compra').querySelector('data[value="600000"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro artículo' }))
    escribir('Artículo 2', 'a2')
    escribir('Cantidad 2', '2,5')
    escribir('Costo unitario 2', '10.000')
    expect(screen.getByLabelText('Total de la compra').querySelector('data[value="625000"]')).not.toBeNull()
  })

  it('se pueden agregar y quitar líneas, pero siempre queda una', async () => {
    montar()
    await screen.findByLabelText('Proveedor')
    expect(screen.queryByRole('button', { name: /Quitar artículo/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro artículo' }))
    expect(screen.getByLabelText('Artículo 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar artículo 2' }))
    expect(screen.queryByLabelText('Artículo 2')).toBeNull()
    expect(screen.queryByRole('button', { name: /Quitar artículo/ })).toBeNull()
  })

  it('[RN-COM-02] el vencimiento y el lote aparecen solo para artículos que lo controlan, y solo al comprar de inmediato', async () => {
    montar()
    await screen.findByLabelText('Proveedor')
    escribir('Artículo 1', 'a1')
    expect(screen.queryByLabelText(/Vencimiento 1/)).toBeNull()
    escribir('Artículo 1', 'a2')
    expect(screen.getByLabelText(/Vencimiento 1/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Lote 1/)).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de compra' })).getByRole('button', { name: 'Encargo' }))
    expect(screen.queryByLabelText(/Vencimiento 1/)).toBeNull()
  })

  it('inmediata pide el medio de pago; encargo pide la fecha esperada y cambia el botón', async () => {
    montar()
    await screen.findByLabelText('Proveedor')
    const medios = screen.getByRole('radiogroup', { name: 'Medio de pago' })
    expect(within(medios).getByRole('radio', { name: 'Efectivo' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByLabelText('Fecha esperada')).toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de compra' })).getByRole('button', { name: 'Encargo' }))
    expect(screen.queryByRole('radiogroup', { name: 'Medio de pago' })).toBeNull()
    expect(screen.getByLabelText('Fecha esperada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar encargo' })).toBeInTheDocument()
  })

  it('«Nuevo proveedor» muestra nombre y teléfono', async () => {
    montar()
    await screen.findByLabelText('Proveedor')
    expect(screen.queryByLabelText('Nombre del proveedor')).toBeNull()
    proveedor('__nuevo__')
    expect(screen.getByLabelText('Nombre del proveedor')).toBeInTheDocument()
    expect(screen.getByLabelText('Teléfono (opcional)')).toBeInTheDocument()
  })

  it('«Volver» abre Compras cuando se llega directo', () => {
    montar()
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/compras')
  })
})

describe('[RF-COM-01] validación en pantalla', () => {
  it('sin llenar nada muestra los errores, lleva el foco al primero y no envía ni guarda nada', async () => {
    montar()
    await screen.findByLabelText('Proveedor')
    registrar()
    expect(await screen.findByText('Elige el proveedor o crea uno nuevo.')).toBeInTheDocument()
    expect(screen.getByText('Elige el artículo.')).toBeInTheDocument()
    expect(screen.getByText('Escribe la cantidad.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el costo unitario.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Proveedor')).toHaveFocus())
    expect(srv.llamadas).toHaveLength(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('una compra inmediata con un artículo que vence exige la fecha', async () => {
    montar()
    await screen.findByLabelText('Proveedor')
    proveedor('p1')
    escribir('Artículo 1', 'a2')
    escribir('Cantidad 1', '4')
    escribir('Costo unitario 1', '12.000')
    registrar()
    expect(await screen.findByText('Escribe la fecha de vencimiento.')).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('el encargo sin fecha esperada se frena', async () => {
    montar()
    await compraLista()
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de compra' })).getByRole('button', { name: 'Encargo' }))
    registrar()
    expect(await screen.findByText('Elige la fecha en que esperas recibirla.')).toBeInTheDocument()
  })
})

describe('[RF-COM-02][RF-COM-05] guardar', () => {
  it('compra inmediata con conexión: envía orden, ítems, recepción total y pago por el total exacto', async () => {
    montar()
    await compraLista()
    registrar()
    expect(await screen.findByText(/compra registrada/i)).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(1)
    const op = srv.llamadas[0]![0]!
    expect(op.tipo).toBe('orden_compra.registrar')
    const d = op.datos as { orden: Record<string, unknown>; items: Array<Record<string, unknown>>; recepcion: { items: unknown[] }; pagos: Array<Record<string, unknown>> }
    expect(d.orden).toMatchObject({ proveedor_id: 'p1', modalidad: 'inmediata', condicion_pago: 'contado' })
    expect(d.items).toEqual([expect.objectContaining({ articulo_id: 'a1', cantidad: 20, costo_unitario: 30000 })])
    expect(d.recepcion.items).toHaveLength(1)
    expect(d.pagos).toEqual([expect.objectContaining({ medio: 'efectivo', valor: 600000 })])
    expect(await db.outbox.count()).toBe(0)
  })

  it('con el medio de pago elegido y lote y vencimiento en el artículo que lo pide', async () => {
    montar()
    await screen.findByRole('option', { name: 'Cacao de Bolívar' })
    proveedor('p2')
    escribir('Artículo 1', 'a2')
    escribir('Cantidad 1', '4')
    escribir('Costo unitario 1', '12.000')
    escribir(/Vencimiento 1/, '2027-05-01')
    escribir(/Lote 1/, 'L-7')
    fireEvent.click(screen.getByRole('radio', { name: 'Nequi' }))
    registrar()
    await screen.findByText(/compra registrada/i)
    const d = srv.llamadas[0]![0]!.datos as { recepcion: { items: Array<Record<string, unknown>> }; pagos: Array<Record<string, unknown>> }
    expect(d.recepcion.items[0]).toMatchObject({ cantidad: 4, lote_codigo: 'L-7', fecha_vencimiento: '2027-05-01' })
    expect(d.pagos[0]).toMatchObject({ medio: 'nequi', valor: 48000 })
  })

  it('[D-009][E1] sin conexión la encola con su fila ⏳, sin enviar nada, y manda a Pendientes', async () => {
    enLinea = false
    montar()
    await compraLista()
    registrar()
    expect(await screen.findByText(/guardada en este teléfono/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pendientes' })).toHaveAttribute('href', '/pendientes')
    expect(srv.llamadas).toHaveLength(0)
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]!.tipo).toBe('orden_compra.registrar')
    const ordenes = await db.ordenes_compra.toArray()
    expect(ordenes).toHaveLength(1)
    expect(ordenes[0]).toMatchObject({ proveedor_id: 'p1', estado: 'recibida', total: 600000, _pendiente: ops[0]!.op_id })
  })

  it('proveedor nuevo sin conexión: viaja en la misma op y queda su fila ⏳ como proveedor', async () => {
    enLinea = false
    montar()
    await screen.findByLabelText('Proveedor')
    proveedor('__nuevo__')
    escribir('Nombre del proveedor', 'Don Hernán')
    escribir('Teléfono (opcional)', '300 123 4567')
    lineaCafe('3', '10.000')
    registrar()
    await screen.findByText(/guardada en este teléfono/i)
    const [op] = await db.outbox.toArray()
    const d = op!.datos as { orden: Record<string, unknown>; proveedor_nuevo: Record<string, unknown> }
    expect(d.orden['proveedor_id']).toBeUndefined()
    expect(d.proveedor_nuevo).toMatchObject({ nombre: 'Don Hernán', telefono: '300 123 4567', es_proveedor: true })
    const nuevo = (await db.terceros.toArray()).find((t) => t['nombre'] === 'Don Hernán')
    expect(nuevo).toMatchObject({ roles: ['proveedor'], _pendiente: op!.op_id })
  })

  it('un proveedor parecido a uno existente pide decidir en Pendientes, sin perder la compra', async () => {
    srv.manejadores['orden_compra.registrar'] = () => ({ status: 'revision', resultado: { candidatos: [{ nombre: 'Don Hernán Gómez', telefono: '3001234567' }] } })
    montar()
    await screen.findByLabelText('Proveedor')
    proveedor('__nuevo__')
    escribir('Nombre del proveedor', 'Don Hernán')
    lineaCafe('3', '10.000')
    registrar()
    expect(await screen.findByText(/posible duplicado/i)).toBeInTheDocument()
    expect(screen.getByText(/Don Hernán Gómez/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pendientes' })).toHaveAttribute('href', '/pendientes')
    expect(await db.outbox.count()).toBe(1)
    expect((await db.outbox.toArray())[0]!.estado).toBe('revision')
  })

  it('encargo: envía solo la orden con la fecha esperada, sin recepción ni pagos', async () => {
    montar()
    await compraLista()
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de compra' })).getByRole('button', { name: 'Encargo' }))
    escribir('Fecha esperada', '2999-01-31')
    registrar()
    expect(await screen.findByText(/encargo registrado/i)).toBeInTheDocument()
    const d = srv.llamadas[0]![0]!.datos as Record<string, unknown>
    expect(d['orden']).toMatchObject({ modalidad: 'encargo', fecha_esperada: '2999-01-31' })
    expect(d['recepcion']).toBeUndefined()
    expect(d['pagos']).toBeUndefined()
  })

  it('si el servidor rechaza la compra, lo dice y deja el formulario con lo escrito', async () => {
    srv.manejadores['orden_compra.registrar'] = () => ({ status: 'error', error: { codigo: 'E_PAGO', mensaje: 'los pagos deben sumar el total' } })
    montar()
    await compraLista()
    registrar()
    expect(await screen.findByRole('alert')).toHaveTextContent(/los pagos deben sumar el total/i)
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue('20')
    expect(screen.getByLabelText('Proveedor')).toHaveValue('p1')
  })

  it('con foto la guarda como soporte de la compra y avisa si no se pudo guardar', async () => {
    enLinea = false
    montar()
    await compraLista()
    const archivo = new File(['x'], 'recibo.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/Foto del soporte/), { target: { files: [archivo] } })
    registrar()
    await screen.findByText(/guardada en este teléfono/i)
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ entidad: 'orden_compra', archivo }))
    guardar.mockRejectedValueOnce(new Error('sin espacio'))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar otra compra' }))
    await screen.findByLabelText('Proveedor')
    proveedor('p1')
    lineaCafe('1', '1.000')
    fireEvent.change(screen.getByLabelText(/Foto del soporte/), { target: { files: [archivo] } })
    registrar()
    expect(await screen.findByText(/la foto no se pudo guardar/i)).toBeInTheDocument()
  })

  it('«Registrar otra compra» deja el formulario limpio', async () => {
    montar()
    await compraLista()
    registrar()
    await screen.findByText(/compra registrada/i)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar otra compra' }))
    expect(screen.getByLabelText('Proveedor')).toHaveValue('')
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Inmediata' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('el botón se deshabilita mientras guarda para no duplicar la compra', async () => {
    let soltar: () => void = () => {}
    const original = srv.aplicar.bind(srv)
    srv.aplicar = (ops, signal) => new Promise((ok) => (soltar = () => ok(original(ops, signal))))
    montar()
    await compraLista()
    registrar()
    await waitFor(() => expect(screen.getByRole('button', { name: /Guardando/ })).toBeDisabled())
    soltar()
    expect(await screen.findByText(/compra registrada/i)).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(1)
  })
})

describe('rutas de compras', () => {
  it('/compras/nueva es la pantalla real y /compras ofrece el camino a «Nueva compra»', async () => {
    const servicio = crearPendientesService({ db, api: srv })
    const escritor = crearEscritor({ db, api: srv, enLinea: () => enLinea })
    const enRuta = (ruta: string) =>
      render(
        <AuthProvider servicio={servicioFalso()}>
          <CatalogoProvider db={db} api={apiCatalogo} refrescar={async () => {}}>
            <PendientesProvider db={db} servicio={servicio} escritor={escritor}>
              <MemoryRouter initialEntries={[ruta]}>
                <AppRoutes />
              </MemoryRouter>
            </PendientesProvider>
          </CatalogoProvider>
        </AuthProvider>,
      )
    const { unmount } = enRuta('/compras')
    expect(await screen.findByRole('heading', { level: 1, name: 'Compras' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Nueva compra' })).toHaveAttribute('href', '/compras/nueva')
    unmount()
    enRuta('/compras/nueva')
    expect(await screen.findByRole('heading', { level: 1, name: 'Nueva compra' })).toBeInTheDocument()
    expect(screen.queryByText(/llega pronto/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Registrar compra' })).toBeInTheDocument()
  })
})

describe('revisión de T-M5-01: unidades, estados de datos, errores y ramas', () => {
  it('[P1] bajo la cantidad se lee cómo se interpretó y en qué unidad: «Se registrará: 1.500 und»', async () => {
    montar()
    await screen.findByLabelText('Proveedor')
    escribir('Artículo 1', 'a1')
    escribir('Cantidad 1', '1.500')
    expect(screen.getByText('Se registrará: 1.500 und')).toBeInTheDocument()
    escribir('Cantidad 1', '0.500')
    expect(screen.getByText('Se registrará: 0,5 und')).toBeInTheDocument()
    escribir('Cantidad 1', 'abc')
    expect(screen.queryByText(/Se registrará/)).toBeNull()
  })

  it('la cantidad por encima del tope se frena con su mensaje', async () => {
    montar()
    await compraLista()
    escribir('Cantidad 1', '1.000.000')
    registrar()
    expect(await screen.findByText('La cantidad es demasiado grande (máximo 999.999).')).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('si el catálogo está vacío lo dice; si no se puede leer, también', async () => {
    await db.articulos.clear()
    const { unmount } = montar()
    expect(await screen.findByText(/no hay artículos en el catálogo/i)).toBeInTheDocument()
    unmount()
    vi.spyOn(db.articulos, 'toArray').mockRejectedValue(new Error('IndexedDB no disponible'))
    montar()
    expect(await screen.findByText(/no se pudo leer el catálogo/i)).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('si no se pueden leer los proveedores, lo dice y aún deja crear uno nuevo', async () => {
    vi.spyOn(db.terceros, 'toArray').mockRejectedValue(new Error('IndexedDB no disponible'))
    montar()
    expect(await screen.findByText(/no se pudieron leer los proveedores/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Nuevo proveedor' })).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('un proveedor que desaparece tras elegirlo se frena con un mensaje claro y no se envía nada', async () => {
    montar()
    await compraLista()
    await db.terceros.delete('p1')
    registrar()
    expect(await screen.findByText('Ese proveedor ya no está disponible. Elígelo de nuevo.')).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('un artículo que deja de estar activo tras elegirlo se frena, en vez de saltarse el vencimiento', async () => {
    montar()
    await screen.findByRole('option', { name: 'Finca La Tulia' })
    proveedor('p1')
    escribir('Artículo 1', 'a2')
    escribir('Cantidad 1', '4')
    escribir('Costo unitario 1', '12.000')
    await db.articulos.update('a2', { activo: false })
    registrar()
    expect(await screen.findByText('Ese artículo ya no está disponible. Elígelo de nuevo.')).toBeInTheDocument()
    expect(srv.llamadas).toHaveLength(0)
  })

  it('al quitar una línea con errores, los mensajes no quedan sobre la línea equivocada', async () => {
    montar()
    await screen.findByLabelText('Proveedor')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro artículo' }))
    registrar()
    await screen.findAllByText('Elige el artículo.')
    expect(screen.getAllByText('Elige el artículo.')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar artículo 1' }))
    expect(screen.queryByText('Elige el artículo.')).toBeNull()
    expect(screen.getByLabelText('Artículo 1')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('si solo falla el total, el foco va al mensaje', async () => {
    montar()
    await compraLista()
    escribir('Cantidad 1', '999.999')
    escribir('Costo unitario 1', '999.999.999')
    registrar()
    const alerta = await screen.findByText('El total de la compra es demasiado grande.')
    await waitFor(() => expect(alerta).toHaveFocus())
  })

  it('con la sesión vencida (401) la deja guardada en el teléfono y lo dice', async () => {
    srv.forzar.push({ clase: 'no_aplicado', http: 401, mensaje: 'JWT expired' })
    montar()
    await compraLista()
    registrar()
    expect(await screen.findByText(/tu sesión venció/i)).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(1)
  })

  it('un fallo del servidor que no es de red muestra el aviso del escritor y la deja en el teléfono', async () => {
    srv.forzar.push({ clase: 'no_aplicado', http: 503, mensaje: 'upstream' })
    montar()
    await compraLista()
    registrar()
    expect(await screen.findByText(/el servidor no pudo aplicarlo ahora/i)).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(1)
  })

  it('si la aplicación aún no tiene escritor, avisa y no pierde lo escrito', async () => {
    const servicio = crearPendientesService({ db, api: srv })
    render(
      <CatalogoProvider db={db} api={apiCatalogo} refrescar={async () => {}}>
        <PendientesProvider db={db} servicio={servicio}>
          <MemoryRouter initialEntries={['/compras/nueva']}>
            <Routes>
              <Route path="/compras/nueva" element={<CompraNueva />} />
            </Routes>
          </MemoryRouter>
        </PendientesProvider>
      </CatalogoProvider>,
    )
    await compraLista()
    registrar()
    expect(await screen.findByRole('alert')).toHaveTextContent(/aún no está lista/i)
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue('20')
  })

  it('un encargo también guarda la foto del soporte', async () => {
    enLinea = false
    montar()
    await compraLista()
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de compra' })).getByRole('button', { name: 'Encargo' }))
    escribir('Fecha esperada', '2999-01-31')
    const archivo = new File(['x'], 'cotizacion.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/Foto del soporte/), { target: { files: [archivo] } })
    registrar()
    await screen.findByText(/encargo guardado en este teléfono/i)
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ entidad: 'orden_compra', archivo }))
  })
})
