import { useCatalogo, type DatosCatalogo } from '../../application/catalogo/contexto'
import { formatCOP, formatCantidad } from '../../lib/formato'
import { precioPara, type CatalogoPrecios } from '../../domain/pricing/pricing'
import { Aviso } from '../componentes/Aviso'
import { BotonEnlace } from '../componentes/Boton'
import { EtiquetaEstado } from '../componentes/EtiquetaEstado'
import { Pagina } from '../componentes/Pagina'
import { Tarjeta } from '../componentes/Tarjeta'
import { numero, texto } from './campos'
import { Link } from 'react-router-dom'

/** `/catalogo`: productos y artículos con su precio público. Lee de Dexie: funciona sin red (RF-CAT-04). */
export function Catalogo() {
  const carga = useCatalogo()
  return (
    <Pagina titulo="Catálogo" volverA="/">
      {carga.fase === 'cargando' && <p role="status">Cargando catálogo…</p>}
      {carga.fase === 'error' && <Aviso tono="error">No se pudo leer el catálogo guardado en el teléfono.</Aviso>}
      {carga.fase === 'listo' && <Contenido datos={carga.datos} />}
    </Pagina>
  )
}

function Contenido({ datos }: { datos: DatosCatalogo }) {
  const publica = datos.listas.find((l) => l.es_publica)
  const catalogoPrecios: CatalogoPrecios = {
    listaPublicaId: publica?.id ?? '',
    precios: datos.precios.map((p) => ({
      listaId: texto(p, 'lista_id'),
      articuloId: texto(p, 'articulo_id'),
      precio: numero(p, 'precio'),
      cantidadMinima: numero(p, 'cantidad_minima'),
    })),
  }
  const escalones = (articuloId: string) =>
    catalogoPrecios.precios
      .filter((p) => p.listaId === catalogoPrecios.listaPublicaId && p.articuloId === articuloId && p.cantidadMinima > 1)
      .sort((a, b) => a.cantidadMinima - b.cantidadMinima)

  return (
    <>
      <div className="flex flex-col gap-3">
        <BotonEnlace to="/catalogo/articulos/nuevo">Nuevo artículo</BotonEnlace>
        <BotonEnlace to="/catalogo/listas" variante="secundario">
          Listas de precio
        </BotonEnlace>
      </div>
      {datos.productos.length === 0 && (
        <Aviso>Todavía no hay productos. Crea el primer artículo o espera a que termine la primera sincronización.</Aviso>
      )}
      {datos.productos.map((prod) => {
        const articulos = datos.articulos.filter((a) => a.producto_id === prod.id)
        return (
          <section key={prod.id} aria-labelledby={`prod-${prod.id}`} className="flex flex-col gap-2">
            <h2 id={`prod-${prod.id}`} className="font-titulo text-seccion font-semibold">
              {texto(prod, 'nombre')}
            </h2>
            {articulos.length === 0 && <p className="text-texto-secundario">Sin artículos.</p>}
            {articulos.map((a) => {
              const base = precioPara(catalogoPrecios, a.id, null, 1)
              return (
                <Tarjeta key={a.id}>
                  <Link to={`/catalogo/articulos/${a.id}`} className="flex min-h-12 flex-col justify-center gap-1">
                    <span className="font-semibold">{texto(a, 'nombre')}</span>
                    <span className="text-pequeno text-texto-secundario">
                      {texto(a, 'codigo') && `${texto(a, 'codigo')} · `}
                      {formatCantidad(numero(a, 'presentacion_cantidad'))} {texto(a, 'presentacion_unidad')}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {base === null ? <EtiquetaEstado tono="advertencia">Sin precio</EtiquetaEstado> : <span className="text-seccion font-semibold">{formatCOP(base)}</span>}
                      {a.activo === false && <EtiquetaEstado>Inactivo</EtiquetaEstado>}
                    </span>
                    {escalones(a.id).map((e) => (
                      <span key={e.cantidadMinima} className="text-pequeno text-texto-secundario">
                        Desde {formatCantidad(e.cantidadMinima)} {texto(a, 'unidad_inventario') || 'und'}: {formatCOP(e.precio)} c/u
                      </span>
                    ))}
                  </Link>
                </Tarjeta>
              )
            })}
          </section>
        )
      })}
    </>
  )
}
