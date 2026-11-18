import { Link } from 'react-router-dom'
import { useIndicadores } from '../application/sync/useIndicadores'
import { db as dbGlobal, type CaminoDB } from '../infra/db/db'
import { formatFechaHora } from '../lib/formato'

/** Barra siempre visible en pantallas con sesión (RNF-UX-02): conexión, pendientes y «datos al …». */
export function IndicadoresEstado({ db = dbGlobal }: { db?: CaminoDB }) {
  const { enLinea, pendientes, conAtencion, ultimoPull } = useIndicadores(db)
  const etiquetaPendientes =
    pendientes === 0 ? 'Sin pendientes' : `${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}`
  const atencion = conAtencion > 0
  return (
    <section
      aria-label="Estado de la app"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde bg-fondo px-3 py-1 text-pequeno text-texto-secundario"
    >
      <span
        role="status"
        className={`inline-flex items-center font-semibold before:mr-1.5 before:inline-block before:size-2 before:rounded-full before:bg-current before:content-[''] ${enLinea ? 'text-exito' : 'text-advertencia'}`}
      >
        {enLinea ? 'En línea' : 'Sin conexión'}
      </span>
      <Link
        to="/pendientes"
        data-atencion={atencion}
        className={`inline-flex min-h-8 items-center underline ${atencion ? 'font-semibold text-peligro' : 'text-texto'}`}
      >
        {etiquetaPendientes}
        {atencion && ` · ${conAtencion} ${conAtencion === 1 ? 'requiere' : 'requieren'} atención`}
      </Link>
      <span>{ultimoPull ? `Datos al ${formatFechaHora(ultimoPull)}` : 'Datos: sin datos'}</span>
    </section>
  )
}
