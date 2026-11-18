// Base local (Dexie / IndexedDB). Esquema v1 de PLAN §5.1.
//
// REGLA 10: la outbox sobrevive a re-login y a actualizaciones. Por eso:
//  - Nunca se llama `db.delete()` ni se borran tablas en una migración. Las versiones solo agregan
//    tablas o índices (`version(n+1).stores({...}).upgrade(...)`); no se retocan las anteriores.
//  - Cerrar sesión no borra la base. Lo único que se limpia es el caché del servidor
//    (`limpiarCacheDeServidor`), jamás `outbox`, `adjuntos_locales` ni `kv`.
//  - Los datos del servidor (tablas espejo de `sync_pull`) se pueden reconstruir; la outbox no.
import Dexie, { type DexieOptions, type EntityTable } from 'dexie'

/** Fila espejo de lo que entrega `sync_pull` (jsonb tal cual) más marcas locales. */
export interface Fila {
  id: string
  /** `op_id` de la operación en outbox que creó o modificó esta fila sin subir (se muestra con ⏳). */
  _pendiente?: string
  updated_at?: string
  [campo: string]: unknown
}

/** Tercero: `roles` se deriva localmente de `es_cliente`/`es_proveedor` para poder indexar por rol. */
export interface Tercero extends Fila {
  roles?: Array<'cliente' | 'proveedor'>
}

export type EstadoOutbox = 'pendiente' | 'error' | 'revision'

export interface OpOutbox {
  op_id: string
  tipo: string
  datos: unknown
  estado: EstadoOutbox
  /** ISO UTC; para "el más viejo: hace X" y para ordenar el envío. */
  created_at: string
  [campo: string]: unknown
}

export interface AdjuntoLocal {
  id: string
  op_id: string
  estado: string
  [campo: string]: unknown // blob, mime, path de destino…
}

export interface Stock {
  articulo_id: string
  [campo: string]: unknown
}

export interface Configuracion {
  clave: string
  [campo: string]: unknown
}

export interface Unidad {
  codigo: string
  [campo: string]: unknown
}

/** Cursor de `sync_pull` (D-009: uno solo, `tabla = 'global'`) y fecha del último pull. */
export interface SyncMeta {
  tabla: string
  cursor?: string
  last_sync?: string
  [campo: string]: unknown
}

export interface Kv {
  clave: string
  valor: unknown
}

export class CaminoDB extends Dexie {
  terceros!: EntityTable<Tercero, 'id'>
  productos!: EntityTable<Fila, 'id'>
  articulos!: EntityTable<Fila, 'id'>
  unidades!: EntityTable<Unidad, 'codigo'>
  listas_precio!: EntityTable<Fila, 'id'>
  precios!: EntityTable<Fila, 'id'>
  pedidos_venta!: EntityTable<Fila, 'id'>
  ordenes_compra!: EntityTable<Fila, 'id'>
  gastos!: EntityTable<Fila, 'id'>
  stock!: EntityTable<Stock, 'articulo_id'>
  configuracion!: EntityTable<Configuracion, 'clave'>
  outbox!: EntityTable<OpOutbox, 'op_id'>
  adjuntos_locales!: EntityTable<AdjuntoLocal, 'id'>
  sync_meta!: EntityTable<SyncMeta, 'tabla'>
  kv!: EntityTable<Kv, 'clave'>

  constructor(nombre = 'camino', opciones?: DexieOptions) {
    super(nombre, opciones)
    // v1. No editar: para cambiar el esquema se agrega `this.version(2)` con su `upgrade`.
    this.version(1).stores({
      terceros: 'id, nombre, telefono, numero_documento, *roles, _pendiente',
      productos: 'id, nombre',
      articulos: 'id, producto_id, nombre',
      unidades: 'codigo',
      listas_precio: 'id',
      precios: 'id, [lista_id+articulo_id]',
      pedidos_venta: 'id, estado, cliente_id, fecha, _pendiente', // items y pagos embebidos
      ordenes_compra: 'id, estado, proveedor_id, fecha, _pendiente', // items, recepciones y pagos embebidos
      gastos: 'id, fecha, _pendiente',
      stock: 'articulo_id',
      configuracion: 'clave',
      outbox: 'op_id, estado, created_at',
      adjuntos_locales: 'id, op_id, estado',
      sync_meta: 'tabla',
      kv: 'clave',
    })
  }
}

/** Tablas que reflejan al servidor (reconstruibles con un snapshot inicial). */
export const TABLAS_CACHE_SERVIDOR = [
  'terceros',
  'productos',
  'articulos',
  'unidades',
  'listas_precio',
  'precios',
  'pedidos_venta',
  'ordenes_compra',
  'gastos',
  'stock',
  'configuracion',
] as const

/**
 * Borra el caché del servidor (p. ej. al cambiar de usuario) y el cursor, para que el próximo pull sea un
 * snapshot completo. Conserva las filas `_pendiente` (son lo que la outbox todavía no subió), la outbox,
 * los adjuntos locales y `kv` (incluye `device_id`).
 */
export async function limpiarCacheDeServidor(db: CaminoDB): Promise<void> {
  await db.transaction('rw', [...TABLAS_CACHE_SERVIDOR.map((t) => db.table(t)), db.sync_meta], async () => {
    for (const t of TABLAS_CACHE_SERVIDOR) {
      await db.table<Fila>(t).filter((f) => !f._pendiente).delete()
    }
    await db.sync_meta.clear()
  })
}

/** Base única de la app. */
export const db = new CaminoDB()
