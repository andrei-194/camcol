import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useSync } from '../../application/sync/SyncProvider'
import type { CaminoDB } from '../../infra/db/db'
import type { OpsApi } from '../../infra/supabase/opsApi'
import { crearAdjuntosService, type AlmacenSoportes } from '../../infra/sync/adjuntosService'
import { crearPendientesService } from '../../infra/sync/pendientesService'
import { crearEscritor } from '../../infra/sync/writer'
import { PendientesProvider } from './contexto'

/**
 * Instancia el escritor y el servicio de pendientes con la API real (`aplicar_ops`) y los entrega a la UI.
 * Tras cada escritura aplicada en línea pide un pull (PLAN §5.4). Va dentro de `SyncProvider`.
 */
export function ServiciosApp({ db, api, almacen, children }: { db: CaminoDB; api: OpsApi; almacen: AlmacenSoportes; children: ReactNode }) {
  const sync = useSync()
  const actualizar = useRef(sync?.actualizar)
  useEffect(() => {
    actualizar.current = sync?.actualizar
  })
  const servicio = useMemo(
    () => crearPendientesService({ db, api, adjuntos: crearAdjuntosService({ db, api, almacen }) }),
    [db, api, almacen],
  )
  const escritor = useMemo(() => {
    const base = crearEscritor({ db, api })
    return {
      async commit(nueva: Parameters<typeof base.commit>[0]) {
        const r = await base.commit(nueva)
        if (r.estado === 'aplicada') void actualizar.current?.()
        return r
      },
    }
  }, [db, api])
  return (
    <PendientesProvider db={db} servicio={servicio} escritor={escritor}>
      {children}
    </PendientesProvider>
  )
}
