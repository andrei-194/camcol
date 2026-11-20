// Nueva compra (T-M5-01, CAM-61, RF-COM-01 a 05, RN-COM-01/02): validación del formulario, total y armado de la op
// `orden_compra.registrar` (PLAN §4.3, 0008_op_compra.sql). El servidor revalida todo (regla 3); esto da mensajes
// rápidos, también sin señal. Fuera de alcance por ahora: la compra de apertura (inventario inicial), el crédito
// (D-005: solo contado), «quién pagó», recepciones parciales y pagos parciales (van en el detalle de la orden, T-M5-02).
import type { Fila } from '../../infra/db/db'
import { filaLocal as filaLocalTercero } from '../terceros/terceros'
import { parseValor } from '../gastos/gastos'

export type Modalidad = 'inmediata' | 'encargo'

/** Valor especial de `proveedorId`: el proveedor se crea con la compra. */
export const PROVEEDOR_NUEVO = '__nuevo__'

/** Tope del total de una compra: bastante por debajo de `numeric(14,2)` del servidor. */
export const TOTAL_MAXIMO = 9_999_999_999

export const MEDIOS_PAGO = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'nequi', texto: 'Nequi' },
  { valor: 'daviplata', texto: 'Daviplata' },
  { valor: 'transferencia', texto: 'Transferencia' },
] as const

export interface LineaCompra {
  articuloId: string
  cantidad: string
  costo: string
  vencimiento: string
  lote: string
}

export interface FormCompra {
  modalidad: Modalidad
  /** Id de un proveedor existente, `PROVEEDOR_NUEVO` o vacío. */
  proveedorId: string
  proveedorNuevo: { nombre: string; telefono: string }
  lineas: LineaCompra[]
  medioPago: string
  fechaEsperada: string
  fecha: string
}

export interface ErroresLinea {
  articulo?: string
  cantidad?: string
  costo?: string
  vencimiento?: string
}

export interface ErroresCompra {
  proveedor?: string
  proveedorNombre?: string
  proveedorTelefono?: string
  lineas?: string
  detalle?: ErroresLinea[]
  fechaEsperada?: string
}

export const lineaVacia = (): LineaCompra => ({ articuloId: '', cantidad: '', costo: '', vencimiento: '', lote: '' })

export const formVacio = (hoy: string): FormCompra => ({
  modalidad: 'inmediata',
  proveedorId: '',
  proveedorNuevo: { nombre: '', telefono: '' },
  lineas: [lineaVacia()],
  medioPago: 'efectivo',
  fechaEsperada: '',
  fecha: hoy,
})

/**
 * Cantidad con hasta tres decimales, mayor que cero. La coma es el decimal (es-CO); un punto seguido de exactamente tres
 * dígitos es separador de miles (`1.500` = 1500, como se muestra) y en otro caso también vale como decimal (`2.5`).
 */
export function parseCantidad(texto: string): number | null {
  const t = texto.trim()
  let numero: string | null = null
  if (/^\d{1,3}(\.\d{3})+(,\d{1,3})?$/.test(t)) numero = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d+([.,]\d{1,3})?$/.test(t)) numero = t.replace(',', '.')
  if (numero === null) return null
  const n = Number(numero)
  return n > 0 && Number.isFinite(n) ? n : null
}

const centavos = (n: number) => Math.round(n * 100) / 100

/** Total de la compra al centavo; las líneas con cantidad o costo inválidos no suman. */
export function totalCompra(lineas: LineaCompra[]): number {
  return centavos(
    lineas.reduce((suma, l) => {
      const c = parseCantidad(l.cantidad)
      const k = parseValor(l.costo)
      return c !== null && k !== null ? suma + c * k : suma
    }, 0),
  )
}

export type InfoArticulo = { controla_vencimiento?: boolean }

function erroresDeLinea(l: LineaCompra, f: FormCompra, articulos: Record<string, InfoArticulo>, previas: LineaCompra[]): ErroresLinea {
  const e: ErroresLinea = {}
  if (!l.articuloId) e.articulo = 'Elige el artículo.'
  else if (previas.some((p) => p.articuloId === l.articuloId)) e.articulo = 'Este artículo ya está en la compra: suma la cantidad en esa línea.'
  if (!l.cantidad.trim()) e.cantidad = 'Escribe la cantidad.'
  else if (parseCantidad(l.cantidad) === null) e.cantidad = 'La cantidad debe ser un número mayor que cero (hasta 3 decimales).'
  if (!l.costo.trim()) e.costo = 'Escribe el costo unitario.'
  else {
    const k = parseValor(l.costo)
    if (k === null || k <= 0) e.costo = 'El costo debe ser un número entero en pesos, mayor que cero.'
  }
  // RN-COM-02: lo que se recibe al comprar exige vencimiento si el artículo lo controla. El encargo no recibe todavía.
  if (f.modalidad === 'inmediata' && l.articuloId && articulos[l.articuloId]?.controla_vencimiento && !l.vencimiento) {
    e.vencimiento = 'Escribe la fecha de vencimiento.'
  }
  return e
}

export function validarForm(f: FormCompra, articulos: Record<string, InfoArticulo>, hoy: string): ErroresCompra {
  const errores: ErroresCompra = {}
  if (!f.proveedorId) errores.proveedor = 'Elige el proveedor o crea uno nuevo.'
  if (f.proveedorId === PROVEEDOR_NUEVO) {
    if (!f.proveedorNuevo.nombre.trim()) errores.proveedorNombre = 'Escribe el nombre del proveedor.'
    const tel = f.proveedorNuevo.telefono.trim()
    if (tel) {
      const digitos = tel.replace(/\D/g, '')
      if (/[A-Za-z]/.test(tel) || digitos.length < 7 || digitos.length > 15) {
        errores.proveedorTelefono = 'Escribe un teléfono válido (de 7 a 15 dígitos) o déjalo vacío.'
      }
    }
  }
  if (f.lineas.length === 0) errores.lineas = 'Agrega al menos un artículo.'
  else {
    const detalle = f.lineas.map((l, i) => erroresDeLinea(l, f, articulos, f.lineas.slice(0, i)))
    if (detalle.some((d) => Object.keys(d).length > 0)) errores.detalle = detalle
    else if (totalCompra(f.lineas) > TOTAL_MAXIMO) errores.lineas = 'El total de la compra es demasiado grande.'
  }
  if (f.modalidad === 'encargo') {
    if (!f.fechaEsperada) errores.fechaEsperada = 'Elige la fecha en que esperas recibirla.'
    else if (f.fechaEsperada < hoy) errores.fechaEsperada = 'La fecha esperada no puede ser anterior a hoy.'
  }
  return errores
}

export interface DatosCompra {
  orden: { id: string; proveedor_id?: string; modalidad: Modalidad; fecha: string; fecha_esperada?: string; condicion_pago: 'contado' }
  proveedor_nuevo?: { id: string; nombre: string; telefono?: string; es_proveedor: true }
  items: Array<{ id: string; articulo_id: string; cantidad: number; costo_unitario: number }>
  recepcion?: {
    id: string
    items: Array<{ id: string; orden_item_id: string; cantidad: number; lote_codigo?: string; fecha_vencimiento?: string }>
  }
  pagos?: Array<{ id: string; medio: string; valor: number }>
}

/**
 * Payload de `orden_compra.registrar` (formulario ya validado). Compra inmediata: recepción total y un pago por el
 * total exacto (0008 exige ambos). Encargo: solo la orden pedida; la recepción y el pago se registran después.
 */
export function armarDatos(f: FormCompra, nuevoId: () => string, ahora: Date): DatosCompra {
  const nuevo = f.proveedorId === PROVEEDOR_NUEVO
  const telefono = f.proveedorNuevo.telefono.trim()
  const items = f.lineas.map((l) => ({
    id: nuevoId(),
    articulo_id: l.articuloId,
    cantidad: parseCantidad(l.cantidad) ?? 0,
    costo_unitario: parseValor(l.costo) ?? 0,
  }))
  const datos: DatosCompra = {
    orden: {
      id: nuevoId(),
      ...(nuevo ? {} : { proveedor_id: f.proveedorId }),
      modalidad: f.modalidad,
      fecha: ahora.toISOString(),
      ...(f.modalidad === 'encargo' ? { fecha_esperada: f.fechaEsperada } : {}),
      condicion_pago: 'contado',
    },
    ...(nuevo
      ? { proveedor_nuevo: { id: nuevoId(), nombre: f.proveedorNuevo.nombre.trim(), ...(telefono ? { telefono } : {}), es_proveedor: true as const } }
      : {}),
    items,
  }
  if (f.modalidad === 'inmediata') {
    datos.recepcion = {
      id: nuevoId(),
      items: items.map((it, i) => {
        const l = f.lineas[i]!
        const lote = l.lote.trim()
        return {
          id: nuevoId(),
          orden_item_id: it.id,
          cantidad: it.cantidad,
          ...(lote ? { lote_codigo: lote } : {}),
          ...(l.vencimiento ? { fecha_vencimiento: l.vencimiento } : {}),
        }
      }),
    }
    datos.pagos = [{ id: nuevoId(), medio: f.medioPago, valor: totalCompra(f.lineas) }]
  }
  return datos
}

/** Filas provisionales que la UI muestra con ⏳ hasta que la op se aplique (la orden y, si es nuevo, el proveedor). */
export function filasLocales(d: DatosCompra): Array<{ tabla: 'ordenes_compra' | 'terceros'; fila: Fila }> {
  const total = centavos(d.items.reduce((s, it) => s + it.cantidad * it.costo_unitario, 0))
  const proveedorId = d.orden.proveedor_id ?? d.proveedor_nuevo?.id ?? ''
  const orden: Fila = {
    id: d.orden.id,
    proveedor_id: proveedorId,
    modalidad: d.orden.modalidad,
    estado: d.orden.modalidad === 'inmediata' ? 'recibida' : 'pedida',
    fecha: d.orden.fecha,
    ...(d.orden.fecha_esperada ? { fecha_esperada: d.orden.fecha_esperada } : {}),
    total,
    items: d.items,
    pagos: d.pagos ?? [],
  }
  const filas: Array<{ tabla: 'ordenes_compra' | 'terceros'; fila: Fila }> = [{ tabla: 'ordenes_compra', fila: orden }]
  if (d.proveedor_nuevo) filas.push({ tabla: 'terceros', fila: filaLocalTercero(d.proveedor_nuevo) })
  return filas
}
