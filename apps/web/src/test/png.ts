// Decodificador mínimo de PNG para pruebas (sin dependencias): 8 bits por canal, RGB o RGBA, sin entrelazado.
import { inflateSync } from 'node:zlib'

export interface Imagen {
  ancho: number
  alto: number
  /** Canales por píxel: 3 (RGB) o 4 (RGBA). */
  canales: 3 | 4
  /** Píxeles sin filtro, fila por fila. */
  datos: Uint8Array
}

export function decodificarPng(png: Buffer): Imagen {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('No es un PNG')
  const ancho = png.readUInt32BE(16)
  const alto = png.readUInt32BE(20)
  const profundidad = png.readUInt8(24)
  const tipo = png.readUInt8(25)
  const entrelazado = png.readUInt8(28)
  if (profundidad !== 8 || (tipo !== 2 && tipo !== 6) || entrelazado !== 0) {
    throw new Error(`PNG no soportado por la prueba: usa RGB o RGBA de 8 bits sin entrelazado (recibió profundidad ${profundidad}, tipo ${tipo}, entrelazado ${entrelazado})`)
  }
  const canales = tipo === 6 ? 4 : 3
  const trozos: Buffer[] = []
  for (let i = 8; i < png.length; ) {
    const largo = png.readUInt32BE(i)
    if (png.subarray(i + 4, i + 8).toString('latin1') === 'IDAT') trozos.push(png.subarray(i + 8, i + 8 + largo))
    i += 12 + largo
  }
  const crudo = inflateSync(Buffer.concat(trozos))
  const fila = ancho * canales
  if (crudo.length !== alto * (fila + 1)) throw new Error(`PNG truncado o corrupto: faltan datos (${crudo.length} bytes, se esperaban ${alto * (fila + 1)})`)
  const datos = new Uint8Array(alto * fila)
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)]!
    if (filtro > 4) throw new Error(`PNG corrupto: filtro ${filtro} desconocido en la fila ${y}`)
    for (let x = 0; x < fila; x++) {
      const v = crudo[y * (fila + 1) + 1 + x]!
      const a = x >= canales ? datos[y * fila + x - canales]! : 0
      const b = y > 0 ? datos[(y - 1) * fila + x]! : 0
      const c = x >= canales && y > 0 ? datos[(y - 1) * fila + x - canales]! : 0
      let pred = 0
      if (filtro === 1) pred = a
      else if (filtro === 2) pred = b
      else if (filtro === 3) pred = Math.floor((a + b) / 2)
      else if (filtro === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      datos[y * fila + x] = (v + pred) & 255
    }
  }
  return { ancho, alto, canales, datos }
}

/** Luminosidad aproximada (0 a 255) del píxel (x, y). */
export function luminosidad(img: Imagen, x: number, y: number): number {
  const i = (y * img.ancho + x) * img.canales
  return 0.299 * img.datos[i]! + 0.587 * img.datos[i + 1]! + 0.114 * img.datos[i + 2]!
}

/** Alfa del píxel (x, y); 255 si la imagen no tiene canal alfa. */
export function alfa(img: Imagen, x: number, y: number): number {
  return img.canales === 4 ? img.datos[(y * img.ancho + x) * 4 + 3]! : 255
}
