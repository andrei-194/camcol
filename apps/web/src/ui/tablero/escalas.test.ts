// Escalas de los gráficos del tablero (T-D4, CAM-109, RF-DSH-02/03): funciones puras, sin DOM.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { alturaBarra, anchoBarra, proporcionArco, puntosSerie } from './escalas'

describe('alturaBarra', () => {
  it('el máximo llena el alto y cero no dibuja nada', () => {
    expect(alturaBarra(70, 70, 80)).toBe(80)
    expect(alturaBarra(0, 70, 80)).toBe(0)
  })

  it('es proporcional', () => {
    expect(alturaBarra(35, 70, 80)).toBe(40)
  })

  it('un máximo de cero (sin datos) no divide por cero', () => {
    expect(alturaBarra(0, 0, 80)).toBe(0)
    expect(alturaBarra(5, 0, 80)).toBe(0)
  })

  it('valores no finitos o negativos no dibujan nada', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, -3]) expect(alturaBarra(v, 70, 80)).toBe(0)
  })

  it('[propiedad] siempre queda entre 0 y el alto, y no decrece con el valor', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e9, noNaN: true }), fc.double({ min: 0, max: 1e9, noNaN: true }), fc.integer({ min: 1, max: 400 }), (a, b, alto) => {
        const max = Math.max(a, b, 1)
        const ha = alturaBarra(a, max, alto)
        const hb = alturaBarra(b, max, alto)
        expect(ha).toBeGreaterThanOrEqual(0)
        expect(ha).toBeLessThanOrEqual(alto)
        if (a <= b) expect(ha).toBeLessThanOrEqual(hb + 1e-9)
      }),
    )
  })
})

describe('anchoBarra', () => {
  it('es el porcentaje del máximo, con tope de 100 y piso de 0', () => {
    expect(anchoBarra(14, 14)).toBe(100)
    expect(anchoBarra(7, 14)).toBe(50)
    expect(anchoBarra(20, 14)).toBe(100)
    expect(anchoBarra(-1, 14)).toBe(0)
    expect(anchoBarra(3, 0)).toBe(0)
  })
})

describe('proporcionArco', () => {
  it('31 % sobre una escala de 0 a 50 llena el 62 % del arco', () => {
    expect(proporcionArco(31, 50)).toBe(62)
  })

  it('se acota entre 0 y 100 y tolera valores no válidos', () => {
    expect(proporcionArco(80, 50)).toBe(100)
    expect(proporcionArco(-5, 50)).toBe(0)
    expect(proporcionArco(Number.NaN, 50)).toBe(0)
    expect(proporcionArco(10, 0)).toBe(0)
  })
})

describe('puntosSerie', () => {
  it('reparte los puntos a lo ancho y el máximo toca el borde superior del margen', () => {
    const p = puntosSerie([0, 50, 100], { ancho: 200, alto: 100, margen: 10, max: 100 })
    expect(p.map((x) => x.x)).toEqual([10, 100, 190])
    expect(p[0]!.y).toBe(90)
    expect(p[2]!.y).toBe(10)
  })

  it('con un solo punto lo centra y con serie vacía no devuelve nada', () => {
    expect(puntosSerie([5], { ancho: 200, alto: 100, margen: 10, max: 10 })[0]!.x).toBe(100)
    expect(puntosSerie([], { ancho: 200, alto: 100, margen: 10, max: 10 })).toEqual([])
  })

  it('[propiedad] todos los puntos caen dentro del área', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1e7, noNaN: true }), { minLength: 1, maxLength: 12 }), (serie) => {
        const max = Math.max(...serie, 1)
        for (const p of puntosSerie(serie, { ancho: 300, alto: 100, margen: 12, max })) {
          expect(p.x).toBeGreaterThanOrEqual(12 - 1e-9)
          expect(p.x).toBeLessThanOrEqual(288 + 1e-9)
          expect(p.y).toBeGreaterThanOrEqual(12 - 1e-9)
          expect(p.y).toBeLessThanOrEqual(88 + 1e-9)
        }
      }),
    )
  })
})
