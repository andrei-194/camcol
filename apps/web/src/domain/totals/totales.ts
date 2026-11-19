// Totales de un pedido de venta (T-M4-01, CAM-55). RF-VEN-03, RN-COS-03. TypeScript puro.
//
// Es la VISTA PREVIA del cálculo del servidor (regla 3: el servidor decide). Replica exacto lo que hacen
// `pv_recalcular` y `trg_pv_totales` (0001) y `v_ventas_pedido`, con la prueba de paridad `domain/paridad.test.ts`:
//   subtotal  = Σ round(cantidad × precio_unitario, 2)                      por línea
//   impuestos = Σ round(cantidad × precio_unitario × tasa / 100, 2)         por línea
//   total     = subtotal − descuento_valor + impuestos + envio_cobrado
// `round` de Postgres sobre numeric redondea la mitad hacia afuera del cero. Para no depender del punto flotante,
// todo se calcula con enteros BigInt en la escala de cada columna (cantidad 3 decimales, dinero 2, tasa 2, costo 4).
// Las entradas deben respetar esas escalas (son las de las columnas numeric); las salidas son pesos con ≤ 2 decimales.

export interface ItemPedido {
  /** numeric(12,3) */
  cantidad: number
  /** precio pactado, ya con el descuento del ítem; numeric(14,2) */
  precioUnitario: number
  /** porcentaje, numeric(5,2); por omisión 0 */
  tasaImpuesto?: number
  /** costo fijado al finalizar; numeric(14,4). Solo lo usa la utilidad */
  costoUnitario?: number | null
}

export interface EntradaTotales {
  items: ItemPedido[]
  /** descuento global, numeric(14,2) */
  descuentoValor?: number
  envioCobrado?: number
}

export interface Totales {
  subtotal: number
  descuentoValor: number
  impuestos: number
  envioCobrado: number
  total: number
  /** subtotal − descuento global (la «venta neta» de v_ventas_pedido) */
  ventasNetas: number
}

export type ErrorDescuento = 'DESCUENTO_MAYOR_SUBTOTAL' | 'TOTAL_NEGATIVO'

/** Número con `dec` decimales → entero escalado. */
export const escalar = (x: number, dec: number): bigint => BigInt(Math.round(x * 10 ** dec))

/** n / d redondeado con la mitad hacia afuera del cero (como `round(numeric)`). */
export const dividirRedondeado = (n: bigint, d: bigint): bigint => {
  const neg = n < 0n
  const a = neg ? -n : n
  const r = (2n * a + d) / (2n * d)
  return neg ? -r : r
}

export const centavosAPesos = (c: bigint): number => Number(c) / 100

const linea = (it: ItemPedido) => ({
  q: escalar(it.cantidad, 3),
  p: escalar(it.precioUnitario, 2),
  t: escalar(it.tasaImpuesto ?? 0, 2),
})

/** Totales en centavos (BigInt). */
export const totalesEnCentavos = (e: EntradaTotales) => {
  let subtotal = 0n
  let impuestos = 0n
  for (const it of e.items) {
    const { q, p, t } = linea(it)
    subtotal += dividirRedondeado(q * p, 1000n) //            cantidad(1e3) × precio(1e2) → centavos
    impuestos += dividirRedondeado(q * p * t, 10_000_000n) //  × tasa(1e2) / 100
  }
  const descuento = escalar(e.descuentoValor ?? 0, 2)
  const envio = escalar(e.envioCobrado ?? 0, 2)
  return { subtotal, descuento, impuestos, envio, total: subtotal - descuento + impuestos + envio }
}

export function calcularTotales(e: EntradaTotales): Totales {
  const c = totalesEnCentavos(e)
  return {
    subtotal: centavosAPesos(c.subtotal),
    descuentoValor: centavosAPesos(c.descuento),
    impuestos: centavosAPesos(c.impuestos),
    envioCobrado: centavosAPesos(c.envio),
    total: centavosAPesos(c.total),
    ventasNetas: centavosAPesos(c.subtotal - c.descuento),
  }
}

/** Precio pactado de un ítem con descuento: `round(precio_lista × (1 − pct/100), 2)` (op `pedido_venta.crear`, 0010). */
export function precioConDescuento(precioLista: number, descuentoPct: number): number {
  const l = escalar(precioLista, 2)
  const p = escalar(descuentoPct, 2)
  return centavosAPesos(dividirRedondeado(l * (10_000n - p), 10_000n))
}

/** RF-VEN-03: el descuento global no supera el subtotal ni deja el total negativo (el servidor lo rechaza al crear y finalizar). */
export function validarDescuento(t: Totales): ErrorDescuento | null {
  const desc = escalar(t.descuentoValor, 2)
  if (desc > escalar(t.subtotal, 2)) return 'DESCUENTO_MAYOR_SUBTOTAL'
  if (escalar(t.total, 2) < 0n) return 'TOTAL_NEGATIVO'
  return null
}

export interface EntradaUtilidad extends EntradaTotales {
  /** lo que se paga a la transportadora; numeric(14,2) */
  envioCosto?: number
}

/**
 * RN-COS-03: utilidad bruta = (subtotal − descuento global) + envío cobrado − envío pagado − costo de la mercancía.
 * El costo es Σ cantidad × costo_unitario SIN redondear (como `v_ventas_pedido`): se calcula exacto en 1e-7 y se
 * convierte a número una sola vez (exacto mientras la utilidad sea < 900 millones de pesos).
 */
export function calcularUtilidadBruta(e: EntradaUtilidad): number {
  const c = totalesEnCentavos(e)
  let costo = 0n // escala 1e-7 = cantidad(1e-3) × costo(1e-4)
  for (const it of e.items) costo += escalar(it.cantidad, 3) * escalar(it.costoUnitario ?? 0, 4)
  const ingresos = c.subtotal - c.descuento + c.envio - escalar(e.envioCosto ?? 0, 2) // centavos
  return Number(ingresos * 100_000n - costo) / 1e7
}
