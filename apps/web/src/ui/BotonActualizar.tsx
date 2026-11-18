import { useSync } from '../application/sync/SyncProvider'

const MENSAJE_ERROR = {
  red: 'Sin conexión: se muestran los últimos datos guardados.',
  rechazo: 'No se pudo actualizar: el servidor rechazó la solicitud.',
  datos: 'No se pudo actualizar: los datos recibidos no se pudieron guardar.',
} as const

function fechaLegible(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })
}

/** Botón mínimo de refresco (RF-SYN-08). No se muestra si la app no tiene sincronización montada. */
export function BotonActualizar() {
  const sync = useSync()
  if (!sync) return null
  const { estado, actualizar } = sync
  return (
    <section aria-labelledby="datos" className="flex flex-col items-start gap-2">
      <h2 id="datos" className="text-lg font-semibold text-stone-900">
        Datos
      </h2>
      <button
        type="button"
        onClick={() => void actualizar()}
        disabled={estado.fase === 'actualizando'}
        className="min-h-11 rounded-lg bg-emerald-800 px-4 py-2 text-base font-medium text-white disabled:opacity-60"
      >
        Actualizar datos
      </button>
      <p role="status" className="text-base text-stone-700">
        {estado.fase === 'actualizando' && 'Actualizando…'}
        {estado.fase === 'ok' && (estado.ultima ? `Datos al ${fechaLegible(estado.ultima)}` : 'Datos al día')}
        {estado.fase === 'error' && MENSAJE_ERROR[estado.motivo]}
      </p>
    </section>
  )
}
