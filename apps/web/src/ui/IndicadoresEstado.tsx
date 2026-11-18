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
      className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-200 bg-stone-50 px-3 py-1 text-sm text-stone-700"
    >
      <span role="status" className={enLinea ? 'text-emerald-800' : 'font-medium text-amber-800'}>
        {enLinea ? 'En línea' : 'Sin conexión'}
      </span>
      <Link
        to="/pendientes"
        data-atencion={atencion}
        className={`inline-flex min-h-8 items-center underline ${atencion ? 'font-medium text-red-700' : 'text-stone-800'}`}
      >
        {etiquetaPendientes}
        {atencion && ` · ${conAtencion} ${conAtencion === 1 ? 'requiere' : 'requieren'} atención`}
      </Link>
      <span>{ultimoPull ? `Datos al ${formatFechaHora(ultimoPull)}` : 'Datos: sin datos'}</span>
    </section>
  )
}
