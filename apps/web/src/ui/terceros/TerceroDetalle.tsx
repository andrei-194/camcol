import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Tercero } from '../../infra/db/db'
import { Aviso } from '../componentes/Aviso'
import { EtiquetaEstado } from '../componentes/EtiquetaEstado'
import { Pagina } from '../componentes/Pagina'
import { Tarjeta } from '../componentes/Tarjeta'
import { usePendientesCtx } from '../pendientes/contexto'

const CAMPOS: Array<[string, string]> = [
  ['telefono', 'Teléfono'],
  ['numero_documento', 'Documento'],
  ['municipio', 'Municipio'],
  ['vereda', 'Vereda'],
  ['direccion', 'Dirección'],
  ['productos_ofrecidos', 'Productos que ofrece'],
  ['notas', 'Notas'],
]

/** Detalle de solo lectura. Editar y borrar son T-M3-03 (solo online). */
export function TerceroDetalle() {
  const { id = '' } = useParams()
  const { db } = usePendientesCtx()
  const [estado, setEstado] = useState<{ fase: 'cargando' } | { fase: 'error' } | { fase: 'listo'; t: Tercero | undefined }>({ fase: 'cargando' })
  useEffect(() => {
    let vigente = true
    db.terceros
      .get(id)
      .then((t) => vigente && setEstado({ fase: 'listo', t }))
      .catch(() => vigente && setEstado({ fase: 'error' }))
    return () => {
      vigente = false
    }
  }, [db, id])

  if (estado.fase !== 'listo' || !estado.t) {
    return (
      <Pagina titulo="Tercero" volverA="/terceros">
        {estado.fase === 'cargando' && <p role="status">Cargando…</p>}
        {estado.fase === 'error' && <Aviso tono="error">No se pudo leer el tercero.</Aviso>}
        {estado.fase === 'listo' && <Aviso>No se encontró este tercero en el teléfono.</Aviso>}
      </Pagina>
    )
  }
  const t = estado.t
  const lat = t['latitud']
  const lng = t['longitud']
  return (
    <Pagina titulo={String(t['nombre'] ?? '')} volverA="/terceros">
      <div className="flex flex-wrap gap-2">
        {(t.roles ?? []).map((r) => (
          <EtiquetaEstado key={r} tono="acento">
            {r === 'cliente' ? 'Cliente' : 'Proveedor'}
          </EtiquetaEstado>
        ))}
        {t._pendiente && <EtiquetaEstado tono="advertencia">⏳ Sin subir</EtiquetaEstado>}
      </div>
      <Tarjeta>
        <dl className="flex flex-col gap-3">
          {CAMPOS.filter(([k]) => t[k]).map(([k, etiqueta]) => (
            <div key={k}>
              <dt className="text-pequeno text-texto-secundario">{etiqueta}</dt>
              <dd className="break-words text-texto">{String(t[k])}</dd>
            </div>
          ))}
          {lat != null && lng != null && (
            <div>
              <dt className="text-pequeno text-texto-secundario">Ubicación</dt>
              <dd className="text-texto">
                {String(lat)}, {String(lng)}
              </dd>
            </div>
          )}
        </dl>
      </Tarjeta>
    </Pagina>
  )
}
