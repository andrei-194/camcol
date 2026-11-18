// Resumen legible de una op de la outbox (PLAN §5.3) y antigüedad relativa.
import { formatCantidad, formatCOP } from '../../lib/formato'
import type { CaminoDB, OpOutbox } from '../../infra/db/db'

/** `hace un momento`, `hace 5 min`, `hace 3 h`, `hace 2 d`. */
export function hace(iso: string, ahora: Date = new Date()): string {
  const min = Math.max(0, Math.floor((ahora.getTime() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

/** Descripción de la op sin la antigüedad. Los nombres se buscan en el caché local; si faltan, se omiten. */
export async function resumirOp(db: CaminoDB, op: OpOutbox): Promise<string> {
  const d = obj(op.datos)
  switch (op.tipo) {
    case 'orden_compra.registrar': {
      const orden = obj(d['orden'])
      const nuevo = obj(d['proveedor_nuevo'])
      const proveedorId = orden['proveedor_id']
      const proveedor =
        typeof nuevo['nombre'] === 'string'
          ? nuevo['nombre']
          : typeof proveedorId === 'string'
            ? ((await db.terceros.get(proveedorId))?.['nombre'] as string | undefined)
            : undefined
      const items = Array.isArray(d['items']) ? (d['items'] as Obj[]) : []
      const total = items.reduce((s, i) => s + num(i['cantidad']) * num(i['costo_unitario']), 0)
      let detalle = `${items.length} artículos`
      if (items.length === 1) {
        const aid = items[0]!['articulo_id']
        const nombre = typeof aid === 'string' ? ((await db.articulos.get(aid))?.['nombre'] as string | undefined) : undefined
        detalle = `${formatCantidad(num(items[0]!['cantidad']))} × ${nombre ?? 'artículo'}`
      }
      return ['Compra' + (proveedor ? ` a ${proveedor}` : ''), detalle, formatCOP(total)].join(' · ')
    }
    case 'gasto.registrar':
      return ['Gasto', String(d['categoria'] ?? ''), formatCOP(num(d['valor']))].join(' · ')
    case 'tercero.crear': {
      const rol = d['es_proveedor'] && d['es_cliente'] ? 'Cliente y proveedor nuevo' : d['es_proveedor'] ? 'Proveedor nuevo' : 'Cliente nuevo'
      return `${rol} · ${String(d['nombre'] ?? '')}`
    }
    case 'adjunto.vincular':
      return `Foto de ${String(d['entidad'] ?? 'registro')}`
    case 'pedido_venta.crear':
      return 'Pedido de venta'
    default:
      return op.tipo
  }
}
