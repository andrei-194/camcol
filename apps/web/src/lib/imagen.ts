// Compresión de fotos en el cliente (RF-SYN-09, PLAN §12): WebP, lado largo ≤ 1280 px, ≈ ≤ 150 KB.
// Si el navegador no sabe codificar WebP (iOS Safari: `toBlob('image/webp')` devuelve PNG), recae en JPEG.
// El motor (decodificar + codificar) se inyecta para probar la lógica sin canvas; `motorNavegador` es el real.

export const MAX_LADO = 1280
export const MAX_BYTES = 150 * 1024
const CALIDADES = [0.8, 0.7, 0.6, 0.5, 0.4]
const FACTOR_REDUCCION = 0.85
const LADO_MINIMO = 320

export interface ImagenAbierta {
  ancho: number
  alto: number
  /** Devuelve `null` si el navegador no pudo codificar; el `type` del blob dice el formato real. */
  codificar(ancho: number, alto: number, mime: string, calidad: number): Promise<Blob | null>
  cerrar(): void
}

export interface MotorImagen {
  abrir(blob: Blob): Promise<ImagenAbierta>
}

export interface ImagenComprimida {
  blob: Blob
  mime: 'image/webp' | 'image/jpeg'
  ancho: number
  alto: number
}

function escalar(ancho: number, alto: number, lado: number): [number, number] {
  const f = Math.min(1, lado / Math.max(ancho, alto))
  return [Math.max(1, Math.round(ancho * f)), Math.max(1, Math.round(alto * f))]
}

export async function comprimirImagen(archivo: Blob, motor: MotorImagen = motorNavegador): Promise<ImagenComprimida> {
  const img = await motor.abrir(archivo)
  try {
    let mime: 'image/webp' | 'image/jpeg' = 'image/webp'
    let lado = Math.min(MAX_LADO, Math.max(img.ancho, img.alto))
    let ultimo: ImagenComprimida | undefined
    for (;;) {
      const [ancho, alto] = escalar(img.ancho, img.alto, lado)
      for (const q of CALIDADES) {
        let blob = await img.codificar(ancho, alto, mime, q)
        if (mime === 'image/webp' && blob && blob.type !== 'image/webp') {
          mime = 'image/jpeg' // sin soporte de WebP en este navegador
          blob = await img.codificar(ancho, alto, mime, q)
        }
        if (!blob) throw new Error('No se pudo comprimir la foto')
        ultimo = { blob, mime, ancho, alto }
        if (blob.size <= MAX_BYTES) return ultimo
      }
      if (lado <= LADO_MINIMO) return ultimo! // no baja más; mejor una foto algo pesada que perderla
      lado = Math.max(LADO_MINIMO, Math.round(lado * FACTOR_REDUCCION))
    }
  } finally {
    img.cerrar()
  }
}

/** Motor real: `createImageBitmap` (respeta la orientación EXIF) + canvas. */
export const motorNavegador: MotorImagen = {
  async abrir(blob) {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return {
      ancho: bmp.width,
      alto: bmp.height,
      async codificar(ancho, alto, mime, calidad) {
        if (typeof OffscreenCanvas !== 'undefined') {
          const c = new OffscreenCanvas(ancho, alto)
          c.getContext('2d')?.drawImage(bmp, 0, 0, ancho, alto)
          return c.convertToBlob({ type: mime, quality: calidad })
        }
        const c = document.createElement('canvas')
        c.width = ancho
        c.height = alto
        c.getContext('2d')?.drawImage(bmp, 0, 0, ancho, alto)
        return new Promise<Blob | null>((ok) => c.toBlob(ok, mime, calidad))
      },
      cerrar: () => bmp.close(),
    }
  },
}
