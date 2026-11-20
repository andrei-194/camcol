// Nueva compra (T-M5-01, CAM-61): validación del formulario, total y armado de la op `orden_compra.registrar`
// (PLAN §4.3, 0008_op_compra.sql). RF-COM-01 a 05, RN-COM-01/02. El servidor revalida todo (regla 3).
import { describe, expect, it } from 'vitest'
import { TIPOS_OP } from '../../infra/sync/tiposOp'
import {
  CANTIDAD_MAXIMA,
  MEDIOS_PAGO,
  PROVEEDOR_NUEVO,
  armarDatos,
  filasLocales,
  formVacio,
  leyendaCantidad,
  lineaVacia,
  parseCantidad,
  totalCompra,
  validarForm,
  type FormCompra,
} from './compras'

const HOY = '2026-11-20'
const articulos = {
  cafe: { controla_vencimiento: false },
  crema: { controla_vencimiento: true },
}
const ids = (() => {
  let n = 0
  return () => `id-${++n}`
})()

const linea = (extra: Partial<FormCompra['lineas'][number]> = {}) => ({ ...lineaVacia(), articuloId: 'cafe', cantidad: '20', costo: '30.000', ...extra })
const base = (extra: Partial<FormCompra> = {}): FormCompra => ({ ...formVacio(), proveedorId: 'p1', lineas: [linea()], ...extra })

describe('[RF-COM-01] parseCantidad: cantidades con hasta tres decimales', () => {
  it.each([
    ['20', 20],
    ['2,5', 2.5],
    ['2.5', 2.5],
    ['0,250', 0.25],
    ['1.500', 1500],
    ['2.500,5', 2500.5],
    ['0.500', 0.5],
    ['0.250', 0.25],
    ['0.5', 0.5],
    ['1.000', 1000],
    ['1.500,5', 1500.5],
    [' 12 ', 12],
  ])('«%s» es %d', (texto, esperado) => expect(parseCantidad(texto)).toBe(esperado))

  it.each(['', 'abc', '0', '-3', '2,5,1', '1,2345', '1e3', '0,000', '1.50.000'])('«%s» no es una cantidad válida', (texto) => expect(parseCantidad(texto)).toBeNull())
})

describe('[RF-COM-01] leyendaCantidad: cómo se interpretó lo escrito, con su unidad', () => {
  it('dice la cantidad con formato es-CO y la unidad', () => {
    expect(leyendaCantidad('1.500', 'und')).toBe('Se registrará: 1.500 und')
    expect(leyendaCantidad('0,5', 'kg')).toBe('Se registrará: 0,5 kg')
    expect(leyendaCantidad('0.500', 'lb')).toBe('Se registrará: 0,5 lb')
    expect(leyendaCantidad('20', 'und')).toBe('Se registrará: 20 und')
  })

  it('sin unidad conocida dice solo la cantidad; con texto vacío o inválido no dice nada', () => {
    expect(leyendaCantidad('20', undefined)).toBe('Se registrará: 20')
    expect(leyendaCantidad('', 'und')).toBe('')
    expect(leyendaCantidad('abc', 'und')).toBe('')
  })
})

describe('[RF-COM-01] totalCompra', () => {
  it('suma cantidad × costo de cada línea, con los pesos al centavo', () => {
    expect(totalCompra([linea({ cantidad: '20', costo: '30.000' }), linea({ cantidad: '2,5', costo: '10.000' })])).toBe(625000)
    expect(totalCompra([linea({ cantidad: '0,333', costo: '1.000' })])).toBe(333)
  })

  it('[paridad con el servidor] redondea cada línea al centavo y luego suma, como oc_recalcular', () => {
    expect(totalCompra([linea({ cantidad: '1,005', costo: '1' })])).toBe(1.01) // 1.005 × 1 en coma flotante daría 1.00
    // 0,125 × 12.345 = 1543,125 por línea: el servidor redondea a 1543,13 en cada una y suma 3086,26
    expect(totalCompra([linea({ cantidad: '0,125', costo: '12.345' }), linea({ articuloId: 'crema', cantidad: '0,125', costo: '12.345' })])).toBe(3086.26)
  })

  it('el resultado es un número de centavos exacto, sin restos de coma flotante', () => {
    const t = totalCompra([linea({ cantidad: '0,333', costo: '3.337' }), linea({ cantidad: '1,111', costo: '7.777' })])
    expect(Math.round(t * 100) / 100).toBe(t)
    expect(Number.isInteger(Math.round(t * 100))).toBe(true)
  })

  it('ignora las líneas con cantidad o costo inválidos y no devuelve NaN', () => {
    expect(totalCompra([linea({ cantidad: 'x' }), linea({ costo: '' })])).toBe(0)
    expect(totalCompra([])).toBe(0)
  })
})

describe('[RF-COM-02] formulario nuevo', () => {
  it('arranca como compra inmediata, con una línea vacía y pago en efectivo; la fecha de la compra es el instante de guardar', () => {
    const f = formVacio()
    expect(f).toMatchObject({ modalidad: 'inmediata', proveedorId: '', medioPago: 'efectivo', fechaEsperada: '' })
    expect(f).not.toHaveProperty('fecha')
    expect(f.lineas).toHaveLength(1)
    expect(f.lineas[0]).toEqual(lineaVacia())
  })

  it('ofrece los medios de pago de la spec', () => {
    expect(MEDIOS_PAGO.map((m) => m.valor)).toEqual(['efectivo', 'nequi', 'daviplata', 'transferencia'])
  })
})

describe('[RF-COM-01][RN-COM-02] validarForm', () => {
  it('una compra completa no tiene errores', () => expect(validarForm(base(), articulos, HOY)).toEqual({}))

  it('exige proveedor existente o nuevo', () => {
    expect(validarForm(base({ proveedorId: '' }), articulos, HOY).proveedor).toBe('Elige el proveedor o crea uno nuevo.')
  })

  it('con proveedor nuevo exige el nombre y valida el teléfono si se escribe', () => {
    const nuevo = (n: string, t: string) => base({ proveedorId: PROVEEDOR_NUEVO, proveedorNuevo: { nombre: n, telefono: t } })
    expect(validarForm(nuevo('', ''), articulos, HOY).proveedorNombre).toBe('Escribe el nombre del proveedor.')
    expect(validarForm(nuevo('Don Hernán', ''), articulos, HOY)).toEqual({})
    expect(validarForm(nuevo('Don Hernán', 'abc'), articulos, HOY).proveedorTelefono).toBe('Escribe un teléfono válido (de 7 a 15 dígitos) o déjalo vacío.')
    expect(validarForm(nuevo('Don Hernán', '300 123 4567'), articulos, HOY)).toEqual({})
  })

  it('exige al menos una línea y no deja líneas a medias', () => {
    expect(validarForm(base({ lineas: [] }), articulos, HOY).lineas).toBe('Agrega al menos un artículo.')
    const e = validarForm(base({ lineas: [lineaVacia()] }), articulos, HOY)
    expect(e.detalle?.[0]).toEqual({ articulo: 'Elige el artículo.', cantidad: 'Escribe la cantidad.', costo: 'Escribe el costo unitario.' })
  })

  it('cantidad y costo inválidos tienen su propio mensaje', () => {
    const e = validarForm(base({ lineas: [linea({ cantidad: '0', costo: '12,5' })] }), articulos, HOY)
    expect(e.detalle?.[0]?.cantidad).toBe('La cantidad debe ser un número mayor que cero (hasta 3 decimales).')
    expect(e.detalle?.[0]?.costo).toBe('El costo debe ser un número entero en pesos, mayor que cero.')
  })

  it('[RN-COM-02] en compra inmediata, un artículo que controla vencimiento exige la fecha', () => {
    const f = base({ lineas: [linea({ articuloId: 'crema' })] })
    expect(validarForm(f, articulos, HOY).detalle?.[0]?.vencimiento).toBe('Escribe la fecha de vencimiento.')
    const ok = base({ lineas: [linea({ articuloId: 'crema', vencimiento: '2027-05-01' })] })
    expect(validarForm(ok, articulos, HOY)).toEqual({})
  })

  it('el mismo artículo no puede repetirse en dos líneas (se suma en una)', () => {
    const e = validarForm(base({ lineas: [linea(), linea()] }), articulos, HOY)
    expect(e.detalle?.[1]?.articulo).toBe('Este artículo ya está en la compra: suma la cantidad en esa línea.')
  })

  it('[RF-COM-03] el encargo exige fecha esperada, no anterior a hoy, y no pide vencimiento todavía', () => {
    const enc = (fechaEsperada: string, lineas = [linea({ articuloId: 'crema' })]) => base({ modalidad: 'encargo', fechaEsperada, lineas })
    expect(validarForm(enc(''), articulos, HOY).fechaEsperada).toBe('Elige la fecha en que esperas recibirla.')
    expect(validarForm(enc('2026-11-19'), articulos, HOY).fechaEsperada).toBe('La fecha esperada no puede ser anterior a hoy.')
    expect(validarForm(enc('2026-11-25'), articulos, HOY)).toEqual({})
    expect(validarForm(enc(HOY), articulos, HOY)).toEqual({})
  })

  it('la cantidad por línea tiene tope (cabe en numeric(12,3) del servidor)', () => {
    expect(CANTIDAD_MAXIMA).toBe(999_999)
    const e = validarForm(base({ lineas: [linea({ cantidad: '1.000.000', costo: '1.000' })] }), articulos, HOY)
    expect(e.detalle?.[0]?.cantidad).toBe('La cantidad es demasiado grande (máximo 999.999).')
    expect(validarForm(base({ lineas: [linea({ cantidad: '999.999', costo: '1.000' })] }), articulos, HOY)).toEqual({})
  })

  it('un artículo o proveedor elegido que ya no existe se frena con un mensaje claro', () => {
    const e = validarForm(base({ lineas: [linea({ articuloId: 'desaparecido' })] }), articulos, HOY)
    expect(e.detalle?.[0]?.articulo).toBe('Ese artículo ya no está disponible. Elígelo de nuevo.')
    const p = validarForm(base({ proveedorId: 'p-borrado' }), articulos, HOY, new Set(['p1', 'p2']))
    expect(p.proveedor).toBe('Ese proveedor ya no está disponible. Elígelo de nuevo.')
    expect(validarForm(base({ proveedorId: 'p1' }), articulos, HOY, new Set(['p1']))).toEqual({})
    expect(validarForm(base({ proveedorId: PROVEEDOR_NUEVO, proveedorNuevo: { nombre: 'X', telefono: '' } }), articulos, HOY, new Set())).toEqual({})
  })

  it('un total que supera el tope se frena', () => {
    const e = validarForm(base({ lineas: [linea({ cantidad: '999.999', costo: '999.999.999' })] }), articulos, HOY)
    expect(e.detalle).toBeUndefined()
    expect(e.lineas).toBe('El total de la compra es demasiado grande.')
  })
})

describe('[RF-COM-02][RF-COM-05] armarDatos', () => {
  const ahora = new Date('2026-11-20T15:00:00Z')

  it('compra inmediata: orden, ítems, recepción total y un pago por el total exacto', () => {
    const d = armarDatos(base({ lineas: [linea({ cantidad: '20', costo: '30.000' }), linea({ articuloId: 'crema', cantidad: '2,5', costo: '10.000', vencimiento: '2027-05-01', lote: ' L-7 ' })] }), ids, ahora)
    expect(d.orden).toMatchObject({ proveedor_id: 'p1', modalidad: 'inmediata', condicion_pago: 'contado' })
    expect(d.orden.fecha).toBe('2026-11-20T15:00:00.000Z')
    expect(d.proveedor_nuevo).toBeUndefined()
    expect(d.items).toEqual([
      { id: expect.any(String), articulo_id: 'cafe', cantidad: 20, costo_unitario: 30000 },
      { id: expect.any(String), articulo_id: 'crema', cantidad: 2.5, costo_unitario: 10000 },
    ])
    expect(d.recepcion?.items).toEqual([
      { id: expect.any(String), orden_item_id: d.items[0]!.id, cantidad: 20 },
      { id: expect.any(String), orden_item_id: d.items[1]!.id, cantidad: 2.5, lote_codigo: 'L-7', fecha_vencimiento: '2027-05-01' },
    ])
    expect(d.pagos).toEqual([{ id: expect.any(String), medio: 'efectivo', valor: 625000 }])
  })

  it('RN-COM-01: la recepción de una inmediata es total, igual a lo pedido, línea por línea', () => {
    const d = armarDatos(base({ lineas: [linea({ cantidad: '3' }), linea({ articuloId: 'crema', cantidad: '4', vencimiento: '2027-01-01' })] }), ids, ahora)
    expect(d.recepcion!.items.map((r) => r.cantidad)).toEqual(d.items.map((i) => i.cantidad))
  })

  it('encargo: orden pedida con fecha esperada, sin recepción ni pagos', () => {
    const d = armarDatos(base({ modalidad: 'encargo', fechaEsperada: '2026-11-30' }), ids, ahora)
    expect(d.orden).toMatchObject({ modalidad: 'encargo', fecha_esperada: '2026-11-30' })
    expect(d.recepcion).toBeUndefined()
    expect(d.pagos).toBeUndefined()
  })

  it('proveedor nuevo: va como `proveedor_nuevo` de rol proveedor, sin `proveedor_id`', () => {
    const d = armarDatos(base({ proveedorId: PROVEEDOR_NUEVO, proveedorNuevo: { nombre: '  Don Hernán ', telefono: ' 300 123 4567 ' } }), ids, ahora)
    expect(d.orden.proveedor_id).toBeUndefined()
    expect(d.proveedor_nuevo).toEqual({ id: expect.any(String), nombre: 'Don Hernán', telefono: '300 123 4567', es_proveedor: true })
    const sinTel = armarDatos(base({ proveedorId: PROVEEDOR_NUEVO, proveedorNuevo: { nombre: 'Doña Rosa', telefono: '' } }), ids, ahora)
    expect('telefono' in sinTel.proveedor_nuevo!).toBe(false)
  })

  it('el medio de pago elegido viaja en el pago', () => {
    expect(armarDatos(base({ medioPago: 'nequi' }), ids, ahora).pagos![0]!.medio).toBe('nequi')
  })

  it('el payload pasa el esquema Zod del escritor y la op admite offline (D-009)', () => {
    for (const f of [base(), base({ modalidad: 'encargo', fechaEsperada: '2026-11-30' }), base({ proveedorId: PROVEEDOR_NUEVO, proveedorNuevo: { nombre: 'Don Hernán', telefono: '' } })]) {
      expect(TIPOS_OP['orden_compra.registrar']!.schema.safeParse(armarDatos(f, ids, ahora)).success).toBe(true)
    }
    expect(TIPOS_OP['orden_compra.registrar']!.admiteOffline).toBe(true)
  })

  it('cada id nuevo es distinto', () => {
    const d = armarDatos(base({ lineas: [linea(), linea({ articuloId: 'crema', vencimiento: '2027-01-01' })] }), ids, ahora)
    const todos = [d.orden.id, ...d.items.map((i) => i.id), d.recepcion!.id, ...d.recepcion!.items.map((r) => r.id), d.pagos![0]!.id]
    expect(new Set(todos).size).toBe(todos.length)
  })
})

describe('filasLocales (lo que se ve con ⏳ mientras no se sube)', () => {
  const ahora = new Date('2026-11-20T15:00:00Z')

  it('una compra inmediata queda «recibida», con su total, ítems y pago embebidos', () => {
    const d = armarDatos(base(), ids, ahora)
    const [orden] = filasLocales(d)
    expect(orden).toMatchObject({ tabla: 'ordenes_compra', fila: { id: d.orden.id, proveedor_id: 'p1', modalidad: 'inmediata', estado: 'recibida', total: 600000 } })
    expect((orden!.fila['items'] as unknown[])).toHaveLength(1)
    expect((orden!.fila['items'] as Array<Record<string, unknown>>)[0]).toMatchObject({ articulo_id: 'cafe', cantidad: 20, cantidad_recibida: 20 })
    const recepciones = orden!.fila['recepciones'] as Array<{ items: Array<Record<string, unknown>> }>
    expect(recepciones).toHaveLength(1)
    expect(recepciones[0]!.items).toEqual([expect.objectContaining({ cantidad: 20, orden_item_id: (orden!.fila['items'] as Array<{ id: string }>)[0]!.id })])
    expect((orden!.fila['pagos'] as unknown[])).toHaveLength(1)
  })

  it('un encargo queda «pedida» y sin pagos', () => {
    const d = armarDatos(base({ modalidad: 'encargo', fechaEsperada: '2026-11-30' }), ids, ahora)
    const [orden] = filasLocales(d)
    expect(orden!.fila).toMatchObject({ estado: 'pedida', fecha_esperada: '2026-11-30', recepciones: [] })
    expect((orden!.fila['items'] as Array<Record<string, unknown>>)[0]).toMatchObject({ cantidad_recibida: 0 })
  })

  it('con proveedor nuevo agrega también su fila de tercero, con el rol proveedor', () => {
    const d = armarDatos(base({ proveedorId: PROVEEDOR_NUEVO, proveedorNuevo: { nombre: 'Don Hernán', telefono: '' } }), ids, ahora)
    const filas = filasLocales(d)
    expect(filas.map((f) => f.tabla)).toEqual(['ordenes_compra', 'terceros'])
    expect(filas[1]!.fila).toMatchObject({ id: d.proveedor_nuevo!.id, nombre: 'Don Hernán', roles: ['proveedor'] })
    expect(filas[0]!.fila).toMatchObject({ proveedor_id: d.proveedor_nuevo!.id })
  })
})
