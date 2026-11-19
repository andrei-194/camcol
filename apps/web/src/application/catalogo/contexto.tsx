import { liveQuery } from 'dexie'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db as dbGlobal, type CaminoDB, type Fila } from '../../infra/db/db'
import { obtenerClienteSupabase } from '../../infra/supabase/client'
import { useIndicadores } from '../sync/useIndicadores'
import { useSync } from '../sync/SyncProvider'
import { crearCatalogoApi, type CatalogoApi } from './catalogoApi'

interface ContextoCatalogo {
  db: CaminoDB
  api: CatalogoApi
  /** Pull de lectura tras una escritura. */
  refrescar(): Promise<void>
}

const Contexto = createContext<ContextoCatalogo | null>(null)

/** Entrega base, API y refresco a las pantallas del catálogo (en pruebas, con falsos). Opcional en la app real. */
export function CatalogoProvider({ children, ...valor }: ContextoCatalogo & { children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** Sin proveedor usa la base única, el cliente real de Supabase (perezoso) y el pull de `SyncProvider`. */
export function useCatalogoCtx(): ContextoCatalogo {
  const ctx = useContext(Contexto)
  const sync = useSync()
  const apiPerezosa = useRef<CatalogoApi | null>(null)
  return useMemo(() => {
    if (ctx) return ctx
    const api: CatalogoApi = new Proxy({} as CatalogoApi, {
      get: (_, metodo: keyof CatalogoApi) => {
        apiPerezosa.current ??= crearCatalogoApi(obtenerClienteSupabase())
        return apiPerezosa.current[metodo]
      },
    })
    return { db: dbGlobal, api, refrescar: async () => void (await sync?.actualizar()) }
  }, [ctx, sync])
}

/** `enLinea` según los indicadores de la app (RNF-UX-02). */
export function useEnLinea(): boolean {
  const { db } = useCatalogoCtx()
  return useIndicadores(db).enLinea
}

export interface DatosCatalogo {
  productos: Fila[]
  articulos: Fila[]
  precios: Fila[]
  listas: Fila[]
  unidades: Array<{ codigo: string; nombre?: string }>
  clientes: Fila[]
}

export type CargaCatalogo = { fase: 'cargando' } | { fase: 'error' } | { fase: 'listo'; datos: DatosCatalogo }

/** Lee el catálogo de Dexie en vivo (funciona sin red). Oculta lo borrado lógicamente. */
export function useCatalogo(): CargaCatalogo {
  const { db } = useCatalogoCtx()
  const [carga, setCarga] = useState<CargaCatalogo>({ fase: 'cargando' })
  useEffect(() => {
    const sub = liveQuery(async (): Promise<DatosCatalogo> => {
      const vivo = (f: Fila) => !f.deleted_at
      const [productos, articulos, precios, listas, unidades, terceros] = await Promise.all([
        db.productos.toArray(),
        db.articulos.toArray(),
        db.precios.toArray(),
        db.listas_precio.toArray(),
        db.unidades.toArray(),
        db.terceros.toArray(),
      ])
      return {
        productos: productos.filter(vivo).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')),
        articulos: articulos.filter(vivo).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')),
        precios,
        listas: listas.sort((a, b) => Number(!!b.es_publica) - Number(!!a.es_publica) || String(a.nombre).localeCompare(String(b.nombre), 'es')),
        unidades: unidades as DatosCatalogo['unidades'],
        clientes: terceros.filter((t) => vivo(t) && t.es_cliente),
      }
    }).subscribe({
      next: (datos) => setCarga({ fase: 'listo', datos }),
      error: () => setCarga({ fase: 'error' }),
    })
    return () => sub.unsubscribe()
  }, [db])
  return carga
}
