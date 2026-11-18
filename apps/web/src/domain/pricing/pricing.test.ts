import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
// Vectores compartidos con tests/db/precio_paridad.test.mjs (lado SQL de la paridad).
import vectores from '../../../../../tests/db/vectores/precio_para.json'
import { ErrorSinPrecio, precioPara, precioRequerido, type CatalogoPrecios, type PrecioLista } from './pricing'

interface Escenario {
  nombre: string
  listas: string[]
  clientes: Record<string, string | null>
  precios: { lista: string; articulo: string; precio: number; minima: number }[]
  consultas: { articulo: string; cliente: string | null; cantidad: number; esperado: number | null }[]
}

describe('[RN-PRE-01] paridad con precio_para (vectores compartidos con SQL)', () => {
  for (const esc of vectores.escenarios as Escenario[]) {
    it(esc.nombre, () => {
      const catalogo: CatalogoPrecios = {
        listaPublicaId: 'publica',
        precios: esc.precios.map((p) => ({ listaId: p.lista, articuloId: p.articulo, precio: p.precio, cantidadMinima: p.minima })),
      }
      for (const c of esc.consultas) {
        // cliente null o desconocido => sin lista propia (cae a la pública), igual que en SQL
        const lista = c.cliente === null ? null : (esc.clientes[c.cliente] ?? null)
        expect(precioPara(catalogo, c.articulo, lista, c.cantidad), JSON.stringify(c)).toBe(c.esperado)
      }
    })
  }
})

// Modelo independiente (ordena y recorre) para contrastar la implementación con datos aleatorios.
function modelo(precios: PrecioLista[], lista: string, articulo: string, cantidad: number): number | null {
  const candidatos = precios
    .filter((p) => p.listaId === lista && p.articuloId === articulo && p.cantidadMinima <= cantidad)
    .sort((a, b) => b.cantidadMinima - a.cantidadMinima)
  return candidatos[0]?.precio ?? null
}

const idLista = fc.constantFrom('publica', 'l1', 'l2')
const idArticulo = fc.constantFrom('a1', 'a2', 'a3')
// Una fila por (lista, artículo, mínima), como la restricción unique de la tabla; COP enteros.
const filas = fc
  .uniqueArray(
    fc.record({
      listaId: idLista,
      articuloId: idArticulo,
      precio: fc.integer({ min: 0, max: 500_000 }),
      cantidadMinima: fc.integer({ min: 1, max: 40 }).map((n) => n / 2), // 0,5 a 20 en saltos de 0,5
    }),
    { selector: (p) => `${p.listaId}|${p.articuloId}|${p.cantidadMinima}`, maxLength: 40 },
  )
const cantidad = fc.integer({ min: 0, max: 60 }).map((n) => n / 2)

describe('[RN-PRE-01] propiedades de domain/pricing', () => {
  it('coincide con el modelo: lista del cliente y, si no aplica, la pública', () => {
    fc.assert(
      fc.property(filas, idArticulo, fc.option(idLista, { nil: null }), cantidad, (precios, art, lista, cant) => {
        const propio = lista ? modelo(precios, lista, art, cant) : null
        const final = propio ?? modelo(precios, 'publica', art, cant)
        expect(precioPara({ listaPublicaId: 'publica', precios }, art, lista, cant)).toBe(final)
      }),
    )
  })

  it('un escalón mayor nunca se ignora: la cantidad igual al mínimo ya lo activa', () => {
    fc.assert(
      fc.property(filas, (precios) => {
        for (const p of precios) {
          const r = precioPara({ listaPublicaId: 'publica', precios }, p.articuloId, p.listaId, p.cantidadMinima)
          expect(r).not.toBeNull()
        }
      }),
    )
  })

  it('sin precios nunca inventa uno', () => {
    fc.assert(
      fc.property(idArticulo, fc.option(idLista, { nil: null }), cantidad, (art, lista, cant) => {
        expect(precioPara({ listaPublicaId: 'publica', precios: [] }, art, lista, cant)).toBeNull()
      }),
    )
  })

  it('devuelve siempre un entero COP si los precios son enteros', () => {
    fc.assert(
      fc.property(filas, idArticulo, fc.option(idLista, { nil: null }), cantidad, (precios, art, lista, cant) => {
        const r = precioPara({ listaPublicaId: 'publica', precios }, art, lista, cant)
        if (r !== null) expect(Number.isInteger(r)).toBe(true)
      }),
    )
  })
})

describe('[RN-PRE-01] precioRequerido (artículo sin precio)', () => {
  const catalogo: CatalogoPrecios = { listaPublicaId: 'publica', precios: [] }
  it('lanza ErrorSinPrecio, como E_PRECIO del servidor', () => {
    expect(() => precioRequerido(catalogo, 'a1', null, 1)).toThrow(ErrorSinPrecio)
  })
  it('devuelve el precio cuando existe', () => {
    const c: CatalogoPrecios = { listaPublicaId: 'publica', precios: [{ listaId: 'publica', articuloId: 'a1', precio: 9000, cantidadMinima: 1 }] }
    expect(precioRequerido(c, 'a1', null, 1)).toBe(9000)
  })
})
