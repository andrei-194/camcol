// El decodificador de PNG de las pruebas (src/test/png.ts): debe decodificar bien y fallar con un mensaje claro, no
// devolver una imagen negra, cuando el archivo está corrupto o no es compatible.
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { alfa, decodificarPng, luminosidad } from './png'

function trozo(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  return Buffer.concat([largo, Buffer.from(tipo, 'latin1'), datos, Buffer.alloc(4)]) // el CRC no se valida
}

function png(ancho: number, alto: number, tipo: number, filas: number[][], opciones: { entrelazado?: number } = {}): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(tipo, 9)
  ihdr.writeUInt8(opciones.entrelazado ?? 0, 12)
  const crudo = Buffer.from(filas.flat())
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo)),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

describe('decodificarPng', () => {
  it('filtro 0 (ninguno): devuelve los píxeles tal cual, con alfa', () => {
    const img = decodificarPng(png(2, 1, 6, [[0, 10, 20, 30, 255, 40, 50, 60, 128]]))
    expect([img.ancho, img.alto, img.canales]).toEqual([2, 1, 4])
    expect(Array.from(img.datos)).toEqual([10, 20, 30, 255, 40, 50, 60, 128])
    expect(alfa(img, 0, 0)).toBe(255)
    expect(alfa(img, 1, 0)).toBe(128)
  })

  it('filtro 1 (Sub): suma el píxel de la izquierda', () => {
    const img = decodificarPng(png(2, 1, 2, [[1, 10, 20, 30, 5, 5, 5]]))
    expect(Array.from(img.datos)).toEqual([10, 20, 30, 15, 25, 35])
  })

  it('filtro 2 (Up): suma el píxel de arriba', () => {
    const img = decodificarPng(png(1, 2, 2, [[0, 10, 20, 30], [2, 1, 1, 1]]))
    expect(Array.from(img.datos)).toEqual([10, 20, 30, 11, 21, 31])
  })

  it('filtro 3 (Average): promedia izquierda y arriba, redondeando hacia abajo', () => {
    const img = decodificarPng(png(1, 2, 2, [[0, 11, 21, 31], [3, 0, 0, 0]]))
    expect(Array.from(img.datos)).toEqual([11, 21, 31, 5, 10, 15])
  })

  it('filtro 4 (Paeth): sin vecinos a la izquierda ni arriba equivale a sumar cero', () => {
    const img = decodificarPng(png(1, 1, 2, [[4, 7, 8, 9]]))
    expect(Array.from(img.datos)).toEqual([7, 8, 9])
  })

  it('luminosidad: blanco 255, negro 0', () => {
    const img = decodificarPng(png(2, 1, 2, [[0, 255, 255, 255, 0, 0, 0]]))
    expect(luminosidad(img, 0, 0)).toBeCloseTo(255, 0)
    expect(luminosidad(img, 1, 0)).toBe(0)
  })

  it('un filtro desconocido falla con un mensaje claro', () => {
    expect(() => decodificarPng(png(1, 1, 2, [[7, 1, 2, 3]]))).toThrow(/filtro/i)
  })

  it('datos truncados fallan en vez de devolver una imagen negra', () => {
    expect(() => decodificarPng(png(1, 2, 2, [[0, 1, 2, 3]]))).toThrow(/truncad|faltan/i)
  })

  it('un tipo de color no compatible o el entrelazado dicen qué usar', () => {
    expect(() => decodificarPng(png(1, 1, 3, [[0, 1]]))).toThrow(/RGB o RGBA/)
    expect(() => decodificarPng(png(1, 1, 2, [[0, 1, 2, 3]], { entrelazado: 1 }))).toThrow(/RGB o RGBA/)
  })

  it('un archivo que no es PNG falla', () => {
    expect(() => decodificarPng(Buffer.from('hola mundo, esto no es un png'))).toThrow(/No es un PNG/)
  })
})
