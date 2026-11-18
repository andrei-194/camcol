// Máquina de estados del pedido de venta (T-M4-01, CAM-55). SPEC §9.1, RN-VEN-02, RF-VEN-05. TypeScript puro.
// Única fuente en el servidor: `pv_transicion_valida` (0001); la paridad se prueba en `domain/paridad.test.ts`.

export const ESTADOS_PEDIDO = ['recibido', 'confirmado', 'finalizado', 'cancelado', 'devuelto'] as const
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number]

const TRANSICIONES: Readonly<Record<EstadoPedido, readonly EstadoPedido[]>> = {
  recibido: ['confirmado', 'cancelado'],
  confirmado: ['finalizado', 'cancelado'],
  finalizado: ['devuelto'],
  cancelado: [],
  devuelto: [],
}

export const transicionesDesde = (estado: EstadoPedido): readonly EstadoPedido[] => TRANSICIONES[estado]

export const transicionValida = (de: EstadoPedido, a: EstadoPedido): boolean => TRANSICIONES[de].includes(a)

/** `cancelado` y `devuelto` no tienen salida (el dinero se devuelve con `pago.reembolsar`, no cambia el estado). */
export const esTerminal = (estado: EstadoPedido): boolean => TRANSICIONES[estado].length === 0

/** RF-VEN-05: pasar a `cancelado` o `devuelto` exige motivo no vacío (trigger `pv_a_validar`, 0015). */
export const requiereMotivo = (destino: EstadoPedido): boolean => destino === 'cancelado' || destino === 'devuelto'
