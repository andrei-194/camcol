// Puller simple (T-M2-04, CAM-44 · RF-SYN-08). PLAN §4.4 y §5.4.
// Una sola llamada `sync_pull(cursor)` por ejecución; el snapshot se aplica en una transacción Dexie, así
// un fallo a mitad no deja cambios parciales. El fallo de red nunca borra nada ni cierra la sesión.
import type { CaminoDB, Fila, Stock, Tercero, Unidad, Configuracion } from '../db/db'
import { limpiarCacheDeServidor } from '../db/db'

/** Respuesta de `sync_pull` (PLAN §4.4). Las filas llegan tal cual (jsonb). */
export interface RespuestaSyncPull {
  server_time: string
  cursor: string | null
  catalogo: {
    productos: Fila[]
    articulos: Fila[]
    listas_precio: Fila[]
    precios: Fila[]
    unidades: Unidad[]
  }
  terceros: Fila[]
  configuracion: Configuracion[]
  stock: Stock[]
  pedidos_venta: Fila[]
  ordenes_compra: Fila[]
}

/** Puerto del servidor: la implementación con Supabase vive en `infra/supabase/pullApi.ts`. */
export interface PullApi {
  /** `desde` = cursor ya con el margen restado, o `null` para el snapshot inicial. Lanza `ErrorPull`. */
  pull(desde: string | null): Promise<RespuestaSyncPull>
}

export class ErrorPull extends Error {
  constructor(
    readonly tipo: 'red' | 'rechazo',
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorPull'
  }
}

export type ResultadoPull =
  | { ok: true; cursor: string | null }
  /** `red`: no hubo respuesta; `rechazo`: el servidor respondió con error; `datos`: la respuesta no se pudo aplicar. */
  | { ok: false; motivo: 'red' | 'rechazo' | 'datos'; mensaje: string }

/** Margen que se resta al cursor: los upserts son idempotentes y cubre relojes y transacciones lentas. */
export const MARGEN_CURSOR_MS = 2 * 60 * 1000

export function restarMargen(cursor: string): string {
  const t = Date.parse(cursor)
  return Number.isNaN(t) ? cursor : new Date(t - MARGEN_CURSOR_MS).toISOString()
}

function tiempo(v: unknown): number {
  return typeof v === 'string' ? Date.parse(v) : NaN
}

/** Last-write-wins: solo se descarta la fila del servidor si es estrictamente más vieja que la local. */
function esMasVieja(nueva: Fila, local: Fila): boolean {
  const a = tiempo(nueva.updated_at)
  const b = tiempo(local.updated_at)
  return !Number.isNaN(a) && !Number.isNaN(b) && a < b
}

function derivarRoles(f: Fila): Tercero {
  const roles: Array<'cliente' | 'proveedor'> = []
  if (f.es_cliente) roles.push('cliente')
  if (f.es_proveedor) roles.push('proveedor')
  return { ...f, roles }
}

const TABLAS_ESCRITAS = [
  'productos',
  'articulos',
  'listas_precio',
  'precios',
  'unidades',
  'terceros',
  'configuracion',
  'pedidos_venta',
  'ordenes_compra',
  'stock',
  'sync_meta',
] as const

async function aplicarFilas(
  db: CaminoDB,
  tabla: string,
  clave: 'id' | 'codigo' | 'clave',
  filas: object[],
): Promise<void> {
  if (filas.length === 0) return
  const t = db.table<Fila, string>(tabla)
  const locales = await t.bulkGet(filas.map((f) => (f as Record<string, string>)[clave] as string))
  const aEscribir = (filas as Fila[]).filter((f, i) => {
    const local = locales[i]
    if (!local) return true
    if (local._pendiente) return false
    return !esMasVieja(f, local)
  })
  await t.bulkPut(aEscribir)
}

async function aplicar(db: CaminoDB, r: RespuestaSyncPull): Promise<void> {
  await db.transaction('rw', TABLAS_ESCRITAS.map((n) => db.table(n)), async () => {
    const c = r.catalogo
    await aplicarFilas(db, 'productos', 'id', c.productos)
    await aplicarFilas(db, 'articulos', 'id', c.articulos)
    await aplicarFilas(db, 'listas_precio', 'id', c.listas_precio)
    await aplicarFilas(db, 'precios', 'id', c.precios)
    await aplicarFilas(db, 'unidades', 'codigo', c.unidades)
    await aplicarFilas(db, 'terceros', 'id', r.terceros.map(derivarRoles))
    await aplicarFilas(db, 'configuracion', 'clave', r.configuracion)
    await aplicarFilas(db, 'pedidos_venta', 'id', r.pedidos_venta)
    await aplicarFilas(db, 'ordenes_compra', 'id', r.ordenes_compra)
    // El stock es derivado y siempre llega completo: se reemplaza.
    await db.stock.clear()
    await db.stock.bulkPut(r.stock)
    const previo = await db.sync_meta.get('global')
    await db.sync_meta.put({
      tabla: 'global',
      // Base vacía y `desde = null`: el servidor devuelve cursor null; se conserva el anterior.
      cursor: r.cursor ?? previo?.cursor,
      last_sync: r.server_time,
    })
  })
}

/** Un pull completo. No lanza: devuelve el resultado para que la UI lo muestre. */
export async function ejecutarPull(db: CaminoDB, api: PullApi): Promise<ResultadoPull> {
  const meta = await db.sync_meta.get('global')
  const desde = meta?.cursor ? restarMargen(meta.cursor) : null
  let respuesta: RespuestaSyncPull
  try {
    respuesta = await api.pull(desde)
  } catch (e) {
    if (e instanceof ErrorPull) return { ok: false, motivo: e.tipo, mensaje: e.message }
    return { ok: false, motivo: 'red', mensaje: e instanceof Error ? e.message : String(e) }
  }
  try {
    await aplicar(db, respuesta)
  } catch (e) {
    return { ok: false, motivo: 'datos', mensaje: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true, cursor: (await db.sync_meta.get('global'))?.cursor ?? null }
}

const CLAVE_CACHE_USUARIO = 'cache_usuario'

/**
 * Registra de quién es el caché local. Si pertenece a otro usuario, lo limpia antes del primer pull
 * (PLAN §9; conserva outbox, adjuntos, kv y filas `_pendiente`). Devuelve `true` si limpió.
 */
export async function prepararCacheParaUsuario(db: CaminoDB, usuarioId: string): Promise<boolean> {
  const previo = (await db.kv.get(CLAVE_CACHE_USUARIO))?.valor
  const cambio = typeof previo === 'string' && previo !== usuarioId
  if (cambio) await limpiarCacheDeServidor(db)
  if (previo !== usuarioId) await db.kv.put({ clave: CLAVE_CACHE_USUARIO, valor: usuarioId })
  return cambio
}
