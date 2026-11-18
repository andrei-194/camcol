import { uuidV7 } from '../../lib/uuid'
import type { CaminoDB } from './db'

const CLAVE = 'device_id'

/**
 * Identificador estable de esta instalación (RF-SYN-11). Se crea una vez (UUID v7) y vive en `kv`, que
 * sobrevive a re-login y actualizaciones. Es una etiqueta de diagnóstico: el orden de los eventos lo
 * decide el servidor, no el reloj ni este id. La transacción de escritura evita que dos pestañas
 * abiertas a la vez creen dos ids.
 */
export function obtenerDeviceId(db: CaminoDB): Promise<string> {
  return db.transaction('rw', db.kv, async () => {
    const existente = await db.kv.get(CLAVE)
    if (typeof existente?.valor === 'string') return existente.valor
    const nuevo = uuidV7()
    await db.kv.put({ clave: CLAVE, valor: nuevo })
    return nuevo
  })
}
