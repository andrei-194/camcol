import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CaminoDB } from '../../infra/db/db'
import { ejecutarPull, prepararCacheParaUsuario, type PullApi } from '../../infra/sync/puller'
import { useAuth } from '../auth/AuthProvider'

export type EstadoSync =
  | { fase: 'inactivo' }
  | { fase: 'actualizando' }
  | { fase: 'ok'; ultima: string }
  | { fase: 'error'; motivo: 'red' | 'rechazo' | 'datos' }

interface ContextoSync {
  estado: EstadoSync
  actualizar(): Promise<void>
}

const Contexto = createContext<ContextoSync | null>(null)

/**
 * Ejecuta el puller al abrir (con sesión activa) y al volver a primer plano; expone `actualizar()` para el
 * botón. Sin Realtime ni reintentos en segundo plano (D-009). Un fallo nunca toca la sesión.
 */
export function SyncProvider({ db, api, children }: { db: CaminoDB; api: PullApi; children: ReactNode }) {
  const { estado: acceso } = useAuth()
  const usuarioId = acceso.fase === 'activo' ? acceso.usuario.id : null
  const [estado, setEstado] = useState<EstadoSync>({ fase: 'inactivo' })
  const listo = useRef<string | null>(null) // usuario cuyo caché ya se preparó
  const enCurso = useRef<Promise<void> | null>(null)

  const actualizar = useCallback(async () => {
    if (!usuarioId) return
    if (enCurso.current) return enCurso.current
    const tarea = (async () => {
      setEstado({ fase: 'actualizando' })
      try {
        if (listo.current !== usuarioId) {
          await prepararCacheParaUsuario(db, usuarioId)
          listo.current = usuarioId
        }
        const r = await ejecutarPull(db, api)
        if (r.ok) setEstado({ fase: 'ok', ultima: (await db.sync_meta.get('global'))?.last_sync ?? '' })
        else setEstado({ fase: 'error', motivo: r.motivo })
      } catch {
        setEstado({ fase: 'error', motivo: 'datos' })
      } finally {
        enCurso.current = null
      }
    })()
    enCurso.current = tarea
    return tarea
  }, [db, api, usuarioId])

  useEffect(() => {
    if (!usuarioId) return
    void actualizar()
    const alVolver = () => {
      if (document.visibilityState === 'visible') void actualizar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [usuarioId, actualizar])

  const valor = useMemo(() => ({ estado, actualizar }), [estado, actualizar])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** `null` si no hay `SyncProvider` (p. ej. pruebas de pantallas que no lo necesitan). */
export function useSync(): ContextoSync | null {
  return useContext(Contexto)
}
