import { useSync } from '../application/sync/SyncProvider'
import { Boton } from './componentes/Boton'
import { Tarjeta } from './componentes/Tarjeta'

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
    <Tarjeta>
    <section aria-labelledby="datos" className="flex flex-col items-start gap-2">
      <h2 id="datos" className="font-titulo text-seccion font-semibold">
        Datos
      </h2>
      <Boton onClick={() => void actualizar()} disabled={estado.fase === 'actualizando'}>
        Actualizar datos
      </Boton>
      <p role="status" className={estado.fase === 'error' ? 'font-medium text-peligro' : 'text-texto-secundario'}>
        {estado.fase === 'actualizando' && 'Actualizando…'}
        {estado.fase === 'ok' && (estado.ultima ? `Datos al ${fechaLegible(estado.ultima)}` : 'Datos al día')}
        {estado.fase === 'error' && MENSAJE_ERROR[estado.motivo]}
      </p>
    </section>
    </Tarjeta>
  )
}
