// Tokens de tipografía, textura y sombra del rediseño (T-D1, CAM-106, docs/producto/diseno.md). La app funciona sin red:
// fuentes y textura se sirven desde el propio paquete y el service worker las precachea.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { opcionesPwa } from '../pwa/config'

const css = readFileSync('src/index.css', 'utf8')
const html = readFileSync('index.html', 'utf8')

describe('[RNF-UX] fuentes de la marca autoalojadas', () => {
  it.each(['Fraunces', 'Work Sans'])('declara @font-face de %s con font-display: swap', (familia) => {
    const bloques = css.match(/@font-face\s*{[^}]*}/g) ?? []
    const propios = bloques.filter((b) => b.includes(`'${familia}'`))
    expect(propios.length).toBeGreaterThan(0)
    for (const b of propios) expect(b).toMatch(/font-display:\s*swap/)
  })

  it('cada archivo de fuente referenciado existe y es woff2', () => {
    const urls = [...css.matchAll(/url\('(\.\/fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1]!)
    expect(urls.length).toBeGreaterThanOrEqual(3)
    for (const u of urls) expect(existsSync(`src/${u.slice(2)}`)).toBe(true)
  })

  it('cada archivo de fuente es un woff2 real (firma wOF2) y no un puntero vacío', () => {
    const urls = [...css.matchAll(/url\('(\.\/fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1]!)
    for (const u of urls) expect(readFileSync(`src/${u.slice(2)}`).subarray(0, 4).toString('latin1')).toBe('wOF2')
  })

  it('los rangos de peso de cada @font-face coinciden con lo recortado', () => {
    const peso = (familia: string, estilo: string) => {
      const b = (css.match(/@font-face\s*{[^}]*}/g) ?? []).find((x) => x.includes(`'${familia}'`) && x.includes(`font-style: ${estilo}`))
      return /font-weight:\s*([^;]+);/.exec(b ?? '')?.[1]
    }
    expect(peso('Fraunces', 'normal')).toBe('500 700')
    expect(peso('Fraunces', 'italic')).toBe('500')
    expect(peso('Work Sans', 'normal')).toBe('100 900')
  })

  it('no fija el eje óptico de Fraunces: el navegador lo ajusta al tamaño (font-optical-sizing: auto)', () => {
    expect(css).not.toMatch(/font-variation-settings:[^;]*opsz/)
  })

  it('pesa menos de 160 KB en total (presupuesto de precaché)', () => {
    const urls = [...css.matchAll(/url\('(\.\/fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1]!)
    const total = urls.reduce((n, u) => n + readFileSync(`src/${u.slice(2)}`).length, 0)
    expect(total).toBeLessThan(160 * 1024)
  })

  it('los titulares usan Fraunces y el cuerpo Work Sans, con pila de respaldo', () => {
    expect(css).toMatch(/--font-titulo:\s*'Fraunces',[^;]*serif/)
    expect(css).toMatch(/--font-cuerpo:\s*'Work Sans',[^;]*sans-serif/)
  })

  it('sin recursos externos: ni Google Fonts ni URL absolutas en CSS o index.html', () => {
    expect(css).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })
})

describe('[RNF-UX] papel y sombra de la web', () => {
  it('trae el grano de papel local y lo usa de fondo', () => {
    expect(existsSync('src/assets/grano-papel.webp')).toBe(true)
    expect(css).toMatch(/url\('\.\/assets\/grano-papel\.webp'\)/)
  })

  it('define la sombra de papeles apilados y la del elemento flotante', () => {
    expect(css).toMatch(/--shadow-papel:\s*0 1px 0 rgb\(58 36 24 \/ 0\.1\), 0 5px 0 -2px rgb\(58 36 24 \/ 0\.07\)/)
    expect(css).toMatch(/--shadow-tarjeta:\s*0 1px 0 rgb\(58 36 24 \/ 0\.1\), 0 5px 0 -2px rgb\(58 36 24 \/ 0\.07\)/) // la que usa Tarjeta
    expect(css).toMatch(/--shadow-flotante:/)
  })

  it('el foco y la selección usan la terracota', () => {
    expect(css).toMatch(/:focus-visible\s*{[^}]*var\(--color-terracota\)/)
    expect(css).toMatch(/::selection\s*{[^}]*var\(--color-terracota\)/)
  })

  it('el service worker precachea fuentes e imágenes webp', () => {
    const patron = opcionesPwa.workbox?.globPatterns?.join(',') ?? ''
    const extensiones = [...css.matchAll(/url\('\.\/(?:fonts|assets)\/[^']+\.(\w+)'\)/g)].map((m) => m[1]!)
    expect(extensiones.length).toBeGreaterThan(0)
    for (const e of new Set(extensiones)) expect(patron).toContain(e)
  })
})
