import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../application/auth/AuthProvider'
import { CatalogoProvider } from '../../application/catalogo/contexto'
import type { CatalogoApi } from '../../application/catalogo/catalogoApi'
import { CaminoDB } from '../../infra/db/db'
import { AppRoutes } from '../../routes'
import { servicioFalso } from '../../test/servicioAuthFalso'
import { Catalogo } from './Catalogo'
import { FormularioArticulo } from './FormularioArticulo'
import { ListasPrecio } from './ListasPrecio'
import { SelectorListaPrecio } from './SelectorListaPrecio'

let db: CaminoDB
let api: { [K in keyof CatalogoApi]: ReturnType<typeof vi.fn> }
let refrescar: ReturnType<typeof vi.fn>
const OK = { ok: true as const }

beforeEach(async () => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  await db.open()
  api = {
    crearProducto: vi.fn(async () => ({ ok: true, id: 'p-nuevo' })),
    guardarArticulo: vi.fn(async () => OK),
    guardarPrecio: vi.fn(async () => OK),
    eliminarPrecio: vi.fn(async () => OK),
    crearLista: vi.fn(async () => OK),
    asignarListaCliente: vi.fn(async () => OK),
  }
  refrescar = vi.fn(async () => {})
  await db.unidades.bulkPut([{ codigo: 'g' }, { codigo: 'lb' }, { codigo: 'und' }].map((u) => ({ ...u, nombre: u.codigo })))
  await db.listas_precio.bulkPut([
    { id: 'l-pub', nombre: 'Público', es_publica: true },
    { id: 'l-may', nombre: 'Mayorista', es_publica: false },
  ])
  await db.productos.put({ id: 'p1', nombre: 'Café Villa Luz', activo: true })
  await db.articulos.bulkPut([
    {
      id: 'a1', producto_id: 'p1', nombre: 'Café Villa Luz 250 g', codigo: 'CVL-250', presentacion_cantidad: 250,
      presentacion_unidad: 'g', controla_lote: false, controla_vencimiento: false, permite_sin_stock: true, activo: true,
    },
    {
      id: 'a2', producto_id: 'p1', nombre: 'Café Villa Luz 5 lb', codigo: 'CVL-5LB', presentacion_cantidad: 5,
      presentacion_unidad: 'lb', controla_lote: false, controla_vencimiento: false, permite_sin_stock: true, activo: false,
    },
  ])
  await db.precios.bulkPut([
    { id: 'pr1', lista_id: 'l-pub', articulo_id: 'a1', precio: 20000, cantidad_minima: 1 },
    { id: 'pr2', lista_id: 'l-pub', articulo_id: 'a1', precio: 19000, cantidad_minima: 2 },
  ])
  await db.terceros.put({ id: 't1', nombre: 'Cafetería Sol', es_cliente: true, es_proveedor: false, lista_precio_id: null, roles: ['cliente'] })
})
afterEach(() => {
  vi.restoreAllMocks()
  db.close()
})

const sinRed = () => {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
}

function montar(ruta: string) {
  return render(
    <CatalogoProvider db={db} api={api as unknown as CatalogoApi} refrescar={refrescar}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/catalogo/listas" element={<ListasPrecio />} />
          <Route path="/catalogo/articulos/nuevo" element={<FormularioArticulo />} />
          <Route path="/catalogo/articulos/:id" element={<FormularioArticulo />} />
        </Routes>
      </MemoryRouter>
    </CatalogoProvider>,
  )
}
const escribir = (etiqueta: string | RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })

describe('[RF-CAT-04] catálogo local', () => {
  it('lista productos y artículos con su precio público leyendo de Dexie, sin llamar a la red', async () => {
    sinRed()
    montar('/catalogo')
    expect(await screen.findByText('Café Villa Luz 250 g')).toBeInTheDocument()
    expect(screen.getByText('Café Villa Luz 5 lb')).toBeInTheDocument()
    expect(screen.getByText('$ 20.000')).toBeInTheDocument()
    expect(screen.getByText(/Desde 2 und/)).toHaveTextContent('$ 19.000')
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    expect(Object.values(api).every((f) => f.mock.calls.length === 0)).toBe(true)
  })

  it('con el catálogo vacío muestra un estado vacío', async () => {
    await db.articulos.clear()
    await db.productos.clear()
    montar('/catalogo')
    expect(await screen.findByText(/Todavía no hay productos/)).toBeInTheDocument()
  })

  it('la ruta /catalogo está protegida y enlazada desde el inicio', async () => {
    render(
      <AuthProvider servicio={servicioFalso({ sesion: { tipo: 'ninguna', caducada: false } })}>
        <MemoryRouter initialEntries={['/catalogo']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})

describe('[RF-CAT-01] artículos', () => {
  it('crea un artículo de un producto existente con presentación, unidad y banderas', async () => {
    montar('/catalogo/articulos/nuevo')
    await screen.findByLabelText('Producto')
    escribir('Producto', 'p1')
    escribir('Nombre del artículo', 'Café Villa Luz 500 g')
    escribir('Código', 'CVL-500')
    escribir('Cantidad de la presentación', '500')
    escribir('Unidad', 'g')
    fireEvent.click(screen.getByLabelText('Controla vencimiento'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar artículo' }))
    await waitFor(() => expect(api.guardarArticulo).toHaveBeenCalledTimes(1))
    expect(api.guardarArticulo).toHaveBeenCalledWith(null, {
      producto_id: 'p1', nombre: 'Café Villa Luz 500 g', codigo: 'CVL-500', presentacion_cantidad: 500,
      presentacion_unidad: 'g', controla_lote: false, controla_vencimiento: true, permite_sin_stock: true, activo: true,
    })
    await waitFor(() => expect(refrescar).toHaveBeenCalled())
  })

  it('crea el producto nuevo antes del artículo', async () => {
    montar('/catalogo/articulos/nuevo')
    await screen.findByLabelText('Producto')
    escribir('Producto', '__nuevo')
    escribir('Nombre del producto', 'Panela')
    escribir('Nombre del artículo', 'Panela 1 kg')
    escribir('Cantidad de la presentación', '1')
    escribir('Unidad', 'und')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar artículo' }))
    await waitFor(() => expect(api.guardarArticulo).toHaveBeenCalled())
    expect(api.crearProducto).toHaveBeenCalledWith('Panela')
    expect(api.guardarArticulo.mock.calls[0][1].producto_id).toBe('p-nuevo')
  })

  it('valida nombre y cantidad antes de enviar', async () => {
    montar('/catalogo/articulos/nuevo')
    await screen.findByLabelText('Producto')
    escribir('Producto', 'p1')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar artículo' }))
    expect(await screen.findByText('Escribe el nombre del artículo.')).toBeInTheDocument()
    expect(screen.getByText('La cantidad debe ser mayor que cero.')).toBeInTheDocument()
    expect(api.guardarArticulo).not.toHaveBeenCalled()
  })

  it('sin conexión no deja guardar: «Requiere conexión»', async () => {
    sinRed()
    montar('/catalogo/articulos/nuevo')
    expect(await screen.findByText(/Requiere conexión/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar artículo' })).toBeDisabled()
    expect(api.guardarArticulo).not.toHaveBeenCalled()
  })

  it('muestra el rechazo del servidor (p. ej. código repetido)', async () => {
    api.guardarArticulo.mockResolvedValueOnce({ ok: false, motivo: 'rechazo', mensaje: 'Ya existe ese código.' })
    montar('/catalogo/articulos/a1')
    await screen.findByDisplayValue('Café Villa Luz 250 g')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar artículo' }))
    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
    expect(refrescar).not.toHaveBeenCalled()
  })

  it('edita un artículo existente (carga sus datos y envía su id)', async () => {
    montar('/catalogo/articulos/a2')
    expect(await screen.findByDisplayValue('Café Villa Luz 5 lb')).toBeInTheDocument()
    expect(screen.getByLabelText('Unidad')).toHaveValue('lb')
    expect(screen.getByLabelText('Activo')).not.toBeChecked()
    fireEvent.click(screen.getByLabelText('Activo'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar artículo' }))
    await waitFor(() => expect(api.guardarArticulo).toHaveBeenCalled())
    expect(api.guardarArticulo.mock.calls[0][0]).toBe('a2')
    expect(api.guardarArticulo.mock.calls[0][1]).toMatchObject({ activo: true, presentacion_cantidad: 5, presentacion_unidad: 'lb' })
  })
})

describe('[RF-CAT-02] listas y escalones', () => {
  it('agrega un escalón por cantidad (la promo «Llévate 2») a la lista pública', async () => {
    montar('/catalogo/articulos/a1')
    await screen.findByText(/Desde 2 und/)
    escribir('Lista', 'l-pub')
    escribir('Cantidad mínima', '3')
    escribir('Precio (COP)', '18.500')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar precio' }))
    await waitFor(() => expect(api.guardarPrecio).toHaveBeenCalled())
    expect(api.guardarPrecio).toHaveBeenCalledWith({ lista_id: 'l-pub', articulo_id: 'a1', cantidad_minima: 3, precio: 18500 })
    await waitFor(() => expect(refrescar).toHaveBeenCalled())
  })

  it('rechaza precios y cantidades inválidos', async () => {
    montar('/catalogo/articulos/a1')
    await screen.findByText(/Desde 2 und/)
    escribir('Cantidad mínima', '0')
    escribir('Precio (COP)', '')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar precio' }))
    expect(await screen.findByText('La cantidad mínima debe ser mayor que cero.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el precio en pesos.')).toBeInTheDocument()
    expect(api.guardarPrecio).not.toHaveBeenCalled()
  })

  it('quita un escalón (no el precio base)', async () => {
    montar('/catalogo/articulos/a1')
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar precio desde 2 en Público' }))
    await waitFor(() => expect(api.eliminarPrecio).toHaveBeenCalledWith('pr2'))
    await waitFor(() => expect(refrescar).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Quitar precio desde 1 en Público' })).not.toBeInTheDocument()
  })

  it('sin conexión no se pueden cambiar precios', async () => {
    sinRed()
    montar('/catalogo/articulos/a1')
    expect(await screen.findByRole('button', { name: 'Guardar precio' })).toBeDisabled()
  })

  it('crea una lista adicional y la pública no se puede repetir', async () => {
    montar('/catalogo/listas')
    expect(await screen.findByText('Mayorista')).toBeInTheDocument()
    expect(screen.getByText('Pública')).toBeInTheDocument()
    escribir('Nombre de la lista', 'Cafeterías')
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }))
    await waitFor(() => expect(api.crearLista).toHaveBeenCalledWith('Cafeterías'))
    await waitFor(() => expect(refrescar).toHaveBeenCalled())
  })
})

describe('[RF-CAT-03] lista de precios de un cliente', () => {
  it('el selector guarda la lista elegida en el tercero', async () => {
    render(
      <CatalogoProvider db={db} api={api as unknown as CatalogoApi} refrescar={refrescar}>
        <SelectorListaPrecio terceroId="t1" valor={null} />
      </CatalogoProvider>,
    )
    const sel = await screen.findByLabelText('Lista de precios')
    await within(sel).findByRole('option', { name: 'Mayorista' })
    fireEvent.change(sel, { target: { value: 'l-may' } })
    await waitFor(() => expect(api.asignarListaCliente).toHaveBeenCalledWith('t1', 'l-may'))
    await waitFor(() => expect(refrescar).toHaveBeenCalled())
  })

  it('elegir «Pública» quita la lista del cliente (null)', async () => {
    render(
      <CatalogoProvider db={db} api={api as unknown as CatalogoApi} refrescar={refrescar}>
        <SelectorListaPrecio terceroId="t1" valor="l-may" />
      </CatalogoProvider>,
    )
    const sel = await screen.findByLabelText('Lista de precios')
    await within(sel).findByRole('option', { name: 'Mayorista' })
    fireEvent.change(sel, { target: { value: '' } })
    await waitFor(() => expect(api.asignarListaCliente).toHaveBeenCalledWith('t1', null))
  })

  it('sin conexión queda deshabilitado con «Requiere conexión»', async () => {
    sinRed()
    render(
      <CatalogoProvider db={db} api={api as unknown as CatalogoApi} refrescar={refrescar}>
        <SelectorListaPrecio terceroId="t1" valor={null} />
      </CatalogoProvider>,
    )
    expect(await screen.findByLabelText('Lista de precios')).toBeDisabled()
    expect(screen.getByText(/Requiere conexión/)).toBeInTheDocument()
  })

  it('la pantalla de listas permite asignar una lista a un cliente', async () => {
    montar('/catalogo/listas')
    await screen.findByText('Mayorista')
    escribir('Cliente', 't1')
    const sel = await screen.findByLabelText('Lista de precios')
    fireEvent.change(sel, { target: { value: 'l-may' } })
    await waitFor(() => expect(api.asignarListaCliente).toHaveBeenCalledWith('t1', 'l-may'))
  })
})
