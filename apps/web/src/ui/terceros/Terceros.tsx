import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { filtrarTerceros, useTerceros, type FiltroRol } from '../../application/terceros/terceros'
import { Aviso } from '../componentes/Aviso'
import { Boton, BotonEnlace } from '../componentes/Boton'
import { CampoTexto } from '../componentes/CampoTexto'
import { EtiquetaEstado } from '../componentes/EtiquetaEstado'
import { Pagina } from '../componentes/Pagina'
import { usePendientesCtx } from '../pendientes/contexto'

const FILTROS: Array<{ valor: FiltroRol; texto: string }> = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'cliente', texto: 'Clientes' },
  { valor: 'proveedor', texto: 'Proveedores' },
]

/** Lista de terceros con búsqueda local instantánea (RF-TER-02): lee Dexie, no necesita red. */
export function Terceros() {
  const { db } = usePendientesCtx()
  const carga = useTerceros(db)
  const [texto, setTexto] = useState('')
  const [rol, setRol] = useState<FiltroRol>('todos')
  const visibles = useMemo(() => (carga.fase === 'listo' ? filtrarTerceros(carga.terceros, texto, rol) : []), [carga, texto, rol])

  return (
    <Pagina titulo="Terceros" volverA="/">
      <BotonEnlace to="/terceros/nuevo">Nuevo tercero</BotonEnlace>
      <CampoTexto
        etiqueta="Buscar"
        type="search"
        placeholder="Nombre, teléfono o documento"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoComplete="off"
      />
      <div role="group" aria-label="Filtrar por rol" className="flex gap-2">
        {FILTROS.map((f) => (
          <Boton
            key={f.valor}
            variante={rol === f.valor ? 'primario' : 'secundario'}
            aria-pressed={rol === f.valor}
            className="flex-1 px-2"
            onClick={() => setRol(f.valor)}
          >
            {f.texto}
          </Boton>
        ))}
      </div>
      {carga.fase === 'cargando' && <p role="status">Cargando…</p>}
      {carga.fase === 'error' && <Aviso tono="error">No se pudieron leer los terceros de este teléfono.</Aviso>}
      {carga.fase === 'listo' && carga.terceros.length === 0 && (
        <Aviso>Aún no hay terceros. Crea el primero con «Nuevo tercero».</Aviso>
      )}
      {carga.fase === 'listo' && carga.terceros.length > 0 && visibles.length === 0 && <Aviso>Sin resultados para esa búsqueda.</Aviso>}
      {visibles.length > 0 && (
        <ul className="flex flex-col divide-y divide-borde rounded-tarjeta border border-borde">
          {visibles.map((t) => (
            <li key={t.id}>
              <Link to={`/terceros/${t.id}`} className="flex min-h-14 flex-col justify-center gap-0.5 px-4 py-2 text-texto">
                <span className="font-medium">{String(t['nombre'] ?? '')}</span>
                <span className="flex flex-wrap items-center gap-2 text-pequeno text-texto-secundario">
                  {(t.roles ?? []).map((r) => (r === 'cliente' ? 'Cliente' : 'Proveedor')).join(' · ')}
                  {t['telefono'] ? ` · ${String(t['telefono'])}` : ''}
                  {t._pendiente && <EtiquetaEstado tono="advertencia">⏳ Sin subir</EtiquetaEstado>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  )
}
