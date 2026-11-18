import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ResultadoInicioSesion, ServicioAuth, UsuarioSesion } from '../../domain/auth/tipos'

/**
 * Estado de acceso de la app. Regla (RF-AUTH-02): ninguna transición por falta de red cierra la sesión.
 * - `sin-verificar`: hay sesión pero no se pudo comprobar la pertenencia a `miembros` (sin red y sin
 *   comprobación previa). Se conserva la sesión y se ofrece reintentar.
 */
export type EstadoAcceso =
  | { fase: 'cargando' }
  | { fase: 'anonimo'; caducada: boolean }
  | { fase: 'sin-acceso'; usuario: UsuarioSesion }
  | { fase: 'sin-verificar'; usuario: UsuarioSesion }
  | { fase: 'activo'; usuario: UsuarioSesion; sinConexion: boolean }

interface ContextoAuth {
  estado: EstadoAcceso
  iniciarSesion(email: string, contrasena: string): Promise<ResultadoInicioSesion>
  cerrarSesion(): Promise<void>
  reintentar(): Promise<void>
}

const Contexto = createContext<ContextoAuth | null>(null)

const prefijoMiembro = 'camino.miembro.'

/** Último resultado positivo de pertenencia: permite abrir sin red (RF-AUTH-02). */
function eraMiembro(id: string): boolean {
  try {
    return localStorage.getItem(prefijoMiembro + id) === '1'
  } catch {
    return false
  }
}

function recordarMiembro(id: string, es: boolean) {
  try {
    if (es) localStorage.setItem(prefijoMiembro + id, '1')
    else localStorage.removeItem(prefijoMiembro + id)
  } catch {
    /* sin almacenamiento: se vuelve a comprobar en cada arranque */
  }
}

export function AuthProvider({ servicio, children }: { servicio: ServicioAuth; children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoAcceso>({ fase: 'cargando' })
  const estadoRef = useRef(estado)
  useEffect(() => {
    estadoRef.current = estado
  }, [estado])
  const secuencia = useRef(0)

  const resolver = useCallback(
    async (usuario: UsuarioSesion, sinConexionPrevia = false) => {
      const mia = ++secuencia.current
      const membresia = await servicio.esMiembro(usuario.id)
      if (mia !== secuencia.current) return
      if (membresia === 'si') {
        recordarMiembro(usuario.id, true)
        setEstado({ fase: 'activo', usuario, sinConexion: sinConexionPrevia })
      } else if (membresia === 'no') {
        recordarMiembro(usuario.id, false)
        setEstado({ fase: 'sin-acceso', usuario })
      } else if (eraMiembro(usuario.id)) {
        setEstado({ fase: 'activo', usuario, sinConexion: true })
      } else {
        setEstado({ fase: 'sin-verificar', usuario })
      }
    },
    [servicio],
  )

  useEffect(() => {
    let vigente = true
    void servicio.cargarSesion().then((r) => {
      if (!vigente) return
      if (r.tipo === 'ninguna') setEstado({ fase: 'anonimo', caducada: r.caducada })
      else void resolver(r.usuario, r.sinConexion)
    })
    const baja = servicio.suscribir((evento) => {
      if (!vigente) return
      if (evento.tipo === 'cerrada') {
        secuencia.current++
        setEstado({ fase: 'anonimo', caducada: false })
        return
      }
      const actual = estadoRef.current
      const mismoUsuario = 'usuario' in actual && actual.usuario.id === evento.usuario.id
      // Supabase repite SIGNED_IN al volver a la pestaña: no se vuelve a comprobar.
      if (!mismoUsuario) void resolver(evento.usuario)
    })
    return () => {
      vigente = false
      baja()
    }
  }, [servicio, resolver])

  const iniciarSesion = useCallback(
    async (email: string, contrasena: string) => {
      const r = await servicio.iniciarSesion(email, contrasena)
      if (r.ok) await resolver(r.usuario)
      return r
    },
    [servicio, resolver],
  )

  const cerrarSesion = useCallback(async () => {
    await servicio.cerrarSesion()
    secuencia.current++
    setEstado({ fase: 'anonimo', caducada: false })
  }, [servicio])

  const reintentar = useCallback(async () => {
    const actual = estadoRef.current
    if ('usuario' in actual) await resolver(actual.usuario)
  }, [resolver])

  const valor = useMemo(
    () => ({ estado, iniciarSesion, cerrarSesion, reintentar }),
    [estado, iniciarSesion, cerrarSesion, reintentar],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAuth(): ContextoAuth {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAuth requiere <AuthProvider>.')
  return ctx
}
