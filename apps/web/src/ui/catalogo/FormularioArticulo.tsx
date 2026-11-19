import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCatalogo, useCatalogoCtx, useEnLinea, type DatosCatalogo } from '../../application/catalogo/contexto'
import type { ResultadoEscritura } from '../../application/catalogo/catalogoApi'
import { formatCOP, formatCantidad } from '../../lib/formato'
import { Aviso } from '../componentes/Aviso'
import { Boton } from '../componentes/Boton'
import { CampoTexto } from '../componentes/CampoTexto'
import { Pagina } from '../componentes/Pagina'
import { Tarjeta } from '../componentes/Tarjeta'
import { AVISO_SIN_RED, CampoCasilla, CampoSelect, leerPesos, numero, texto } from './campos'

const NUEVO_PRODUCTO = '__nuevo'

/** `/catalogo/articulos/nuevo` y `/catalogo/articulos/:id`: datos del artículo y, al editar, sus precios. Solo con conexión. */
export function FormularioArticulo() {
  const { id } = useParams()
  const carga = useCatalogo()
  const editando = id !== undefined
  const titulo = editando ? 'Editar artículo' : 'Nuevo artículo'
  if (carga.fase === 'cargando') return <Pagina titulo={titulo} volverA="/catalogo"><p role="status">Cargando…</p></Pagina>
  if (carga.fase === 'error') {
    return <Pagina titulo={titulo} volverA="/catalogo"><Aviso tono="error">No se pudo leer el catálogo guardado en el teléfono.</Aviso></Pagina>
  }
  const articulo = editando ? carga.datos.articulos.find((a) => a.id === id) : undefined
  if (editando && !articulo) {
    return <Pagina titulo={titulo} volverA="/catalogo"><Aviso tono="advertencia">No se encontró ese artículo.</Aviso></Pagina>
  }
  return (
    <Pagina titulo={titulo} volverA="/catalogo">
      <Formulario key={id ?? 'nuevo'} datos={carga.datos} articuloId={articulo?.id ?? null} />
    </Pagina>
  )
}

function Formulario({ datos, articuloId }: { datos: DatosCatalogo; articuloId: string | null }) {
  const { api, refrescar } = useCatalogoCtx()
  const enLinea = useEnLinea()
  const navegar = useNavigate()
  const a = articuloId ? datos.articulos.find((x) => x.id === articuloId) : undefined
  const unidadInicial = datos.unidades.some((u) => u.codigo === 'und') ? 'und' : (datos.unidades[0]?.codigo ?? '')

  const [producto, setProducto] = useState(a ? texto(a, 'producto_id') : '')
  const [productoNuevo, setProductoNuevo] = useState('')
  const [nombre, setNombre] = useState(a ? texto(a, 'nombre') : '')
  const [codigo, setCodigo] = useState(a ? texto(a, 'codigo') : '')
  const [cantidad, setCantidad] = useState(a ? String(numero(a, 'presentacion_cantidad')) : '')
  const [unidad, setUnidad] = useState(a ? texto(a, 'presentacion_unidad') : unidadInicial)
  const [lote, setLote] = useState(a ? !!a.controla_lote : false)
  const [vencimiento, setVencimiento] = useState(a ? !!a.controla_vencimiento : false)
  const [sinStock, setSinStock] = useState(a ? a.permite_sin_stock !== false : true)
  const [activo, setActivo] = useState(a ? a.activo !== false : true)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<{ tono: 'info' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const falla = (r: Extract<ResultadoEscritura, { ok: false }>) => setResultado({ tono: 'error', texto: r.mensaje })

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setResultado(null)
    const cant = Number(cantidad.replace(',', '.'))
    const err: Record<string, string> = {}
    if (!producto) err.producto = 'Elige el producto.'
    if (producto === NUEVO_PRODUCTO && !productoNuevo.trim()) err.productoNuevo = 'Escribe el nombre del producto.'
    if (!nombre.trim()) err.nombre = 'Escribe el nombre del artículo.'
    if (!(cant > 0)) err.cantidad = 'La cantidad debe ser mayor que cero.'
    if (!unidad) err.unidad = 'Elige la unidad.'
    setErrores(err)
    if (Object.keys(err).length > 0 || !enLinea) return

    setGuardando(true)
    try {
      let productoId = producto
      if (producto === NUEVO_PRODUCTO) {
        const p = await api.crearProducto(productoNuevo.trim())
        if (!p.ok) return falla(p)
        productoId = p.id ?? ''
      }
      const r = await api.guardarArticulo(articuloId, {
        producto_id: productoId,
        nombre: nombre.trim(),
        codigo: codigo.trim() || null,
        presentacion_cantidad: cant,
        presentacion_unidad: unidad,
        controla_lote: lote,
        controla_vencimiento: vencimiento,
        permite_sin_stock: sinStock,
        activo,
      })
      if (!r.ok) return falla(r)
      void refrescar()
      if (!articuloId) navegar(r.id ? `/catalogo/articulos/${r.id}` : '/catalogo')
      else setResultado({ tono: 'info', texto: 'Artículo guardado.' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      {!enLinea && <Aviso tono="advertencia">{AVISO_SIN_RED}</Aviso>}
      <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
        <CampoSelect etiqueta="Producto" value={producto} onChange={(e) => setProducto(e.target.value)} error={errores.producto}>
          <option value="">Elige un producto</option>
          {datos.productos.map((p) => (
            <option key={p.id} value={p.id}>
              {texto(p, 'nombre')}
            </option>
          ))}
          <option value={NUEVO_PRODUCTO}>Producto nuevo…</option>
        </CampoSelect>
        {producto === NUEVO_PRODUCTO && (
          <CampoTexto etiqueta="Nombre del producto" value={productoNuevo} onChange={(e) => setProductoNuevo(e.target.value)} error={errores.productoNuevo} />
        )}
        <CampoTexto etiqueta="Nombre del artículo" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} ayuda="Como lo ve el cliente, con la presentación: «Café Villa Luz 250 g»." />
        <CampoTexto etiqueta="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} ayuda="Opcional. Debe ser único." />
        <CampoTexto etiqueta="Cantidad de la presentación" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} error={errores.cantidad} />
        <CampoSelect etiqueta="Unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} error={errores.unidad}>
          {datos.unidades.map((u) => (
            <option key={u.codigo} value={u.codigo}>
              {u.codigo}
            </option>
          ))}
        </CampoSelect>
        <fieldset className="flex flex-col">
          <legend className="font-medium">Opciones</legend>
          <CampoCasilla etiqueta="Controla lote" checked={lote} onChange={(e) => setLote(e.target.checked)} />
          <CampoCasilla etiqueta="Controla vencimiento" checked={vencimiento} onChange={(e) => setVencimiento(e.target.checked)} />
          <CampoCasilla etiqueta="Permite vender sin stock" checked={sinStock} onChange={(e) => setSinStock(e.target.checked)} />
          <CampoCasilla etiqueta="Activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        </fieldset>
        {resultado && <Aviso tono={resultado.tono}>{resultado.texto}</Aviso>}
        <Boton type="submit" disabled={!enLinea || guardando}>
          Guardar artículo
        </Boton>
      </form>
      {articuloId && <Precios datos={datos} articuloId={articuloId} unidad={a ? texto(a, 'unidad_inventario') || 'und' : 'und'} />}
    </>
  )
}

function Precios({ datos, articuloId, unidad }: { datos: DatosCatalogo; articuloId: string; unidad: string }) {
  const { api, db, refrescar } = useCatalogoCtx()
  const enLinea = useEnLinea()
  const publica = datos.listas.find((l) => l.es_publica)
  const [lista, setLista] = useState(publica?.id ?? datos.listas[0]?.id ?? '')
  const [minima, setMinima] = useState('1')
  const [precio, setPrecio] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<string | null>(null)
  const nombreLista = (id: unknown) => texto(datos.listas.find((l) => l.id === id) ?? { id: '' }, 'nombre')

  const filas = datos.precios
    .filter((p) => p.articulo_id === articuloId)
    .sort((x, y) => nombreLista(x.lista_id).localeCompare(nombreLista(y.lista_id), 'es') || numero(x, 'cantidad_minima') - numero(y, 'cantidad_minima'))

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setResultado(null)
    const cant = Number(minima.replace(',', '.'))
    const valor = leerPesos(precio)
    const err: Record<string, string> = {}
    if (!lista) err.lista = 'Elige la lista.'
    if (!(cant > 0)) err.minima = 'La cantidad mínima debe ser mayor que cero.'
    if (valor === null) err.precio = 'Escribe el precio en pesos.'
    setErrores(err)
    if (Object.keys(err).length > 0 || valor === null || !enLinea) return
    const r = await api.guardarPrecio({ lista_id: lista, articulo_id: articuloId, cantidad_minima: cant, precio: valor })
    if (!r.ok) return setResultado(r.mensaje)
    setPrecio('')
    void refrescar()
  }

  async function quitar(id: string) {
    setResultado(null)
    const r = await api.eliminarPrecio(id)
    if (!r.ok) return setResultado(r.mensaje)
    await db.precios.delete(id) // el pull no entrega borrados: se quita también del caché local
    void refrescar()
  }

  return (
    <section aria-labelledby="precios" className="flex flex-col gap-3">
      <h2 id="precios" className="font-titulo text-seccion font-semibold">
        Precios
      </h2>
      {filas.length === 0 && <p className="text-texto-secundario">Este artículo todavía no tiene precio.</p>}
      <ul className="flex flex-col gap-2">
        {filas.map((p) => (
          <li key={p.id}>
            <Tarjeta className="flex items-center justify-between gap-2">
              <span>
                {nombreLista(p.lista_id)} · Desde {formatCantidad(numero(p, 'cantidad_minima'))} {unidad}: {formatCOP(numero(p, 'precio'))}
              </span>
              {numero(p, 'cantidad_minima') > 1 && (
                <Boton
                  variante="peligro"
                  disabled={!enLinea}
                  aria-label={`Quitar precio desde ${formatCantidad(numero(p, 'cantidad_minima'))} en ${nombreLista(p.lista_id)}`}
                  onClick={() => void quitar(p.id)}
                >
                  Quitar
                </Boton>
              )}
            </Tarjeta>
          </li>
        ))}
      </ul>
      <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
        <CampoSelect etiqueta="Lista" value={lista} onChange={(e) => setLista(e.target.value)} error={errores.lista}>
          {datos.listas.map((l) => (
            <option key={l.id} value={l.id}>
              {texto(l, 'nombre')}
            </option>
          ))}
        </CampoSelect>
        <CampoTexto etiqueta="Cantidad mínima" inputMode="decimal" value={minima} onChange={(e) => setMinima(e.target.value)} error={errores.minima} ayuda="1 es el precio normal; 2 o más es un escalón («Llévate 2»)." />
        <CampoTexto etiqueta="Precio (COP)" inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} error={errores.precio} ayuda="Precio por unidad, en pesos, sin decimales." />
        {resultado && <Aviso tono="error">{resultado}</Aviso>}
        <Boton type="submit" variante="secundario" disabled={!enLinea}>
          Guardar precio
        </Boton>
      </form>
    </section>
  )
}
