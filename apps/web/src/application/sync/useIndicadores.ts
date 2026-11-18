import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import type { CaminoDB } from '../../infra/db/db'
import { useSync } from './SyncProvider'

export interface Indicadores {
  enLinea: boolean
  /** Operaciones de la outbox (todas: pendientes, en error y en revisión). */
  pendientes: number
  /** Las que están en `error` o `revision`: requieren acción del usuario. */
  conAtencion: number
  /** ISO del último pull exitoso (`sync_meta.last_sync`); `null` si nunca hubo. */
  ultimoPull: string | null
}

function leerNavegador(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

/**
 * RNF-UX-02. Conexión: eventos `online`/`offline` como pista; un pull que falló por red también la marca
 * «sin conexión» hasta que vuelva la señal. Pendientes y último pull se leen en vivo de Dexie (sin polling,
 * sin Realtime, D-009).
 */
export function useIndicadores(db: CaminoDB): Indicadores {
  const sync = useSync()
  const [navegadorEnLinea, setNavegadorEnLinea] = useState(leerNavegador)
  const [datos, setDatos] = useState({ pendientes: 0, conAtencion: 0, ultimoPull: null as string | null })
  const actualizar = sync?.actualizar

  useEffect(() => {
    const alConectar = () => {
      setNavegadorEnLinea(true)
      void actualizar?.() // solo lectura (pull); nunca envía pendientes
    }
    const alDesconectar = () => setNavegadorEnLinea(false)
    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alDesconectar)
    return () => {
      window.removeEventListener('online', alConectar)
      window.removeEventListener('offline', alDesconectar)
    }
  }, [actualizar])

  useEffect(() => {
    const sub = liveQuery(async () => {
      const ops = await db.outbox.toArray()
      const meta = await db.sync_meta.get('global')
      return {
        pendientes: ops.length,
        conAtencion: ops.filter((o) => o.estado !== 'pendiente').length,
        ultimoPull: meta?.last_sync ?? null,
      }
    }).subscribe({ next: setDatos, error: () => undefined })
    return () => sub.unsubscribe()
  }, [db])

  const falloDeRed = sync?.estado.fase === 'error' && sync.estado.motivo === 'red'
  return { enLinea: navegadorEnLinea && !falloDeRed, ...datos }
}
