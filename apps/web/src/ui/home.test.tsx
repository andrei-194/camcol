import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../application/auth/AuthProvider'
import { AppRoutes } from '../routes'
import { servicioFalso } from '../test/servicioAuthFalso'

describe('pantalla inicial', () => {
  it('con sesión de socio muestra "Camino Col"', async () => {
    render(
      <AuthProvider servicio={servicioFalso()}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Camino Col' })).toBeInTheDocument()
  })
})
