import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CaminoDB, OpOutbox } from '../../infra/db/db'
import type { PendientesService } from '../../infra/sync/pendientesService'
import type { Escritor } from '../../infra/sync/writer'

interface ContextoPendientes {
  db: CaminoDB
  servicio: PendientesService
  /** Escritor único de la app (las pantallas de captura lo usan desde H3). Opcional en pruebas. */
  escritor?: Escritor
  /** Sube cada vez que cambia la outbox por una acción de la UI; los consumidores recargan. */
  version: number
  avisarCambio(): void
}

const Contexto = createContext<ContextoPendientes | null>(null)

/** Entrega la base local y el servicio de pendientes a las pantallas (instancias reales en `ServiciosApp`). */
export function PendientesProvider({
  db,
  servicio,
  escritor,
  children,
}: {
  db: CaminoDB
  servicio: PendientesService
  escritor?: Escritor
  children: ReactNode
}) {
  const [version, setVersion] = useState(0)
  const avisarCambio = useCallback(() => setVersion((v) => v + 1), [])
  const valor = useMemo(() => ({ db, servicio, escritor, version, avisarCambio }), [db, servicio, escritor, version, avisarCambio])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** `null` si no hay proveedor (pruebas de pantallas que no lo necesitan). */
export function usePendientesOpcional(): ContextoPendientes | null {
  return useContext(Contexto)
}

export function usePendientesCtx(): ContextoPendientes {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('Falta <PendientesProvider>.')
  return ctx
}

export type CargaPendientes =
  | { fase: 'cargando' }
  | { fase: 'error' }
  | { fase: 'listo'; ops: OpOutbox[] }

/** Lee la outbox (más vieja primero) y la recarga cuando cambia `version`. */
export function useOutbox(ctx: ContextoPendientes | null): CargaPendientes {
  const [carga, setCarga] = useState<CargaPendientes>({ fase: 'cargando' })
  const db = ctx?.db
  const version = ctx?.version
  useEffect(() => {
    if (!db) return
    let vigente = true
    db.outbox
      .toArray()
      .then((ops) => {
        if (!vigente) return
        ops.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.op_id.localeCompare(b.op_id))
        setCarga({ fase: 'listo', ops })
      })
      .catch(() => {
        if (vigente) setCarga({ fase: 'error' })
      })
    return () => {
      vigente = false
    }
  }, [db, version])
  return carga
}
