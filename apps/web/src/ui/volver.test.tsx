// «Volver» (T-D5, CAM-110): regresa a la pantalla de la que vienes si la abriste desde la app; si la abriste directo
// (enlace, recarga, instalación), usa el destino fijo. Así sirve igual desde Inicio, la barra de estado o Más.
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../application/auth/AuthProvider'
import { servicioFalso } from '../test/servicioAuthFalso'
import { Ajustes } from './Ajustes'
import { ComoInstalar } from './ComoInstalar'
import { BarraSuperior } from './componentes/BarraSuperior'

function Ubicacion() {
  return <p data-testid="ruta">{useLocation().pathname}</p>
}

function montar(entradas: string[], indice = entradas.length - 1) {
  return render(
    <MemoryRouter initialEntries={entradas} initialIndex={indice}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <BarraSuperior titulo="Pendientes" volverA="/mas" />
              <Ubicacion />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Volver', () => {
  it('con historial dentro de la app vuelve a la pantalla anterior (no al destino fijo)', () => {
    montar(['/', '/pendientes'])
    fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
    expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/$/)
  })

  it('abierto directo (sin historial) usa el destino fijo', () => {
    montar(['/pendientes'])
    fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
    expect(screen.getByTestId('ruta')).toHaveTextContent('/mas')
  })

  it('el enlace conserva su destino fijo en el href (abrir en otra pestaña funciona)', () => {
    montar(['/', '/pendientes'])
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/mas')
  })

  it('un clic con tecla modificadora no se intercepta (deja la acción del navegador)', () => {
    montar(['/', '/pendientes'])
    fireEvent.click(screen.getByRole('link', { name: 'Volver' }), { ctrlKey: true })
    expect(screen.getByTestId('ruta')).toHaveTextContent('/pendientes')
  })
})

describe('destinos de respaldo de «Volver»', () => {
  it('Ajustes vuelve a Más y Cómo instalar, que es pública, a Inicio', () => {
    const { unmount } = render(
      <AuthProvider servicio={servicioFalso()}>
        <MemoryRouter initialEntries={['/ajustes']}>
          <Ajustes />
        </MemoryRouter>
      </AuthProvider>,
    )
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/mas')
    unmount()
    render(
      <MemoryRouter initialEntries={['/instalar']}>
        <ComoInstalar />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/')
  })
})
