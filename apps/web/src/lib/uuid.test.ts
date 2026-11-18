import { describe, expect, it } from 'vitest'
import { crearGeneradorUuidV7, esUuid, uuidV7 } from './uuid'

const RE_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('[RF-SYN-11] UUID v7', () => {
  it('tiene formato v7 válido (versión 7, variante RFC 9562)', () => {
    for (let i = 0; i < 200; i++) expect(uuidV7()).toMatch(RE_V7)
  })

  it('codifica el instante en los primeros 48 bits', () => {
    const t = Date.UTC(2026, 10, 17, 12, 0, 0)
    const hex = crearGeneradorUuidV7(() => t)().replace(/-/g, '').slice(0, 12)
    expect(parseInt(hex, 16)).toBe(t)
  })

  it('ordena por tiempo como texto', () => {
    let t = 1_700_000_000_000
    const gen = crearGeneradorUuidV7(() => t)
    const a = gen()
    t += 1
    const b = gen()
    t = 1_800_000_000_000
    const c = gen()
    expect([c, a, b].sort()).toEqual([a, b, c])
  })

  it('es monótono dentro del mismo milisegundo y si el reloj retrocede', () => {
    let t = 1_800_000_000_000
    const gen = crearGeneradorUuidV7(() => t)
    const ids: string[] = []
    for (let i = 0; i < 5000; i++) ids.push(gen())
    t -= 1000 // reloj atrasado: no rompe el orden
    ids.push(gen())
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('con el reloj real salen únicos y ordenados', () => {
    const ids = Array.from({ length: 1000 }, () => uuidV7())
    expect(new Set(ids).size).toBe(1000)
    expect([...ids].sort()).toEqual(ids)
  })

  it('esUuid acepta v7 y rechaza basura', () => {
    expect(esUuid(uuidV7())).toBe(true)
    expect(esUuid('123')).toBe(false)
    expect(esUuid('')).toBe(false)
  })
})
