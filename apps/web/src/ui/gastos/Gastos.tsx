import { gastosRecientes, totalDelMes, useGastos } from '../../application/gastos/gastos'
import { formatFecha, hoyBogota } from '../../lib/formato'
import { Aviso } from '../componentes/Aviso'
import { BotonEnlace } from '../componentes/Boton'
import { Dinero } from '../componentes/Dinero'
import { EtiquetaEstado } from '../componentes/EtiquetaEstado'
import { FilaLista } from '../componentes/FilaLista'
import { Pagina } from '../componentes/Pagina'
import { Tarjeta } from '../componentes/Tarjeta'
import { usePendientesCtx } from '../pendientes/contexto'

/** Gastos recientes con el total del mes (RF-PAG-03). Lee Dexie: funciona sin conexión. */
export function Gastos() {
  const { db } = usePendientesCtx()
  const carga = useGastos(db)
  return (
    <Pagina titulo="Gastos" volverA="/mas">
      <BotonEnlace to="/gastos/nuevo">Nuevo gasto</BotonEnlace>
      {carga.fase === 'cargando' && <p role="status">Cargando…</p>}
      {carga.fase === 'error' && <Aviso tono="error">No se pudieron leer los gastos guardados en este teléfono.</Aviso>}
      {carga.fase === 'listo' && <Contenido gastos={carga.gastos} />}
    </Pagina>
  )
}

/** `17/11/2026`, o «Sin fecha» si la fila no trae una fecha válida (nunca debe tirar abajo la lista). */
function fechaLegible(valor: unknown): string {
  try {
    return formatFecha(String(valor ?? ''))
  } catch {
    return 'Sin fecha'
  }
}

function Contenido({ gastos }: { gastos: ReturnType<typeof gastosRecientes> }) {
  const recientes = gastosRecientes(gastos)
  if (recientes.length === 0) return <Aviso>Aún no hay gastos. Registra el primero con «Nuevo gasto».</Aviso>
  return (
    <>
      <Tarjeta>
        <section aria-label="Total de gastos del mes" className="flex flex-col">
          <span className="text-pequeno text-texto-secundario">Gastos de este mes en este teléfono</span>
          <Dinero valor={totalDelMes(gastos, hoyBogota())} className="text-cifra" />
        </section>
      </Tarjeta>
      <ul aria-label="Gastos recientes" className="rounded-tarjeta bg-superficie px-4">
        {recientes.map((g) => (
          <FilaLista key={g.id} className="py-2">
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">{String(g['categoria'] ?? '')}</span>
              {Boolean(g['concepto']) && <span className="truncate text-pequeno text-texto-secundario">{String(g['concepto'])}</span>}
              <span className="flex flex-wrap items-center gap-2 text-pequeno text-texto-secundario">
                {fechaLegible(g['fecha'])}
                {g._pendiente && <EtiquetaEstado tono="advertencia">⏳ Sin subir</EtiquetaEstado>}
              </span>
            </span>
            <Dinero valor={Number(g['valor'])} className="shrink-0 text-seccion" />
          </FilaLista>
        ))}
      </ul>
    </>
  )
}
