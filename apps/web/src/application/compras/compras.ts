// Nueva compra (T-M5-01, CAM-61, RF-COM-01 a 05, RN-COM-01/02): validación del formulario, total y armado de la op
// `orden_compra.registrar` (PLAN §4.3, 0008_op_compra.sql). El servidor revalida todo (regla 3); esto da mensajes
// rápidos, también sin señal. Fuera de alcance por ahora: la compra de apertura (inventario inicial), el crédito
// (D-005: solo contado), «quién pagó», recepciones parciales y pagos parciales (van en el detalle de la orden, T-M5-02).
import type { Fila } from '../../infra/db/db'
import { formatCantidad } from '../../lib/formato'
import { filaLocal as filaLocalTercero } from '../terceros/terceros'
import { parseValor } from '../gastos/gastos'

export type Modalidad = 'inmediata' | 'encargo'

/** Valor especial de `proveedorId`: el proveedor se crea con la compra. */
export const PROVEEDOR_NUEVO = '__nuevo__'

/** Tope del total de una compra: bastante por debajo de `numeric(14,2)` del servidor. */
export const TOTAL_MAXIMO = 9_999_999_999

/** Tope de cantidad por línea: cabe de sobra en `numeric(12,3)` del servidor. */
export const CANTIDAD_MAXIMA = 999_999

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

export const formVacio = (): FormCompra => ({
  modalidad: 'inmediata',
  proveedorId: '',
  proveedorNuevo: { nombre: '', telefono: '' },
  lineas: [lineaVacia()],
  medioPago: 'efectivo',
  fechaEsperada: '',
})

/**
 * Cantidad en milésimas (entero), mayor que cero y con hasta tres decimales. La coma es el decimal (es-CO); un punto
 * seguido de exactamente tres dígitos es separador de miles solo si el primer grupo no empieza en cero (`1.500` = 1500,
 * como se muestra; `0.500` = 0,5) y en otro caso también vale como decimal (`2.5`).
 */
export function parseMilesimas(texto: string): number | null {
  const t = texto.trim()
  let numero: string | null = null
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d{1,3})?$/.test(t)) numero = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d+([.,]\d{1,3})?$/.test(t)) numero = t.replace(',', '.')
  if (numero === null) return null
  const [entera = '0', decimal = ''] = numero.split('.')
  const mil = Number(entera) * 1000 + Number(decimal.padEnd(3, '0'))
  return Number.isSafeInteger(mil) && mil > 0 ? mil : null
}

/** Cantidad con hasta tres decimales, mayor que cero (ver `parseMilesimas`). */
export function parseCantidad(texto: string): number | null {
  const mil = parseMilesimas(texto)
  return mil === null ? null : mil / 1000
}

/** Cómo se interpretó lo escrito, con su unidad: «Se registrará: 1.500 und». Vacío si no es una cantidad válida. */
export function leyendaCantidad(texto: string, unidad: string | undefined): string {
  const n = parseCantidad(texto)
  return n === null ? '' : `Se registrará: ${formatCantidad(n)}${unidad ? ` ${unidad}` : ''}`
}

/**
 * Centavos de una línea, como el servidor (`round(cantidad × costo, 2)`, mitad hacia arriba): con enteros, sin coma
 * flotante. `cantidadMil` son milésimas y `costo` pesos enteros; el producto está en milésimas de peso.
 */
function centavosDeLinea(cantidadMil: number, costo: number): bigint {
  return (BigInt(cantidadMil) * BigInt(costo) + 5n) / 10n
}

/** Total de ítems ya armados (`cantidad` decimal, `costo_unitario` en pesos): suma de líneas redondeadas una a una. */
export function totalDeItems(items: Array<{ cantidad: number; costo_unitario: number }>): number {
  const centavos = items.reduce((suma, it) => {
    const mil = Math.round(it.cantidad * 1000)
    return suma + (Number.isInteger(it.costo_unitario) ? centavosDeLinea(mil, it.costo_unitario) : BigInt(Math.round(it.cantidad * it.costo_unitario * 100)))
  }, 0n)
  return Number(centavos) / 100
}

/**
 * Total de la compra al centavo, igual al de `oc_recalcular` del servidor (suma de `round(cantidad × costo, 2)` por
 * línea): una compra inmediata exige que el pago lo cubra exactamente. Las líneas inválidas no suman.
 */
export function totalCompra(lineas: LineaCompra[]): number {
  let centavos = 0n
  for (const l of lineas) {
    const mil = parseMilesimas(l.cantidad)
    const costo = parseValor(l.costo)
    if (mil !== null && costo !== null) centavos += centavosDeLinea(mil, costo)
  }
  return Number(centavos) / 100
}

export type InfoArticulo = { controla_vencimiento?: boolean }

function erroresDeLinea(l: LineaCompra, f: FormCompra, articulos: Record<string, InfoArticulo>, previas: LineaCompra[]): ErroresLinea {
  const e: ErroresLinea = {}
  if (!l.articuloId) e.articulo = 'Elige el artículo.'
  else if (!(l.articuloId in articulos)) e.articulo = 'Ese artículo ya no está disponible. Elígelo de nuevo.'
  else if (previas.some((p) => p.articuloId === l.articuloId)) e.articulo = 'Este artículo ya está en la compra: suma la cantidad en esa línea.'
  if (!l.cantidad.trim()) e.cantidad = 'Escribe la cantidad.'
  else {
    const c = parseCantidad(l.cantidad)
    if (c === null) e.cantidad = 'La cantidad debe ser un número mayor que cero (hasta 3 decimales).'
    else if (c > CANTIDAD_MAXIMA) e.cantidad = 'La cantidad es demasiado grande (máximo 999.999).'
  }
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

/**
 * `articulos` son los que se pueden comprar hoy; `proveedoresIds`, si se conoce, los proveedores que existen: lo elegido
 * que ya no está (borrado o inactivo tras una sincronización) se frena aquí y no en el servidor o en Pendientes.
 */
export function validarForm(f: FormCompra, articulos: Record<string, InfoArticulo>, hoy: string, proveedoresIds?: ReadonlySet<string>): ErroresCompra {
  const errores: ErroresCompra = {}
  if (!f.proveedorId) errores.proveedor = 'Elige el proveedor o crea uno nuevo.'
  else if (f.proveedorId !== PROVEEDOR_NUEVO && proveedoresIds && !proveedoresIds.has(f.proveedorId)) {
    errores.proveedor = 'Ese proveedor ya no está disponible. Elígelo de nuevo.'
  }
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
  const total = totalDeItems(d.items)
  const proveedorId = d.orden.proveedor_id ?? d.proveedor_nuevo?.id ?? ''
  const inmediata = d.orden.modalidad === 'inmediata'
  const orden: Fila = {
    id: d.orden.id,
    proveedor_id: proveedorId,
    modalidad: d.orden.modalidad,
    estado: inmediata ? 'recibida' : 'pedida',
    fecha: d.orden.fecha,
    ...(d.orden.fecha_esperada ? { fecha_esperada: d.orden.fecha_esperada } : {}),
    total,
    // Con la forma que trae `sync_pull` (0005): ítems con lo recibido, recepciones con sus ítems y pagos.
    items: d.items.map((it) => ({ ...it, orden_id: d.orden.id, cantidad_recibida: inmediata ? it.cantidad : 0 })),
    recepciones: d.recepcion
      ? [{ id: d.recepcion.id, orden_id: d.orden.id, fecha: d.orden.fecha, items: d.recepcion.items.map((ri) => ({ ...ri, recepcion_id: d.recepcion!.id })) }]
      : [],
    pagos: (d.pagos ?? []).map((p) => ({ ...p, orden_compra_id: d.orden.id, direccion: 'pago', fecha: d.orden.fecha })),
  }
  const filas: Array<{ tabla: 'ordenes_compra' | 'terceros'; fila: Fila }> = [{ tabla: 'ordenes_compra', fila: orden }]
  if (d.proveedor_nuevo) filas.push({ tabla: 'terceros', fila: filaLocalTercero(d.proveedor_nuevo) })
  return filas
}
