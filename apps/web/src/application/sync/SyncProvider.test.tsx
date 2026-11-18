import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { CaminoDB } from '../../infra/db/db'
import { ErrorPull, type PullApi, type RespuestaSyncPull } from '../../infra/sync/puller'
import { servicioFalso, socio } from '../../test/servicioAuthFalso'
import { BotonActualizar } from '../../ui/BotonActualizar'
import { SyncProvider } from './SyncProvider'

let db: CaminoDB
beforeEach(async () => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  await db.open()
})
afterEach(() => db.close())

const vacia: RespuestaSyncPull = {
  server_time: '2026-11-18T15:00:00Z',
  cursor: null,
  catalogo: { productos: [], articulos: [], listas_precio: [], precios: [], unidades: [] },
  terceros: [],
  configuracion: [],
  stock: [],
  pedidos_venta: [],
  ordenes_compra: [],
}

function montar(api: PullApi, auth = servicioFalso()) {
  render(
    <AuthProvider servicio={auth}>
      <SyncProvider db={db} api={api}>
        <BotonActualizar />
      </SyncProvider>
    </AuthProvider>,
  )
  return auth
}

describe('[RF-SYN-08] refresco en la app', () => {
  it('hace un pull al abrir con sesión activa', async () => {
    const pull = vi.fn(async () => vacia)
    montar({ pull })
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1))
  })

  it('vuelve a hacer pull al volver a primer plano', async () => {
    const pull = vi.fn(async () => vacia)
    montar({ pull })
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(2))
  })

  it('el botón «Actualizar datos» fuerza un pull', async () => {
    const pull = vi.fn(async () => vacia)
    montar({ pull })
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar datos' }))
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(2))
  })

  it('sin red avisa y no cierra la sesión', async () => {
    const pull = vi.fn(async () => {
      throw new ErrorPull('red', 'sin conexión')
    })
    const auth = montar({ pull })
    expect(await screen.findByText(/Sin conexión/)).toBeInTheDocument()
    expect(auth.cerrarSesion).not.toHaveBeenCalled()
  })

  it('al entrar un usuario distinto limpia el caché antes del primer pull', async () => {
    await db.kv.put({ clave: 'cache_usuario', valor: 'otro-usuario' })
    await db.productos.put({ id: 'p1', nombre: 'ajeno' })
    await db.gastos.put({ id: 'g1', _pendiente: 'op-1' })
    let productosAlPull = -1
    const pull = vi.fn(async () => {
      productosAlPull = await db.productos.count()
      return vacia
    })
    montar({ pull })
    await waitFor(() => expect(pull).toHaveBeenCalled())
    expect(productosAlPull).toBe(0)
    expect(await db.gastos.count()).toBe(1)
    expect((await db.kv.get('cache_usuario'))?.valor).toBe(socio.id)
  })
})
