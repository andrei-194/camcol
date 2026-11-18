import { describe, expect, it } from 'vitest'
import {
  fechaBogota,
  formatCantidad,
  formatCOP,
  formatFecha,
  formatFechaHora,
  gramosALibras,
  hoyBogota,
  LIBRA_EN_GRAMOS,
  librasAGramos,
} from './formato'

// Intl usa espacios duros (U+00A0 / U+202F); se normalizan para comparar.
const n = (s: string) => s.replace(new RegExp('[\\u00a0\\u202f]', 'g'), ' ')

describe('[RNF-UX-01] formatCOP: pesos sin decimales', () => {
  it('cero', () => expect(n(formatCOP(0))).toBe('$ 0'))
  it('menos de mil', () => expect(n(formatCOP(950))).toBe('$ 950'))
  it('miles con punto, también en 4 dígitos', () => {
    expect(n(formatCOP(1000))).toBe('$ 1.000')
    expect(n(formatCOP(1234567))).toBe('$ 1.234.567')
  })
  it('negativos', () => expect(n(formatCOP(-12500))).toBe('-$ 12.500'))
  it('redondea a entero y nunca muestra decimales', () => {
    expect(n(formatCOP(1999.6))).toBe('$ 2.000')
    expect(n(formatCOP(10.2))).toBe('$ 10')
  })
  it('no muestra "-$ 0" para -0 ni para redondeos a cero', () => {
    expect(n(formatCOP(-0))).toBe('$ 0')
    expect(n(formatCOP(-0.2))).toBe('$ 0')
  })
})

describe('[RNF-UX-01] formatCantidad: hasta 3 decimales', () => {
  it('entero sin decimales', () => expect(formatCantidad(5)).toBe('5'))
  it('coma decimal y sin ceros sobrantes', () => {
    expect(formatCantidad(2.5)).toBe('2,5')
    expect(formatCantidad(0.125)).toBe('0,125')
  })
  it('máximo 3 decimales', () => expect(formatCantidad(1.23456)).toBe('1,235'))
  it('miles y cero', () => {
    expect(formatCantidad(1500)).toBe('1.500')
    expect(formatCantidad(0)).toBe('0')
  })
})

describe('[RNF-UX-01] fechas en America/Bogota (UTC-5, sin horario de verano)', () => {
  it('medianoche en Bogotá es 05:00 UTC: ya es ese día', () => {
    expect(fechaBogota(new Date('2026-11-17T05:00:00Z'))).toBe('2026-11-17')
  })
  it('un minuto antes de la medianoche de Bogotá sigue siendo el día anterior', () => {
    expect(fechaBogota(new Date('2026-11-17T04:59:00Z'))).toBe('2026-11-16')
  })
  it('las 23:30 en Bogotá ya son el día siguiente en UTC, pero no en Bogotá', () => {
    expect(fechaBogota(new Date('2026-11-18T04:30:00Z'))).toBe('2026-11-17')
  })
  it('cambio de año', () => {
    expect(fechaBogota(new Date('2027-01-01T04:59:59Z'))).toBe('2026-12-31')
    expect(fechaBogota(new Date('2027-01-01T05:00:00Z'))).toBe('2027-01-01')
  })
  it('acepta ISO con zona', () => {
    expect(fechaBogota('2026-11-17T23:30:00-05:00')).toBe('2026-11-17')
  })
  it('hoyBogota usa el reloj inyectado', () => {
    expect(hoyBogota(new Date('2026-03-01T03:00:00Z'))).toBe('2026-02-28')
  })
  it('formatFecha: día/mes/año', () => {
    expect(formatFecha(new Date('2026-11-17T05:00:00Z'))).toBe('17/11/2026')
    expect(formatFecha(new Date('2026-11-17T04:59:00Z'))).toBe('16/11/2026')
  })
  it('una fecha de calendario AAAA-MM-DD no se corre un día (gastos.fecha)', () => {
    expect(formatFecha('2026-11-17')).toBe('17/11/2026')
    expect(fechaBogota('2026-11-17')).toBe('2026-11-17')
  })
  it('formatFechaHora muestra la hora de Bogotá en 24 h', () => {
    expect(n(formatFechaHora(new Date('2026-11-17T20:05:00Z')))).toContain('15:05')
    expect(formatFechaHora(new Date('2026-11-17T05:00:00Z'))).toContain('00:00')
  })
  it('fecha inválida lanza un error claro', () => {
    expect(() => fechaBogota('no es fecha')).toThrow(/fecha/i)
  })
})

describe('libra = 500 g', () => {
  it('conversiones', () => {
    expect(LIBRA_EN_GRAMOS).toBe(500)
    expect(librasAGramos(2)).toBe(1000)
    expect(gramosALibras(250)).toBe(0.5)
    expect(gramosALibras(0)).toBe(0)
  })
})
