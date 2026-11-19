// Cobrado neto, saldo y topes de cobros y reembolsos de un PV (T-M4-01, CAM-55). RN-PAG-01/02/04. TypeScript puro.
// Réplica de la vista previa; el servidor decide (0017: `pagos_sobrepago`, `pagos_reembolso_candado`).
import { centavosAPesos, escalar } from './totales'

export interface PagoPedido {
  direccion: 'cobro' | 'reembolso'
  valor: number
}

export type ErrorPago = 'E_SOBREPAGO' | 'DATOS_INVALIDOS'

const neto = (pagos: readonly PagoPedido[]): bigint =>
  pagos.reduce((s, p) => s + (p.direccion === 'cobro' ? 1n : -1n) * escalar(p.valor, 2), 0n)

/** RN-PAG-01/02: cobrado neto = Σ cobros − Σ reembolsos. */
export const cobradoNeto = (pagos: readonly PagoPedido[]): number => centavosAPesos(neto(pagos))

/** RN-PAG-01: saldo de un PV = total − cobrado neto (con RN-PAG-02 nunca es negativo). */
export const saldoPedido = (total: number, pagos: readonly PagoPedido[]): number =>
  centavosAPesos(escalar(total, 2) - neto(pagos))

/** RN-PAG-02: un cobro que deja el cobrado neto por encima del total se rechaza (`E_SOBREPAGO`). */
export function validarCobro(total: number, cobradoNetoActual: number, valor: number): ErrorPago | null {
  return escalar(cobradoNetoActual, 2) + escalar(valor, 2) > escalar(total, 2) ? 'E_SOBREPAGO' : null
}

/** RN-PAG-04: el reembolso es > 0, entero (COP) y no supera el cobrado neto. */
export function validarReembolso(cobradoNetoActual: number, valor: number): ErrorPago | null {
  if (!(valor > 0) || !Number.isInteger(valor)) return 'DATOS_INVALIDOS'
  return escalar(valor, 2) > escalar(cobradoNetoActual, 2) ? 'E_SOBREPAGO' : null
}
