// T-M4-01 (CAM-55). Pruebas de unidad y de propiedades (fast-check) de domain/totals. La paridad contra
// Postgres vive en ../paridad.test.ts.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  calcularTotales,
  calcularUtilidadBruta,
  cobradoNeto,
  precioConDescuento,
  saldoPedido,
  validarCobro,
  validarDescuento,
  validarReembolso,
} from './index'

describe('calcularTotales', () => {
  it('[RF-VEN-03] subtotal, impuestos y total de un pedido simple', () => {
    const t = calcularTotales({
      items: [
        { cantidad: 3, precioUnitario: 20000, tasaImpuesto: 19 },
        { cantidad: 2, precioUnitario: 10000 },
      ],
      descuentoValor: 5000,
      envioCobrado: 8000,
    })
    expect(t).toEqual({ subtotal: 80000, descuentoValor: 5000, impuestos: 11400, envioCobrado: 8000, total: 94400, ventasNetas: 75000 })
  })

  it('[RF-VEN-03] sin ítems todo es cero y el envío entra al total', () => {
    expect(calcularTotales({ items: [], envioCobrado: 5000 }).total).toBe(5000)
  })

  it('[RF-VEN-03] redondea por línea a centavos, mitad hacia arriba (como round de Postgres)', () => {
    // 0,5 × 0,01 = 0,005 → 0,01; dos líneas = 0,02 (no 0,01 de redondear la suma)
    const t = calcularTotales({ items: [{ cantidad: 0.5, precioUnitario: 0.01 }, { cantidad: 0.5, precioUnitario: 0.01 }] })
    expect(t.subtotal).toBe(0.02)
  })

  it('[RF-VEN-03] el impuesto se redondea por línea sobre cantidad × precio × tasa', () => {
    // 1,5 × 333,33 × 19 % = 94,99905 → 95,00
    expect(calcularTotales({ items: [{ cantidad: 1.5, precioUnitario: 333.33, tasaImpuesto: 19 }] }).impuestos).toBe(95)
  })

  it('[RF-VEN-03] propiedad: total = subtotal − descuento + impuestos + envío y no depende del orden de los ítems', () => {
    const item = fc.record({
      cantidad: fc.integer({ min: 1, max: 50000 }).map((n) => n / 1000),
      precioUnitario: fc.integer({ min: 0, max: 50_000_000 }).map((n) => n / 100),
      tasaImpuesto: fc.integer({ min: 0, max: 3000 }).map((n) => n / 100),
    })
    fc.assert(
      fc.property(fc.array(item, { maxLength: 8 }), fc.nat(1_000_000), fc.nat(100_000), (items, desc, envio) => {
        const t = calcularTotales({ items, descuentoValor: desc, envioCobrado: envio })
        const inv = calcularTotales({ items: [...items].reverse(), descuentoValor: desc, envioCobrado: envio })
        expect(inv).toEqual(t)
        expect(Math.round((t.subtotal - desc + t.impuestos + envio) * 100)).toBe(Math.round(t.total * 100))
      }),
    )
  })
})

describe('precioConDescuento', () => {
  it('[RN-PRE-01] precio_lista × (1 − pct/100) a centavos', () => {
    expect(precioConDescuento(10000, 10)).toBe(9000)
    expect(precioConDescuento(333.33, 12.5)).toBe(291.66) // 291,66375
    expect(precioConDescuento(0.05, 50)).toBe(0.03) // 0,025 → mitad hacia arriba
    expect(precioConDescuento(100, 0)).toBe(100)
    expect(precioConDescuento(100, 100)).toBe(0)
  })
})

describe('validarDescuento', () => {
  it('[RF-VEN-03] el descuento no supera el subtotal ni deja el total negativo', () => {
    const base = { items: [{ cantidad: 1, precioUnitario: 10000 }] }
    expect(validarDescuento(calcularTotales({ ...base, descuentoValor: 10000 }))).toBeNull()
    expect(validarDescuento(calcularTotales({ ...base, descuentoValor: 10001, envioCobrado: 50000 }))).toBe('DESCUENTO_MAYOR_SUBTOTAL')
  })
})

describe('calcularUtilidadBruta', () => {
  it('[RN-COS-03] (subtotal − descuento) + envío cobrado − envío pagado − costo de mercancía', () => {
    const u = calcularUtilidadBruta({
      items: [{ cantidad: 5, precioUnitario: 20000, costoUnitario: 12000.5 }],
      descuentoValor: 4000,
      envioCobrado: 10000,
      envioCosto: 7000,
    })
    expect(u).toBe(100000 - 4000 + 10000 - 7000 - 60002.5)
  })

  it('[RN-COS-03] no redondea el costo: cantidad × costo con 4 decimales', () => {
    const u = calcularUtilidadBruta({ items: [{ cantidad: 0.333, precioUnitario: 1000, costoUnitario: 1.2345 }], envioCosto: 0 })
    expect(u).toBeCloseTo(333 - 0.4110885, 7)
  })
})

describe('pagos: cobrado neto y saldo', () => {
  const pagos = [
    { direccion: 'cobro' as const, valor: 60000 },
    { direccion: 'cobro' as const, valor: 40000 },
    { direccion: 'reembolso' as const, valor: 30000 },
  ]
  it('[RN-PAG-01] cobrado neto = Σ cobros − Σ reembolsos; saldo = total − cobrado neto', () => {
    expect(cobradoNeto(pagos)).toBe(70000)
    expect(saldoPedido(100000, pagos)).toBe(30000)
  })
  it('[RN-PAG-02] un cobro que deja el neto sobre el total es E_SOBREPAGO', () => {
    expect(validarCobro(100000, 60000, 40000)).toBeNull()
    expect(validarCobro(100000, 60000, 40001)).toBe('E_SOBREPAGO')
  })
  it('[RN-PAG-04] el reembolso es entero, mayor que cero y no supera el cobrado neto', () => {
    expect(validarReembolso(70000, 70000)).toBeNull()
    expect(validarReembolso(70000, 70001)).toBe('E_SOBREPAGO')
    expect(validarReembolso(0, 1000)).toBe('E_SOBREPAGO')
    expect(validarReembolso(70000, 0)).toBe('DATOS_INVALIDOS')
    expect(validarReembolso(70000, 10.5)).toBe('DATOS_INVALIDOS')
  })
})
