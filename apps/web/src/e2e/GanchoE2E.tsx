// GANCHO SOLO DE PRUEBA (CAM-49, T-M2-09). Se carga únicamente con `vite build --mode e2e` (ver main.tsx) y NUNCA
// existe en el bundle de producción (lo comprueba `bundle.test.ts`). Hasta H3 no hay pantallas para crear compras,
// proveedores ni gastos: este gancho llama al escritor REAL (sin duplicar lógica) para que el E2E pueda «crear algo».
import { useEffect } from 'react'
import type { Fila } from '../infra/db/db'
import type { OpNueva } from '../infra/sync/writer'
import { usePendientesCtx } from '../ui/pendientes/contexto'

export default function GanchoE2E() {
  const ctx = usePendientesCtx()
  useEffect(() => {
    const w = window as unknown as { __camino_e2e?: unknown }
    w.__camino_e2e = {
      /** Igual que harán las pantallas de captura: commit con el escritor real y aviso a los consumidores. */
      async commit(nueva: OpNueva) {
        if (!ctx.escritor) throw new Error('Sin escritor')
        const r = await ctx.escritor.commit(nueva)
        ctx.avisarCambio()
        return r
      },
      /** Fila local (con su marca `_pendiente`, la que la UI mostrará como ⏳). */
      fila: (tabla: string, id: string): Promise<Fila | undefined> => ctx.db.table<Fila>(tabla).get(id),
    }
    return () => {
      delete w.__camino_e2e
    }
  }, [ctx])
  return null
}
