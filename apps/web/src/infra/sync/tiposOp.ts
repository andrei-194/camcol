// Registro de tipos de operación del cliente: validación Zod del payload (PLAN §4.3) y si admiten offline.
// Offline solo para compras, proveedores, gastos y adjuntos (D-009, regla 6). El servidor revalida todo: esto
// solo evita enviar basura y da mensajes rápidos.
import { z } from 'zod'

const texto = z.string().min(1)
const resolucion = z.looseObject({ tipo: z.enum(['usar_existente', 'crear_igual']) })

const tercero = z.looseObject({
  id: z.string().optional(),
  nombre: texto,
  es_cliente: z.boolean().optional(),
  es_proveedor: z.boolean().optional(),
  resolucion: resolucion.optional(),
})

const ordenCompra = z
  .looseObject({
    orden: z.looseObject({ id: z.string().optional(), proveedor_id: z.string().nullish() }),
    proveedor_nuevo: tercero.nullish(),
    items: z
      .array(z.looseObject({ articulo_id: texto, cantidad: z.number().positive(), costo_unitario: z.number().min(0) }))
      .min(1),
    recepcion: z.looseObject({}).nullish(),
    pagos: z.array(z.looseObject({ valor: z.number().positive() })).optional(),
  })
  .refine((d) => Boolean(d.orden.proveedor_id) !== Boolean(d.proveedor_nuevo), {
    message: 'Indica el proveedor existente o uno nuevo (solo uno)',
  })

const gasto = z.looseObject({
  id: z.string().optional(),
  categoria: texto,
  valor: z.number().int().positive(), // COP sin decimales
  fecha: z.string().optional(),
})

const adjunto = z.looseObject({
  entidad: z.enum(['pago', 'gasto', 'recepcion', 'orden_compra', 'tercero']),
  entidad_id: texto,
  path: texto,
  mime: z.string().optional(),
})

const pedidoVenta = z
  .looseObject({
    pedido: z.looseObject({ cliente_id: z.string().nullish() }),
    cliente_nuevo: tercero.nullish(),
    items: z.array(z.looseObject({ articulo_id: texto, cantidad: z.number().positive() })).min(1),
  })
  .refine((d) => Boolean(d.pedido.cliente_id) !== Boolean(d.cliente_nuevo), {
    message: 'Indica el cliente existente o uno nuevo (solo uno)',
  })

export interface DefTipo {
  admiteOffline: boolean
  schema: z.ZodType
}

export const TIPOS_OP: Record<string, DefTipo> = {
  'orden_compra.registrar': { admiteOffline: true, schema: ordenCompra },
  'tercero.crear': { admiteOffline: true, schema: tercero },
  'gasto.registrar': { admiteOffline: true, schema: gasto },
  'adjunto.vincular': { admiteOffline: true, schema: adjunto },
  // Solo con conexión (D-009): se validan igual, pero nunca se encolan.
  'pedido_venta.crear': { admiteOffline: false, schema: pedidoVenta },
}

/** Tablas locales que admiten la marca `_pendiente`. */
export type TablaLocal = 'terceros' | 'pedidos_venta' | 'ordenes_compra' | 'gastos'
export const TABLAS_CON_PENDIENTE: readonly TablaLocal[] = ['terceros', 'pedidos_venta', 'ordenes_compra', 'gastos']
