import { formatCOP } from '../../lib/formato'
import type { DatosTablero } from './tipos'

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/** Frases que dicen qué atender hoy, de lo que más cuesta a lo que menos. Si no hay nada, lo dice. */
export function frasesDeDecision(d: DatosTablero): string[] {
  const frases: string[] = []
  const { cantidad: porCobrar, valor } = d.esperandoPago
  if (porCobrar > 0) {
    frases.push(`${porCobrar} ${plural(porCobrar, 'pedido espera', 'pedidos esperan')} pago: ${formatCOP(valor)} por cobrar.`)
  }
  if (d.faltantes.cantidad > 0) {
    const n = d.faltantes.cantidad
    frases.push(`${n} ${plural(n, 'artículo faltante', 'artículos faltantes')}${d.faltantes.ejemplo ? `: ${d.faltantes.ejemplo}` : ''}.`)
  }
  if (d.porConfirmar > 0) {
    frases.push(`${d.porConfirmar} ${plural(d.porConfirmar, 'pedido por confirmar', 'pedidos por confirmar')}.`)
  }
  return frases.length > 0 ? frases : ['Todo al día: no hay nada que atender.']
}
