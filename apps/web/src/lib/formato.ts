// Formato es-CO (RNF-UX-01): pesos sin decimales, cantidades con hasta 3 decimales y fechas en America/Bogota.
// Bogotá es UTC-5 todo el año (sin horario de verano), pero se usa la zona por nombre, no un desfase fijo.

const LOCALE = 'es-CO'
const ZONA = 'America/Bogota'

/** Una libra equivale a 500 g (regla de negocio, no 453,6 g). */
export const LIBRA_EN_GRAMOS = 500

const fmtCOP = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: 'always', // es-CO no agruparía 1000 sin esto
})
const fmtCantidad = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
  useGrouping: 'always',
})
const fmtPartesFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const fmtFechaHora = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const RE_FECHA_CALENDARIO = /^\d{4}-\d{2}-\d{2}$/

/** `$ 1.234.567`. Entero: redondea y nunca muestra decimales ni `-$ 0`. */
export function formatCOP(valor: number): string {
  const entero = Math.round(valor)
  return fmtCOP.format(entero === 0 ? 0 : entero)
}

/** Cantidades de inventario: `2,5`, `1.500`, máximo 3 decimales. */
export function formatCantidad(valor: number): string {
  const r = Math.round(valor * 1000) / 1000
  return fmtCantidad.format(r === 0 ? 0 : r)
}

const fmtPorcentaje = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 1, useGrouping: 'always' })

/** Porcentajes con coma y hasta un decimal: `31,5`. No agrega el signo «%». */
export function formatPorcentaje(valor: number): string {
  const r = Math.round(valor * 10) / 10
  return fmtPorcentaje.format(r === 0 ? 0 : r)
}

function aDate(valor: Date | string): Date {
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${String(valor)}`)
  return d
}

/** Día calendario `AAAA-MM-DD` en Bogotá. Una fecha ya de calendario (`gastos.fecha`) se devuelve igual. */
export function fechaBogota(valor: Date | string): string {
  if (typeof valor === 'string' && RE_FECHA_CALENDARIO.test(valor)) return valor
  const p = Object.fromEntries(fmtPartesFecha.formatToParts(aDate(valor)).map((x) => [x.type, x.value]))
  return `${p['year']}-${p['month']}-${p['day']}`
}

/** Hoy en Bogotá (`AAAA-MM-DD`). `ahora` solo se inyecta en pruebas. */
export function hoyBogota(ahora: Date = new Date()): string {
  return fechaBogota(ahora)
}

/** `17/11/2026`, día de Bogotá. */
export function formatFecha(valor: Date | string): string {
  const [a, m, d] = fechaBogota(valor).split('-')
  return `${d}/${m}/${a}`
}

/** `17/11/2026, 15:05` (24 h, hora de Bogotá). */
export function formatFechaHora(valor: Date | string): string {
  return fmtFechaHora.format(aDate(valor))
}

export function librasAGramos(libras: number): number {
  return libras * LIBRA_EN_GRAMOS
}

export function gramosALibras(gramos: number): number {
  return gramos / LIBRA_EN_GRAMOS
}
