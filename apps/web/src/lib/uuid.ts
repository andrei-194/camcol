// UUID v7 (RFC 9562): 48 bits de milisegundos Unix + versión 7 + 12 bits de contador + variante + 62 bits al azar.
// Los ids se crean en el dispositivo (también sin señal), así que deben ser únicos sin coordinar y ordenables
// por creación (índices más compactos, listas "las más recientes primero"). El orden de eventos entre
// dispositivos lo decide el servidor, no este reloj (RF-SYN-11).

function aleatorios(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

/**
 * Crea un generador de UUID v7 monótono: dentro del mismo milisegundo, o si el reloj retrocede, el contador
 * sigue creciendo y el orden de los ids nunca se rompe. `reloj` solo se inyecta en pruebas.
 */
export function crearGeneradorUuidV7(reloj: () => number = Date.now): () => string {
  let ultimoMs = 0
  let contador = 0

  return () => {
    const ahora = reloj()
    if (ahora > ultimoMs) {
      ultimoMs = ahora
      contador = ((aleatorios(1)[0] ?? 0) << 3) & 0x7ff // arranca en la mitad baja: deja margen para crecer
    } else {
      contador++
      if (contador > 0xfff) {
        ultimoMs++
        contador = 0
      }
    }

    const b = new Uint8Array(16)
    b.set(aleatorios(8), 8)
    // 48 bits de tiempo; sin operadores de bits porque superan 32 bits.
    let t = ultimoMs
    for (let i = 5; i >= 0; i--) {
      b[i] = t % 256
      t = Math.floor(t / 256)
    }
    b[6] = 0x70 | (contador >> 8) // versión 7 + 4 bits altos del contador
    b[7] = contador & 0xff
    b[8] = ((b[8] ?? 0) & 0x3f) | 0x80 // variante 10

    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
}

/** Genera un UUID v7 con el reloj del dispositivo. */
export const uuidV7: () => string = crearGeneradorUuidV7()

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function esUuid(valor: string): boolean {
  return RE_UUID.test(valor)
}
