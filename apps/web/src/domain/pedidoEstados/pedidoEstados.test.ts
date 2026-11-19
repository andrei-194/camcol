// T-M4-01 (CAM-55). Máquina de estados del pedido de venta (SPEC §9.1). La paridad con `pv_transicion_valida`
// y los triggers vive en ../paridad.test.ts.
import { describe, expect, it } from 'vitest'
import { ESTADOS_PEDIDO, esTerminal, requiereMotivo, transicionValida, transicionesDesde } from './index'

describe('pedidoEstados', () => {
  it('[RF-VEN-05] transiciones válidas: recibido→{confirmado,cancelado}, confirmado→{finalizado,cancelado}, finalizado→devuelto', () => {
    expect(transicionesDesde('recibido')).toEqual(['confirmado', 'cancelado'])
    expect(transicionesDesde('confirmado')).toEqual(['finalizado', 'cancelado'])
    expect(transicionesDesde('finalizado')).toEqual(['devuelto'])
    expect(transicionesDesde('cancelado')).toEqual([])
    expect(transicionesDesde('devuelto')).toEqual([])
  })

  it('[RN-VEN-02] solo hay cinco estados y cancelado/devuelto son terminales', () => {
    expect(ESTADOS_PEDIDO).toEqual(['recibido', 'confirmado', 'finalizado', 'cancelado', 'devuelto'])
    expect(esTerminal('cancelado')).toBe(true)
    expect(esTerminal('devuelto')).toBe(true)
    expect(esTerminal('finalizado')).toBe(false)
  })

  it('[RN-VEN-02] no se cancela un pedido finalizado ni se salta de recibido a finalizado', () => {
    expect(transicionValida('finalizado', 'cancelado')).toBe(false)
    expect(transicionValida('recibido', 'finalizado')).toBe(false)
    expect(transicionValida('confirmado', 'confirmado')).toBe(false)
  })

  it('[RF-VEN-05] cancelado y devuelto exigen motivo', () => {
    expect(requiereMotivo('cancelado')).toBe(true)
    expect(requiereMotivo('devuelto')).toBe(true)
    expect(requiereMotivo('confirmado')).toBe(false)
  })
})
