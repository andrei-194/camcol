// Contraste AA de los pares de color definidos como tokens en index.css (T-M3-00, docs/producto/diseno.md).
// Fuente única: se leen los valores del propio CSS, así un cambio de paleta que rompa AA falla aquí.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

function token(nombre: string): string {
  const m = new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)
  if (!m) throw new Error(`Falta el token --color-${nombre} en index.css`)
  return m[1]!
}

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2)
}

function razon(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

// [texto, fondo]: texto normal exige >= 4.5.
const PARES_TEXTO: Array<[string, string]> = [
  ['texto', 'fondo'],
  ['texto', 'superficie'],
  ['texto-secundario', 'fondo'],
  ['texto-secundario', 'superficie'],
  ['fondo', 'cafe'], // texto papel sobre la cabecera de café
  ['trigo', 'cafe'], // detalles de trigo sobre la cabecera
  ['texto-secundario', 'tarjeta'],
  ['sobre-acento', 'terracota'], // texto de la selección
  ['peligro', 'superficie'],
  ['exito', 'superficie'],
  ['texto-secundario', 'arena'],
  ['acento', 'fondo'], // enlaces
  ['acento', 'superficie'],
  ['acento', 'acento-suave'],
  ['sobre-acento', 'acento'], // botón primario
  ['sobre-acento', 'acento-hover'],
  ['peligro', 'fondo'],
  ['peligro', 'peligro-suave'],
  ['sobre-peligro', 'peligro'], // botón de peligro
  ['exito', 'fondo'],
  ['advertencia', 'fondo'],
  ['advertencia', 'advertencia-suave'],
]

describe('[RNF-UX] contraste AA de los tokens de color', () => {
  it.each(PARES_TEXTO)('%s sobre %s: razón >= 4.5', (t, f) => {
    expect(razon(token(t), token(f))).toBeGreaterThanOrEqual(4.5)
  })

  it('el borde de los campos contra el fondo cumple 3:1 (componentes de interfaz)', () => {
    expect(razon(token('borde-fuerte'), token('fondo'))).toBeGreaterThanOrEqual(3)
  })

  it('el color del foco (terracota) cumple 3:1 contra el fondo, la superficie y la tarjeta', () => {
    for (const f of ['fondo', 'superficie', 'tarjeta']) expect(razon(token('terracota'), token(f))).toBeGreaterThanOrEqual(3)
  })

  it('el borde de los campos también cumple 3:1 contra la tarjeta blanca', () => {
    expect(razon(token('borde-fuerte'), token('tarjeta'))).toBeGreaterThanOrEqual(3)
  })
})

describe('paleta de marca (decisión del socio)', () => {
  it('el café de acento es el cacao #5a3a2a y el rojo solo existe como peligro', () => {
    expect(token('acento').toLowerCase()).toBe('#5a3a2a')
    expect(token('acento-hover').toLowerCase()).toBe('#3a2418')
    expect(token('peligro').toLowerCase()).toBe('#b3261e')
  })

  it('el fondo es el papel de la web, las superficies la crema y la cabecera el café', () => {
    expect(token('fondo').toLowerCase()).toBe('#fbf7ee')
    expect(token('superficie').toLowerCase()).toBe('#f6efe2')
    expect(token('cafe').toLowerCase()).toBe('#3a2418')
    expect(token('texto').toLowerCase()).toBe('#3a2418')
  })

  it('la terracota de la web existe solo para foco, selección y camino punteado', () => {
    expect(token('terracota').toLowerCase()).toBe('#b5532f')
  })
})
