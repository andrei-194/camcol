import { useState, type FormEvent } from 'react'
import { useCatalogo, useCatalogoCtx, useEnLinea, type DatosCatalogo } from '../../application/catalogo/contexto'
import { Aviso } from '../componentes/Aviso'
import { Boton } from '../componentes/Boton'
import { CampoTexto } from '../componentes/CampoTexto'
import { EtiquetaEstado } from '../componentes/EtiquetaEstado'
import { Pagina } from '../componentes/Pagina'
import { Tarjeta } from '../componentes/Tarjeta'
import { AVISO_SIN_RED, CampoSelect, texto } from './campos'
import { SelectorListaPrecio } from './SelectorListaPrecio'

/** `/catalogo/listas`: lista pública y adicionales (RF-CAT-02) y asignación de lista a un cliente (RF-CAT-03). */
export function ListasPrecio() {
  const carga = useCatalogo()
  return (
    <Pagina titulo="Listas de precio" volverA="/catalogo">
      {carga.fase === 'cargando' && <p role="status">Cargando…</p>}
      {carga.fase === 'error' && <Aviso tono="error">No se pudo leer el catálogo guardado en el teléfono.</Aviso>}
      {carga.fase === 'listo' && <Contenido datos={carga.datos} />}
    </Pagina>
  )
}

function Contenido({ datos }: { datos: DatosCatalogo }) {
  const { api, refrescar } = useCatalogoCtx()
  const enLinea = useEnLinea()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cliente, setCliente] = useState('')
  const clienteFila = datos.clientes.find((c) => c.id === cliente)
  const cuantos = (listaId: string) => datos.precios.filter((p) => p.lista_id === listaId).length

  async function crear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) return setError('Escribe el nombre de la lista.')
    if (datos.listas.some((l) => texto(l, 'nombre').toLowerCase() === nombre.trim().toLowerCase())) {
      return setError('Ya existe una lista con ese nombre.')
    }
    if (!enLinea) return
    const r = await api.crearLista(nombre.trim())
    if (!r.ok) return setError(r.mensaje)
    setNombre('')
    void refrescar()
  }

  return (
    <>
      {!enLinea && <Aviso tono="advertencia">{AVISO_SIN_RED}</Aviso>}
      <ul className="flex flex-col gap-2">
        {datos.listas.map((l) => (
          <li key={l.id}>
            <Tarjeta className="flex items-center justify-between gap-2">
              <span className="flex flex-col">
                <span className="font-semibold">{texto(l, 'nombre')}</span>
                <span className="text-pequeno text-texto-secundario">{cuantos(l.id)} precios</span>
              </span>
              {l.es_publica === true && <EtiquetaEstado tono="acento">Pública</EtiquetaEstado>}
            </Tarjeta>
          </li>
        ))}
      </ul>
      <form onSubmit={crear} noValidate className="flex flex-col gap-4">
        <CampoTexto etiqueta="Nombre de la lista" value={nombre} onChange={(e) => setNombre(e.target.value)} error={error ?? undefined} ayuda="Una lista adicional, por ejemplo «Cafeterías». Los precios se ponen en cada artículo." />
        <Boton type="submit" variante="secundario" disabled={!enLinea}>
          Crear lista
        </Boton>
      </form>
      <section aria-labelledby="asignar" className="flex flex-col gap-3">
        <h2 id="asignar" className="font-titulo text-seccion font-semibold">
          Lista de un cliente
        </h2>
        {datos.clientes.length === 0 && <p className="text-texto-secundario">Todavía no hay clientes.</p>}
        {datos.clientes.length > 0 && (
          <CampoSelect etiqueta="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Elige un cliente</option>
            {datos.clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {texto(c, 'nombre')}
              </option>
            ))}
          </CampoSelect>
        )}
        {clienteFila && (
          <SelectorListaPrecio key={clienteFila.id} terceroId={clienteFila.id} valor={(clienteFila.lista_precio_id as string | null) ?? null} />
        )}
      </section>
    </>
  )
}
