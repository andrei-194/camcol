import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../application/auth/AuthProvider'
import { CaminoDB } from '../../infra/db/db'
import { crearPendientesService } from '../../infra/sync/pendientesService'
import { crearServidorSimulado } from '../../infra/sync/servidorSimulado'
import { servicioFalso } from '../../test/servicioAuthFalso'
import { BotonCerrarSesion } from './BotonCerrarSesion'
import { PendientesProvider } from './contexto'
import * as descarga from './descargar'

vi.mock('./descargar', () => ({ descargarJson: vi.fn() }))

let db: CaminoDB
beforeEach(() => {
  db = new CaminoDB('camino', { indexedDB: new IDBFactory(), IDBKeyRange })
  vi.mocked(descarga.descargarJson).mockClear()
})
afterEach(() => db.close())

async function montar() {
  const auth = servicioFalso()
  render(
    <AuthProvider servicio={auth}>
      <PendientesProvider db={db} servicio={crearPendientesService({ db, api: crearServidorSimulado() })}>
        <BotonCerrarSesion />
      </PendientesProvider>
    </AuthProvider>,
  )
  await screen.findByRole('button', { name: /cerrar sesión/i })
  return auth
}

const sembrar3 = () =>
  db.outbox.bulkPut(
    [1, 2, 3].map((n) => ({
      op_id: 'g' + n,
      tipo: 'gasto.registrar',
      datos: { id: 'x' + n, categoria: 'c', valor: 1000 },
      estado: 'pendiente' as const,
      created_at: new Date(Date.now() - n * 1000).toISOString(),
    })),
  )

describe('[E13][RF-AUTH-03] cerrar sesión con pendientes', () => {
  it('con 3 pendientes advierte (cuántos) y no cierra hasta confirmar', async () => {
    await sembrar3()
    const auth = await montar()
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    expect(await screen.findByText(/3 registros sin subir/i)).toBeInTheDocument()
    expect(auth.cerrarSesion).not.toHaveBeenCalled()
  })

  it('«Cancelar» no cierra la sesión ni borra nada', async () => {
    await sembrar3()
    const auth = await montar()
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }))
    expect(auth.cerrarSesion).not.toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(3)
  })

  it('ofrece exportar el JSON', async () => {
    await sembrar3()
    await montar()
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    fireEvent.click(await screen.findByRole('button', { name: /exportar json/i }))
    await waitFor(() => expect(descarga.descargarJson).toHaveBeenCalledTimes(1))
    expect(JSON.parse(vi.mocked(descarga.descargarJson).mock.calls[0]![1]).ops).toHaveLength(3)
  })

  it('«Cerrar sesión de todos modos» cierra y conserva la outbox', async () => {
    await sembrar3()
    const auth = await montar()
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    fireEvent.click(await screen.findByRole('button', { name: /de todos modos/i }))
    await waitFor(() => expect(auth.cerrarSesion).toHaveBeenCalledTimes(1))
    expect(await db.outbox.count()).toBe(3)
  })

  it('sin pendientes cierra directamente', async () => {
    const auth = await montar()
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    await waitFor(() => expect(auth.cerrarSesion).toHaveBeenCalledTimes(1))
  })
})
