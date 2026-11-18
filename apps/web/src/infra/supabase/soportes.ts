// Almacén de fotos: bucket privado `soportes` (migración 0004; la política solo exige ser miembro, no fija ruta).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlmacenSoportes } from '../sync/adjuntosService'

export function crearAlmacenSoportes(cliente: SupabaseClient): AlmacenSoportes {
  return {
    async subir(path, blob, mime) {
      // `upsert: true` hace idempotente el reintento (misma ruta, mismo contenido).
      const { error } = await cliente.storage.from('soportes').upload(path, blob, { contentType: mime, upsert: true })
      if (error) throw new Error(error.message)
    },
  }
}
