import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Escrituras del catálogo (RF-CAT-01..03). Editar maestros requiere conexión (D-009): van directo a las tablas
 * con RLS (solo miembros), no por `aplicar_ops`, y nunca se encolan. Después de cada una se pide un pull.
 */
export type ResultadoEscritura =
  | { ok: true; id?: string }
  | { ok: false; motivo: 'red' | 'rechazo'; mensaje: string }

export interface DatosArticulo {
  producto_id: string
  nombre: string
  codigo: string | null
  presentacion_cantidad: number
  presentacion_unidad: string
  controla_lote: boolean
  controla_vencimiento: boolean
  permite_sin_stock: boolean
  activo: boolean
}

export interface DatosPrecio {
  lista_id: string
  articulo_id: string
  precio: number
  cantidad_minima: number
}

export interface CatalogoApi {
  crearProducto(nombre: string): Promise<ResultadoEscritura>
  /** `id` null crea; con id actualiza. */
  guardarArticulo(id: string | null, datos: DatosArticulo): Promise<ResultadoEscritura>
  /** Upsert por (lista, artículo, cantidad mínima). */
  guardarPrecio(datos: DatosPrecio): Promise<ResultadoEscritura>
  eliminarPrecio(id: string): Promise<ResultadoEscritura>
  crearLista(nombre: string): Promise<ResultadoEscritura>
  /** `listaId` null = vuelve a la lista pública. */
  asignarListaCliente(terceroId: string, listaId: string | null): Promise<ResultadoEscritura>
}

const MENSAJES: Record<string, string> = {
  '23505': 'Ya existe un registro con ese nombre o código.',
  '23503': 'Ese registro está en uso y no se puede cambiar así.',
  '23514': 'Algún dato no es válido. Revisa los valores.',
  '42501': 'No tienes permiso para hacer este cambio.',
}

function aResultado(error: { code?: string; message: string } | null, id?: string): ResultadoEscritura {
  if (!error) return { ok: true, id }
  // supabase-js devuelve los fallos de fetch como error sin código SQLSTATE/PostgREST: es la red.
  if (!error.code) return { ok: false, motivo: 'red', mensaje: 'Sin conexión: no se guardó. Inténtalo de nuevo.' }
  return { ok: false, motivo: 'rechazo', mensaje: MENSAJES[error.code] ?? 'El servidor rechazó el cambio.' }
}

async function intentar(f: () => PromiseLike<{ error: { code?: string; message: string } | null; data?: unknown }>) {
  try {
    const { error, data } = await f()
    const id = (data as { id?: string } | null | undefined)?.id
    return aResultado(error, id)
  } catch {
    return aResultado({ message: 'red' })
  }
}

export function crearCatalogoApi(cliente: SupabaseClient): CatalogoApi {
  return {
    crearProducto: (nombre) => intentar(() => cliente.from('productos').insert({ nombre }).select('id').single()),
    guardarArticulo: (id, datos) =>
      intentar(() =>
        id
          ? cliente.from('articulos').update(datos).eq('id', id).select('id').single()
          : cliente.from('articulos').insert(datos).select('id').single(),
      ),
    guardarPrecio: (datos) =>
      intentar(() => cliente.from('precios').upsert(datos, { onConflict: 'lista_id,articulo_id,cantidad_minima' }).select('id').single()),
    eliminarPrecio: (id) => intentar(() => cliente.from('precios').delete().eq('id', id)),
    crearLista: (nombre) => intentar(() => cliente.from('listas_precio').insert({ nombre }).select('id').single()),
    asignarListaCliente: (terceroId, listaId) =>
      intentar(() => cliente.from('terceros').update({ lista_precio_id: listaId }).eq('id', terceroId).select('id').single()),
  }
}
