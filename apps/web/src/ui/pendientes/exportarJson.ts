import type { CaminoDB } from '../../infra/db/db'
import { construirExportacion } from '../../infra/sync/exportar'
import { hoyBogota } from '../../lib/formato'
import { descargarJson } from './descargar'

/** Arma el JSON de pendientes (PLAN §5.3) y lo descarga como `camino-pendientes-AAAA-MM-DD.json`. */
export async function exportarPendientes(db: CaminoDB): Promise<void> {
  const datos = await construirExportacion(db)
  descargarJson(`camino-pendientes-${hoyBogota()}.json`, JSON.stringify(datos, null, 2))
}
