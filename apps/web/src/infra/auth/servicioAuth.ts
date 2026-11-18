import { isAuthApiError, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import type {
  EventoSesion,
  Membresia,
  ResultadoCargaSesion,
  ResultadoInicioSesion,
  ServicioAuth,
  UsuarioSesion,
} from '../../domain/auth/tipos'

const CLAVE_USUARIO = 'camino.auth.usuario'

function leerUsuarioRecordado(): UsuarioSesion | null {
  try {
    const crudo = localStorage.getItem(CLAVE_USUARIO)
    return crudo ? (JSON.parse(crudo) as UsuarioSesion) : null
  } catch {
    return null
  }
}

function recordarUsuario(usuario: UsuarioSesion | null) {
  try {
    if (usuario) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario))
    else localStorage.removeItem(CLAVE_USUARIO)
  } catch {
    /* sin almacenamiento: la sesión de Supabase sigue funcionando */
  }
}

function aUsuario(u: { id: string; email?: string | null }): UsuarioSesion {
  return { id: u.id, email: u.email ?? '' }
}

/** Fallo de red o servidor inalcanzable (no un rechazo del servidor). */
function esFalloDeRed(error: unknown): boolean {
  return isAuthRetryableFetchError(error) || error instanceof TypeError
}

/**
 * Adaptador de Supabase Auth. Regla central (RF-AUTH-02): ningún fallo de red cierra la sesión.
 * Solo se pierde la sesión por rechazo explícito del servidor o por cierre explícito del usuario.
 */
export function crearServicioAuth(cliente: SupabaseClient): ServicioAuth {
  return {
    async cargarSesion(): Promise<ResultadoCargaSesion> {
      try {
        const { data, error } = await cliente.auth.getSession()
        if (data.session) {
          const usuario = aUsuario(data.session.user)
          recordarUsuario(usuario)
          return { tipo: 'sesion', usuario, sinConexion: false }
        }
        if (error && esFalloDeRed(error)) return sesionRecordada()
        if (error) {
          recordarUsuario(null)
          return { tipo: 'ninguna', caducada: true }
        }
        recordarUsuario(null)
        return { tipo: 'ninguna', caducada: false }
      } catch (e) {
        if (esFalloDeRed(e)) return sesionRecordada()
        throw e
      }
    },

    async iniciarSesion(email, contrasena): Promise<ResultadoInicioSesion> {
      try {
        const { data, error } = await cliente.auth.signInWithPassword({
          email,
          password: contrasena,
        })
        if (error) {
          if (esFalloDeRed(error)) return { ok: false, motivo: 'sin-conexion' }
          if (isAuthApiError(error) && [400, 401, 422].includes(error.status)) {
            return { ok: false, motivo: 'credenciales' }
          }
          return { ok: false, motivo: 'otro' }
        }
        const usuario = aUsuario(data.user!)
        recordarUsuario(usuario)
        return { ok: true, usuario }
      } catch (e) {
        return { ok: false, motivo: esFalloDeRed(e) ? 'sin-conexion' : 'otro' }
      }
    },

    async cerrarSesion() {
      await cliente.auth.signOut({ scope: 'local' })
      recordarUsuario(null)
    },

    async esMiembro(usuarioId): Promise<Membresia> {
      try {
        const { data, error } = await cliente
          .from('miembros')
          .select('user_id')
          .eq('user_id', usuarioId)
          .maybeSingle()
        // Un error (red, 5xx, permisos) nunca se interpreta como "no es miembro".
        if (error) return 'desconocido'
        return data ? 'si' : 'no'
      } catch {
        return 'desconocido'
      }
    },

    suscribir(alCambiar) {
      const { data } = cliente.auth.onAuthStateChange((evento, sesion) => {
        // setTimeout evita llamar a Supabase dentro del callback (riesgo de bloqueo).
        setTimeout(() => {
          let notificacion: EventoSesion | null = null
          if (evento === 'SIGNED_OUT') {
            recordarUsuario(null)
            notificacion = { tipo: 'cerrada' }
          } else if (evento === 'SIGNED_IN' && sesion) {
            const usuario = aUsuario(sesion.user)
            recordarUsuario(usuario)
            notificacion = { tipo: 'abierta', usuario }
          }
          if (notificacion) alCambiar(notificacion)
        }, 0)
      })
      return () => data.subscription.unsubscribe()
    },
  }
}

/** Sin red no se puede refrescar el token: se conserva la sesión y se opera con el último usuario. */
function sesionRecordada(): ResultadoCargaSesion {
  const usuario = leerUsuarioRecordado()
  return usuario
    ? { tipo: 'sesion', usuario, sinConexion: true }
    : { tipo: 'ninguna', caducada: false }
}
