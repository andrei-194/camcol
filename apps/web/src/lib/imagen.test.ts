import { describe, expect, it } from 'vitest'
import { comprimirImagen, MAX_BYTES, MAX_LADO, type ImagenAbierta, type MotorImagen } from './imagen'

/** Motor falso: el tamaño del resultado es proporcional a ancho*alto*calidad. */
function motor(opts: { ancho: number; alto: number; webp?: boolean; bytesPorPixel?: number }): MotorImagen {
  return {
    async abrir(): Promise<ImagenAbierta> {
      return {
        ancho: opts.ancho,
        alto: opts.alto,
        async codificar(ancho, alto, mime, calidad) {
          const tipo = mime === 'image/webp' && opts.webp === false ? 'image/png' : mime
          const bytes = Math.round(ancho * alto * calidad * (opts.bytesPorPixel ?? 0.2))
          return new Blob([new Uint8Array(bytes)], { type: tipo })
        },
        cerrar() {},
      }
    },
  }
}

describe('[RF-SYN-09] comprimirImagen', () => {
  it('limita el lado largo a 1280 px conservando la proporción', async () => {
    const r = await comprimirImagen(new Blob(['x']), motor({ ancho: 4000, alto: 3000, bytesPorPixel: 0.01 }))
    expect(Math.max(r.ancho, r.alto)).toBeLessThanOrEqual(MAX_LADO)
    expect(r.ancho / r.alto).toBeCloseTo(4 / 3, 1)
  })

  it('no agranda una imagen pequeña', async () => {
    const r = await comprimirImagen(new Blob(['x']), motor({ ancho: 640, alto: 480, bytesPorPixel: 0.01 }))
    expect([r.ancho, r.alto]).toEqual([640, 480])
  })

  it('entrega WebP de hasta ~150 KB, bajando calidad y luego tamaño', async () => {
    const r = await comprimirImagen(new Blob(['x']), motor({ ancho: 4000, alto: 3000, bytesPorPixel: 0.6 }))
    expect(r.mime).toBe('image/webp')
    expect(r.blob.type).toBe('image/webp')
    expect(r.blob.size).toBeLessThanOrEqual(MAX_BYTES)
  })

  it('si el navegador no codifica WebP (iOS Safari antiguo), recae en JPEG', async () => {
    const r = await comprimirImagen(new Blob(['x']), motor({ ancho: 3000, alto: 2000, webp: false, bytesPorPixel: 0.05 }))
    expect(r.mime).toBe('image/jpeg')
    expect(r.blob.type).toBe('image/jpeg')
    expect(r.blob.size).toBeLessThanOrEqual(MAX_BYTES)
  })
})
