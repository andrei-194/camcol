// Marco de la app (T-D3, CAM-108, docs/producto/diseno.md): cabecera de café con logo, barra inferior de cinco destinos con
// el disco central, menú flotante de acciones rápidas y rutas de Ventas, Compras, Inventario y Más.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../../application/auth/AuthProvider'
import { CaminoDB } from '../../infra/db/db'
import { AppRoutes } from '../../routes'
import { servicioFalso } from '../../test/servicioAuthFalso'
import { BarraSuperior } from '../componentes/BarraSuperior'
import { BarraInferior } from './BarraInferior'
import { MenuAcciones } from './MenuAcciones'

let db: CaminoDB
beforeEach(async () => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  await db.open()
})
afterEach(() => db.close())

const op = (op_id: string) => ({ op_id, tipo: 'compra.crear', datos: {}, estado: 'pendiente' as const, created_at: '2026-11-18T15:00:00Z' })

function enSesion(ruta: string) {
  return render(
    <AuthProvider servicio={servicioFalso()}>
      <MemoryRouter initialEntries={[ruta]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('BarraSuperior de café con logo', () => {
  it('es café, lleva el filo de trigo y el logo decorativo, y conserva el h1 y Volver', () => {
    render(
      <MemoryRouter>
        <BarraSuperior titulo="Ajustes" volverA="/" />
      </MemoryRouter>,
    )
    const cabecera = screen.getByRole('banner')
    expect(cabecera.className).toContain('bg-cafe')
    expect(cabecera.className).toContain('border-trigo')
    expect(cabecera.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/')
  })

  it('la barra de estado también es café y sus indicadores se leen sobre él', async () => {
    enSesion('/')
    const region = await screen.findByRole('region', { name: 'Estado de la app' })
    expect(region.className).toContain('bg-cafe')
  })
})

describe('BarraInferior', () => {
  const montar = (ruta = '/') =>
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <BarraInferior db={db} />
      </MemoryRouter>,
    )

  it('es una navegación con cinco destinos en orden y el Inicio en el centro', () => {
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    const enlaces = within(nav).getAllByRole('link')
    expect(enlaces.map((e) => e.textContent?.replace(/\d+$/, ''))).toEqual(['Ventas', 'Compras', 'Inicio', 'Inventario', 'Más'])
    expect(enlaces.map((e) => e.getAttribute('href'))).toEqual(['/ventas', '/compras', '/', '/inventario', '/mas'])
  })

  it('marca la pantalla actual con aria-current; Inicio solo en la raíz', () => {
    montar('/ventas')
    expect(screen.getByRole('link', { name: 'Ventas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })

  it('en la raíz solo Inicio está activo', () => {
    montar('/')
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Ventas' })).not.toHaveAttribute('aria-current')
  })

  it('el disco central lleva el logo y el anillo incompleto, decorativos', () => {
    montar()
    const inicio = screen.getByRole('link', { name: 'Inicio' })
    expect(inicio.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2)
    expect(inicio.querySelector('circle[stroke-dasharray]')).not.toBeNull()
  })

  it('el contador de pendientes va en Más, oculto a lectores de pantalla, y no cambia su nombre', async () => {
    await db.outbox.bulkAdd([op('a'), op('b')])
    montar()
    const mas = screen.getByRole('link', { name: 'Más' })
    await waitFor(() => expect(within(mas).getByText('2')).toBeInTheDocument())
    expect(within(mas).getByText('2')).toHaveAttribute('aria-hidden', 'true')
  })

  it('sin pendientes no muestra contador', () => {
    montar()
    expect(within(screen.getByRole('link', { name: 'Más' })).queryByText(/^\d+$/)).toBeNull()
  })
})

describe('MenuAcciones', () => {
  const montar = () =>
    render(
      <MemoryRouter>
        <MenuAcciones />
      </MemoryRouter>,
    )

  it('cerrado: botón «Acciones rápidas» con aria-expanded false y sin enlaces', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Acciones rápidas' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('abierto: Nuevo pedido, Nueva compra y Gasto, con el foco en el primero', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Acciones rápidas' }))
    const menu = screen.getByRole('menu', { name: 'Acciones rápidas' })
    const items = within(menu).getAllByRole('menuitem')
    ;['Nuevo pedido', 'Nueva compra', 'Gasto'].forEach((nombre, i) => expect(items[i]).toHaveAccessibleName(nombre))
    expect(items.map((i) => i.getAttribute('href'))).toEqual(['/ventas/nuevo', '/compras/nueva', '/gastos/nuevo'])
    expect(items[0]).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Cerrar acciones rápidas' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('Escape lo cierra y devuelve el foco al botón', () => {
    montar()
    const boton = screen.getByRole('button', { name: 'Acciones rápidas' })
    fireEvent.click(boton)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Acciones rápidas' })).toHaveFocus()
  })

  it('tocar el fondo oscuro lo cierra', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Acciones rápidas' }))
    fireEvent.click(screen.getByTestId('fondo-menu'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('elegir una acción lo cierra', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Acciones rápidas' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Gasto' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('rutas del marco', () => {
  it('con sesión, la barra inferior y el botón «+» acompañan cada pantalla; en el login no hay', async () => {
    const { unmount } = enSesion('/ventas')
    expect(await screen.findByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acciones rápidas' })).toBeInTheDocument()
    unmount()
    render(
      <AuthProvider servicio={servicioFalso({ sesion: { tipo: 'ninguna', caducada: false } })}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    )
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull()
  })

  it.each([
    ['/ventas', 'Ventas'],
    ['/compras', 'Compras'],
    ['/inventario', 'Inventario'],
    ['/ventas/nuevo', 'Nuevo pedido'],
    ['/compras/nueva', 'Nueva compra'],
    ['/gastos/nuevo', 'Nuevo gasto'],
  ])('%s existe y avisa que llega pronto', async (ruta, titulo) => {
    enSesion(ruta)
    expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
    expect(screen.getByText(/llega pronto/i)).toBeInTheDocument()
  })

  it('Más reúne Pendientes, Catálogo, Clientes y proveedores, Gastos, Ajustes y Cómo instalar', async () => {
    enSesion('/mas')
    await screen.findByRole('heading', { level: 1, name: 'Más' })
    const main = screen.getByRole('main')
    const enlaces = within(main).getAllByRole('link')
    expect(enlaces.map((e) => e.getAttribute('href'))).toEqual(['/pendientes', '/catalogo', '/terceros', '/gastos/nuevo', '/ajustes', '/instalar'])
    expect(enlaces.map((e) => e.textContent)).toEqual(
      ['Pendientes', 'Catálogo y precios', 'Clientes y proveedores', 'Gastos', 'Ajustes', 'Cómo instalar'].map((t) => expect.stringContaining(t)),
    )
  })

  it('Inicio ya no repite la lista de accesos: eso vive en la barra inferior y en Más', async () => {
    enSesion('/')
    await screen.findByRole('heading', { level: 1, name: 'Camino Col' })
    expect(within(screen.getByRole('main')).queryByRole('link', { name: /Catálogo/ })).toBeNull()
  })
})
