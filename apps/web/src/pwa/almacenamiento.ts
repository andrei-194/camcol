export type EstadoAlmacenamiento = 'persistente' | 'no-persistente' | 'no-soportado'

/** Pide almacenamiento persistente al navegador (RF-OPS-02). Nunca lanza. */
export async function solicitarAlmacenamientoPersistente(): Promise<EstadoAlmacenamiento> {
  const almacenamiento = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!almacenamiento?.persist) return 'no-soportado'
  try {
    if (await almacenamiento.persisted?.()) return 'persistente'
    return (await almacenamiento.persist()) ? 'persistente' : 'no-persistente'
  } catch {
    return 'no-persistente'
  }
}

/** Estado actual, sin pedir nada (para mostrarlo en Ajustes). */
export async function estadoAlmacenamiento(): Promise<EstadoAlmacenamiento> {
  const almacenamiento = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!almacenamiento?.persisted) return 'no-soportado'
  try {
    return (await almacenamiento.persisted()) ? 'persistente' : 'no-persistente'
  } catch {
    return 'no-persistente'
  }
}

/** Pide la persistencia al primer uso y de nuevo al instalar la app. */
export function iniciarPersistenciaAlmacenamiento(): void {
  void solicitarAlmacenamientoPersistente()
  window.addEventListener('appinstalled', () => void solicitarAlmacenamientoPersistente())
}

/** ¿La app corre instalada (pantalla de inicio) y no en una pestaña? */
export function estaInstalada(): boolean {
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios || window.matchMedia?.('(display-mode: standalone)').matches === true
}
