import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../../application/auth/AuthProvider'
import { AppRoutes } from '../../routes'
import { servicioFalso, socio } from '../../test/servicioAuthFalso'

function montar(servicio: ReturnType<typeof servicioFalso>, ruta = '/') {
  render(
    <AuthProvider servicio={servicio}>
      <MemoryRouter initialEntries={[ruta]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

/** Interacciones mínimas (sin añadir dependencias). */
const userEvent = {
  setup: () => ({
    type: async (el: HTMLElement, texto: string) => void fireEvent.change(el, { target: { value: texto } }),
    click: async (el: HTMLElement) => void fireEvent.click(el),
  }),
}

beforeEach(() => localStorage.clear())

describe('[RF-AUTH-01] guardia de rutas y login', () => {
  it('sin sesión redirige al formulario de login', async () => {
    montar(servicioFalso({ sesion: { tipo: 'ninguna', caducada: false } }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sin acceso' })).not.toBeInTheDocument()
  })

  it('no ofrece registro público', async () => {
    montar(servicioFalso({ sesion: { tipo: 'ninguna', caducada: false } }))
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.queryByText(/regístrate|crear cuenta|registrarse/i)).not.toBeInTheDocument()
  })

  it('al entrar con credenciales válidas llega a la ruta pedida', async () => {
    const servicio = servicioFalso({ sesion: { tipo: 'ninguna', caducada: false } })
    montar(servicio)
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Correo'), 'socio@camino.co')
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreto')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText(/Aún no hay ventas/)).toBeInTheDocument()
    expect(servicio.iniciarSesion).toHaveBeenCalledWith('socio@camino.co', 'secreto')
  })

  it('credenciales incorrectas muestran el error y siguen en el login', async () => {
    const servicio = servicioFalso({
      sesion: { tipo: 'ninguna', caducada: false },
      inicio: { ok: false, motivo: 'credenciales' },
    })
    montar(servicio)
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Correo'), 'socio@camino.co')
    await usuario.type(screen.getByLabelText('Contraseña'), 'mala')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('un fallo de red en el login se explica como falta de conexión, no como contraseña mala', async () => {
    const servicio = servicioFalso({
      sesion: { tipo: 'ninguna', caducada: false },
      inicio: { ok: false, motivo: 'sin-conexion' },
    })
    montar(servicio)
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Correo'), 'socio@camino.co')
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreto')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión')
    expect(servicio.cerrarSesion).not.toHaveBeenCalled()
  })

  it('con sesión expirada (invalid_grant) avisa y conserva el mensaje de pendientes', async () => {
    montar(servicioFalso({ sesion: { tipo: 'ninguna', caducada: true } }))
    expect(await screen.findByText(/Tu sesión expiró/)).toBeInTheDocument()
  })
})

describe('[RF-AUTH-04] usuario autenticado que no es miembro', () => {
  it('ve la pantalla "Sin acceso" y no la app', async () => {
    montar(servicioFalso({ membresia: 'no' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sin acceso' })).toBeInTheDocument()
    expect(screen.getByText(socio.email)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Camino Col' })).not.toBeInTheDocument()
  })

  it('puede cerrar sesión de forma explícita desde "Sin acceso"', async () => {
    const servicio = servicioFalso({ membresia: 'no' })
    montar(servicio)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    expect(servicio.cerrarSesion).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})

describe('[RF-AUTH-02] un fallo de red nunca cierra la sesión', () => {
  it('abre sin red si ya se había comprobado la pertenencia', async () => {
    localStorage.setItem(`camino.miembro.${socio.id}`, '1')
    const servicio = servicioFalso({
      sesion: { tipo: 'sesion', usuario: socio, sinConexion: true },
      membresia: 'desconocido',
    })
    montar(servicio)
    expect(await screen.findByRole('heading', { level: 1, name: 'Camino Col' })).toBeInTheDocument()
    expect(servicio.cerrarSesion).not.toHaveBeenCalled()
  })

  it('sin red y sin comprobación previa mantiene la sesión y ofrece reintentar', async () => {
    let membresia: 'desconocido' | 'si' = 'desconocido'
    const servicio = servicioFalso({
      sesion: { tipo: 'sesion', usuario: socio, sinConexion: true },
      membresia: () => membresia,
    })
    montar(servicio)
    expect(await screen.findByRole('heading', { name: 'Sin conexión' })).toBeInTheDocument()
    expect(servicio.cerrarSesion).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument()

    membresia = 'si'
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Camino Col' })).toBeInTheDocument()
    await waitFor(() => expect(servicio.cerrarSesion).not.toHaveBeenCalled())
  })

  it('un fallo de red al comprobar no se trata como "Sin acceso"', async () => {
    montar(servicioFalso({ membresia: 'desconocido' }))
    expect(await screen.findByRole('heading', { name: 'Sin conexión' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sin acceso' })).not.toBeInTheDocument()
  })

  it('una pertenencia "no" confirmada borra el recuerdo de miembro', async () => {
    localStorage.setItem(`camino.miembro.${socio.id}`, '1')
    montar(servicioFalso({ membresia: 'no' }))
    await screen.findByRole('heading', { name: 'Sin acceso' })
    expect(localStorage.getItem(`camino.miembro.${socio.id}`)).toBeNull()
  })
})
