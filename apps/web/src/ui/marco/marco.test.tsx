// Marco de la app (T-D3, CAM-108, docs/producto/diseno.md): cabecera de café con logo, barra inferior de cinco destinos con
// el disco central, menú flotante de acciones rápidas y rutas de Ventas, Compras, Inventario y Más.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../../application/auth/AuthProvider'
import { CaminoDB } from '../../infra/db/db'
import { AvisoActualizacionVista } from '../../pwa/AvisoActualizacion'
import { AppRoutes } from '../../routes'
import { servicioFalso } from '../../test/servicioAuthFalso'
import { BarraSuperior } from '../componentes/BarraSuperior'
import { BarraInferior } from './BarraInferior'
import { MarcoApp } from './MarcoApp'
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
    expect(screen.getByRole('button', { name: 'Acciones rápidas' })).toHaveAttribute('aria-expanded', 'true')
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
    expect(enlaces.map((e) => e.getAttribute('href'))).toEqual(['/pendientes', '/catalogo', '/terceros', '/gastos', '/ajustes', '/instalar'])
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

describe('revisión de T-D3: menú, foco, rutas y capas', () => {
  const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'Acciones rápidas' }))

  function Ubicacion() {
    return <p data-testid="ruta">{useLocation().pathname}</p>
  }
  const montarConRutas = () =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <Link to="/otra">Ir a otra</Link>
        <Routes>
          <Route path="*" element={<MenuAcciones />} />
        </Routes>
        <Ubicacion />
      </MemoryRouter>,
    )

  it('el nombre del botón es fijo y aria-expanded dice el estado', () => {
    montarConRutas()
    const boton = screen.getByRole('button', { name: 'Acciones rápidas' })
    abrir()
    expect(boton).toHaveAccessibleName('Acciones rápidas')
    expect(boton).toHaveAttribute('aria-expanded', 'true')
  })

  it('aria-controls apunta al id del menú abierto', () => {
    montarConRutas()
    abrir()
    const menu = screen.getByRole('menu')
    expect(screen.getByRole('button', { name: 'Acciones rápidas' })).toHaveAttribute('aria-controls', menu.id)
  })

  it('las flechas recorren las acciones de forma circular y Inicio y Fin saltan a los extremos', () => {
    montarConRutas()
    abrir()
    const [pedido, compra, gasto] = screen.getAllByRole('menuitem')
    const tecla = (key: string) => fireEvent.keyDown(document.activeElement!, { key })
    expect(pedido).toHaveFocus()
    tecla('ArrowDown')
    expect(compra).toHaveFocus()
    tecla('ArrowDown')
    expect(gasto).toHaveFocus()
    tecla('ArrowDown')
    expect(pedido).toHaveFocus()
    tecla('ArrowUp')
    expect(gasto).toHaveFocus()
    tecla('Home')
    expect(pedido).toHaveFocus()
    tecla('End')
    expect(gasto).toHaveFocus()
  })

  it('Tab cierra el menú y deja el foco en el botón (no se escapa a la barra tapada)', () => {
    montarConRutas()
    abrir()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Acciones rápidas' })).toHaveFocus()
  })

  it('al cambiar de ruta (por ejemplo «atrás» en Android) el menú se cierra solo', () => {
    montarConRutas()
    abrir()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Ir a otra' }))
    expect(screen.getByTestId('ruta')).toHaveTextContent('/otra')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('elegir una acción navega y el foco NO vuelve al botón «+»', () => {
    montarConRutas()
    abrir()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Gasto' }))
    expect(screen.getByTestId('ruta')).toHaveTextContent('/gastos/nuevo')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Acciones rápidas' })).not.toHaveFocus()
  })

  it('cerrar con Escape o con el fondo sí devuelve el foco al botón', () => {
    montarConRutas()
    abrir()
    fireEvent.click(screen.getByTestId('fondo-menu'))
    expect(screen.getByRole('button', { name: 'Acciones rápidas' })).toHaveFocus()
  })

  it('/ventas/nuevo mantiene marcada Ventas; /catalogo no marca ninguna pestaña', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/ventas/nuevo']}>
        <BarraInferior db={db} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Ventas' })).toHaveAttribute('aria-current', 'page')
    unmount()
    render(
      <MemoryRouter initialEntries={['/catalogo']}>
        <BarraInferior db={db} />
      </MemoryRouter>,
    )
    for (const e of within(screen.getByRole('navigation', { name: 'Navegación principal' })).getAllByRole('link')) {
      expect(e).not.toHaveAttribute('aria-current')
    }
  })

  it('el contador de Más cuenta también las operaciones con error o en revisión', async () => {
    await db.outbox.bulkAdd([op('a'), { ...op('b'), estado: 'error' as const }, { ...op('c'), estado: 'revision' as const }])
    render(
      <MemoryRouter>
        <BarraInferior db={db} />
      </MemoryRouter>,
    )
    await waitFor(() => expect(within(screen.getByRole('link', { name: 'Más' })).getByText('3')).toBeInTheDocument())
    expect(within(screen.getByRole('link', { name: 'Más' })).getByText('3').className).not.toContain('text-[10px]')
  })

  it('los indicadores se leen sobre el café: verde claro en línea, ámbar claro sin conexión', async () => {
    enSesion('/')
    const enLinea = await screen.findByText('En línea', {}, { timeout: 5000 })
    expect(enLinea.className).toContain('text-exito-claro')
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    act(() => void window.dispatchEvent(new Event('offline')))
    expect((await screen.findByText('Sin conexión', {}, { timeout: 5000 })).className).toContain('text-advertencia-claro')
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    act(() => void window.dispatchEvent(new Event('online')))
  })

  it('las pantallas «llega pronto» con Volver enlazan a su origen', async () => {
    enSesion('/ventas/nuevo')
    await screen.findByRole('heading', { level: 1, name: 'Nuevo pedido' })
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/ventas')
  })

  it('Inicio muestra el tablero: mientras no haya ventas, su estado vacío (T-D4)', async () => {
    enSesion('/')
    expect(await screen.findByText(/Aún no hay ventas/)).toBeInTheDocument()
  })

  it('el contenido deja holgura bajo el «+» y el aviso de actualización flota por encima de la barra y del botón', () => {
    const { container } = render(
      <MemoryRouter>
        <MarcoApp>
          <p>x</p>
        </MarcoApp>
      </MemoryRouter>,
    )
    expect(container.innerHTML).toContain('pb-[calc(8.5rem+env(safe-area-inset-bottom))]')
    render(<AvisoActualizacionVista necesitaActualizar listoOffline={false} onActualizar={() => {}} onCerrar={() => {}} />)
    const aviso = screen.getByText(/Nueva versión disponible/).closest('[role="status"]')!
    expect(aviso.className).toContain('bottom-[calc(9rem+env(safe-area-inset-bottom))]')
  })
})
