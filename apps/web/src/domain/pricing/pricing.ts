/**
 * Precio aplicable de un artículo (RN-PRE-01). Vista previa del cliente: el servidor decide el precio real con
 * `precio_para` (Postgres) y la paridad se prueba con vectores compartidos (nota T-M3-05 de DECISIONS.md).
 * TypeScript puro, sin React, Dexie ni Supabase. Dinero en COP enteros.
 */

export interface PrecioLista {
  listaId: string
  articuloId: string
  /** COP. */
  precio: number
  /** Escalón: cantidad mínima desde la que aplica este precio (> 0). */
  cantidadMinima: number
}

export interface CatalogoPrecios {
  listaPublicaId: string
  precios: readonly PrecioLista[]
}

/** El artículo no tiene precio en la lista del cliente ni en la pública (E_PRECIO en el servidor). */
export class ErrorSinPrecio extends Error {
  constructor(readonly articuloId: string) {
    super(`El artículo ${articuloId} no tiene precio`)
    this.name = 'ErrorSinPrecio'
  }
}

/** Precio del escalón de mayor `cantidadMinima` <= cantidad dentro de una lista, o null. */
function precioEnLista(
  precios: readonly PrecioLista[],
  listaId: string,
  articuloId: string,
  cantidad: number,
): number | null {
  let mejor: PrecioLista | null = null
  for (const p of precios) {
    if (p.listaId !== listaId || p.articuloId !== articuloId || p.cantidadMinima > cantidad) continue
    if (mejor === null || p.cantidadMinima > mejor.cantidadMinima) mejor = p
  }
  return mejor === null ? null : mejor.precio
}

/**
 * Espejo de `precio_para(artículo, cliente, cantidad)`. `listaClienteId` es la `lista_precio_id` del cliente
 * (null si no tiene o si el cliente no se conoce). Si la lista del cliente no tiene precio aplicable
 * (ni artículo ni escalón), se usa la pública. Devuelve null si ninguna lo tiene.
 */
export function precioPara(
  catalogo: CatalogoPrecios,
  articuloId: string,
  listaClienteId: string | null,
  cantidad: number,
): number | null {
  const lista = listaClienteId ?? catalogo.listaPublicaId
  const propio = precioEnLista(catalogo.precios, lista, articuloId, cantidad)
  if (propio !== null || lista === catalogo.listaPublicaId) return propio
  return precioEnLista(catalogo.precios, catalogo.listaPublicaId, articuloId, cantidad)
}

/** Como `precioPara`, pero lanza `ErrorSinPrecio` si no hay precio (no se inventa uno). */
export function precioRequerido(
  catalogo: CatalogoPrecios,
  articuloId: string,
  listaClienteId: string | null,
  cantidad: number,
): number {
  const precio = precioPara(catalogo, articuloId, listaClienteId, cantidad)
  if (precio === null) throw new ErrorSinPrecio(articuloId)
  return precio
}
