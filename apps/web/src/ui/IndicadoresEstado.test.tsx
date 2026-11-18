import { act, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../application/auth/AuthProvider'
import { CaminoDB } from '../infra/db/db'
import { AppRoutes } from '../routes'
import { servicioFalso } from '../test/servicioAuthFalso'
import { IndicadoresEstado } from './IndicadoresEstado'

let db: CaminoDB
beforeEach(async () => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  await db.open()
})
afterEach(() => db.close())

function montar() {
  render(
    <MemoryRouter>
      <IndicadoresEstado db={db} />
    </MemoryRouter>,
  )
}

const op = (op_id: string, estado: 'pendiente' | 'error' | 'revision') => ({
  op_id,
  tipo: 'compra.crear',
  datos: {},
  estado,
  created_at: '2026-11-18T15:00:00Z',
})

function cambiarRed(enLinea: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: enLinea, configurable: true })
  act(() => void window.dispatchEvent(new Event(enLinea ? 'online' : 'offline')))
}

afterEach(() => cambiarRed(true))

describe('[RNF-UX-02] indicadores siempre visibles', () => {
  it('muestra "En línea" y cambia a "Sin conexión" con los eventos del navegador', async () => {
    montar()
    const region = screen.getByRole('region', { name: 'Estado de la app' })
    expect(region).toHaveTextContent('En línea')
    cambiarRed(false)
    expect(region).toHaveTextContent('Sin conexión')
    cambiarRed(true)
    expect(region).toHaveTextContent('En línea')
  })

  it('cuenta los pendientes de la outbox y enlaza a /pendientes', async () => {
    await db.outbox.bulkAdd([op('a', 'pendiente'), op('b', 'pendiente')])
    montar()
    const enlace = await screen.findByRole('link', { name: /2 pendientes/ })
    expect(enlace).toHaveAttribute('href', '/pendientes')
  })

  it('singular, cero y actualización en vivo', async () => {
    montar()
    expect(await screen.findByRole('link', { name: /Sin pendientes/ })).toHaveAttribute('href', '/pendientes')
    await db.outbox.add(op('a', 'pendiente'))
    expect(await screen.findByRole('link', { name: /1 pendiente(?!s)/ })).toBeInTheDocument()
  })

  it('marca la atención cuando hay operaciones en error o revisión', async () => {
    await db.outbox.bulkAdd([op('a', 'pendiente'), op('b', 'error'), op('c', 'revision')])
    montar()
    const enlace = await screen.findByRole('link', { name: /3 pendientes/ })
    expect(enlace).toHaveTextContent(/2 requieren atención/)
    expect(enlace).toHaveAttribute('data-atencion', 'true')
  })

  it('"Datos al …" con la hora de Bogotá del último pull, o "sin datos"', async () => {
    montar()
    expect(await screen.findByText('Datos: sin datos')).toBeInTheDocument()
    await db.sync_meta.put({ tabla: 'global', last_sync: '2026-11-18T15:05:00Z' })
    expect(await screen.findByText('Datos al 18/11/2026, 10:05')).toBeInTheDocument()
  })

  it('se ve en pantallas con sesión y no en el login', async () => {
    const { unmount } = render(
      <AuthProvider servicio={servicioFalso()}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByRole('region', { name: 'Estado de la app' })).toBeInTheDocument())
    unmount()
    render(
      <AuthProvider servicio={servicioFalso({ sesion: { tipo: 'ninguna', caducada: false } })}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    )
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.queryByRole('region', { name: 'Estado de la app' })).not.toBeInTheDocument()
  })
})
