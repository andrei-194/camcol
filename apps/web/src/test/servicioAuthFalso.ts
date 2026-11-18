import { vi } from 'vitest'
import type {
  Membresia,
  ResultadoCargaSesion,
  ResultadoInicioSesion,
  ServicioAuth,
} from '../domain/auth/tipos'

export const socio = { id: 'u-1', email: 'socio@camino.co' }

/** Servicio de autenticación de prueba: por defecto, sesión de un socio miembro con red. */
export function servicioFalso(
  parcial: Partial<{
    sesion: ResultadoCargaSesion
    membresia: Membresia | (() => Membresia)
    inicio: ResultadoInicioSesion
  }> = {},
) {
  const {
    sesion = { tipo: 'sesion', usuario: socio, sinConexion: false },
    membresia = 'si',
    inicio,
  } = parcial
  const servicio = {
    cargarSesion: vi.fn(async () => sesion),
    iniciarSesion: vi.fn(async (): Promise<ResultadoInicioSesion> => inicio ?? { ok: true, usuario: socio }),
    cerrarSesion: vi.fn(async () => {}),
    esMiembro: vi.fn(async () => (typeof membresia === 'function' ? membresia() : membresia)),
    suscribir: vi.fn(() => () => {}),
  } satisfies ServicioAuth
  return servicio
}
