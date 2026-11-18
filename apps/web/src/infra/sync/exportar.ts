// Exportación de pendientes a JSON (PLAN §5.3, RF-SYN-10): respaldo de emergencia. Sin blobs de fotos; el
// archivo solo avisa cuántas quedan en el teléfono. No hay importación en el MVP (D-009).
import type { CaminoDB } from '../db/db'
import { obtenerDeviceId } from '../db/deviceId'

export interface Exportacion {
  version: 1
  device_id: string
  /** ISO UTC. */
  exportado_en: string
  ops: Array<{ op_id: string; tipo: string; datos: unknown; estado: string; created_at: string }>
  fotos_locales_sin_exportar: number
}

export async function construirExportacion(db: CaminoDB, ahora: () => Date = () => new Date()): Promise<Exportacion> {
  const [device_id, filas, fotos] = await Promise.all([obtenerDeviceId(db), db.outbox.toArray(), db.adjuntos_locales.count()])
  filas.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.op_id.localeCompare(b.op_id))
  return {
    version: 1,
    device_id,
    exportado_en: ahora().toISOString(),
    ops: filas.map((f) => ({ op_id: f.op_id, tipo: f.tipo, datos: f.datos, estado: f.estado, created_at: f.created_at })),
    fotos_locales_sin_exportar: fotos,
  }
}
