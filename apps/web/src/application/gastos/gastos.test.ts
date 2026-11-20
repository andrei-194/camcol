// Gastos (T-M5-05, CAM-65): validación del formulario, armado de la op `gasto.registrar` y totales. RF-PAG-03.
// El servidor revalida todo (regla 3); esto da mensajes rápidos, también sin señal.
import { describe, expect, it } from 'vitest'
import { TIPOS_OP } from '../../infra/sync/tiposOp'
import {
  CATEGORIAS_GASTO,
  armarDatos,
  filaLocal,
  formVacio,
  gastosRecientes,
  parseValor,
  totalDelMes,
  validarForm,
  VALOR_MAXIMO,
} from './gastos'

const HOY = '2026-11-20'

describe('[RF-PAG-03] categorías', () => {
  it('ofrece las categorías de uso diario, con «Otros» al final', () => {
    expect(CATEGORIAS_GASTO).toEqual(['Combustible', 'Empaques', 'Transporte', 'Alimentación', 'Otros'])
  })
})

describe('[RF-PAG-03][RNF-UX-01] parseValor: pesos enteros', () => {
  it.each([
    ['45000', 45000],
    ['45.000', 45000],
    ['$ 45.000', 45000],
    ['1.250.000', 1250000],
    ['  800 ', 800],
    ['0', 0],
  ])('«%s» es %i', (texto, esperado) => expect(parseValor(texto)).toBe(esperado))

  it.each(['', '   ', 'abc', '12,5', '12.5', '4.5.000', '-5', '1e3', '45.00'])('«%s» no es un valor válido', (texto) =>
    expect(parseValor(texto)).toBeNull(),
  )
})

describe('[RF-PAG-03] validarForm', () => {
  const ok = { categoria: 'Combustible', concepto: '', valor: '45.000', fecha: HOY }

  it('un formulario completo no tiene errores', () => expect(validarForm(ok, HOY)).toEqual({}))

  it('exige categoría', () => expect(validarForm({ ...ok, categoria: '' }, HOY).categoria).toBe('Elige una categoría.'))

  it('exige valor, entero y mayor que cero, con mensajes distintos', () => {
    expect(validarForm({ ...ok, valor: '' }, HOY).valor).toBe('Escribe el valor del gasto.')
    expect(validarForm({ ...ok, valor: '12,5' }, HOY).valor).toBe('El valor debe ser un número entero en pesos, sin decimales.')
    expect(validarForm({ ...ok, valor: '0' }, HOY).valor).toBe('El valor debe ser mayor que cero.')
  })

  it('la fecha es obligatoria y no puede ser futura (hoy sí)', () => {
    expect(validarForm({ ...ok, fecha: '' }, HOY).fecha).toBe('Elige la fecha del gasto.')
    expect(validarForm({ ...ok, fecha: '2026-11-21' }, HOY).fecha).toBe('La fecha no puede ser futura.')
    expect(validarForm({ ...ok, fecha: '2026-11-19' }, HOY)).toEqual({})
    expect(validarForm({ ...ok, fecha: '2026-11-20' }, HOY)).toEqual({})
  })

  it('devuelve todos los errores a la vez', () => {
    expect(Object.keys(validarForm({ categoria: '', concepto: '', valor: '', fecha: '' }, HOY)).sort()).toEqual(['categoria', 'fecha', 'valor'])
  })
})

describe('[RF-PAG-03] formVacio y armarDatos', () => {
  it('el formulario nuevo trae la fecha de hoy', () => {
    expect(formVacio(HOY)).toEqual({ categoria: '', concepto: '', valor: '', fecha: HOY })
  })

  it('arma el payload de gasto.registrar: valor numérico, concepto solo si lo hay y sin espacios sobrantes', () => {
    const d = armarDatos({ categoria: 'Empaques', concepto: '  Cajas de cartón  ', valor: '80.000', fecha: HOY }, 'g-1')
    expect(d).toEqual({ id: 'g-1', categoria: 'Empaques', concepto: 'Cajas de cartón', valor: 80000, fecha: HOY })
    const sin = armarDatos({ categoria: 'Otros', concepto: '   ', valor: '5000', fecha: HOY }, 'g-2')
    expect(sin).toEqual({ id: 'g-2', categoria: 'Otros', valor: 5000, fecha: HOY })
    expect('concepto' in sin).toBe(false)
  })

  it('el payload armado pasa el esquema Zod de la op (el mismo que usa el escritor)', () => {
    const d = armarDatos({ categoria: 'Combustible', concepto: '', valor: '45.000', fecha: HOY }, 'g-3')
    expect(TIPOS_OP['gasto.registrar']!.schema.safeParse(d).success).toBe(true)
    expect(TIPOS_OP['gasto.registrar']!.admiteOffline).toBe(true) // D-009: los gastos se registran sin señal
  })

  it('filaLocal es la fila provisional que se muestra con ⏳', () => {
    const d = armarDatos({ categoria: 'Combustible', concepto: 'ACPM', valor: '45.000', fecha: HOY }, 'g-4')
    expect(filaLocal(d)).toEqual({ id: 'g-4', categoria: 'Combustible', concepto: 'ACPM', valor: 45000, fecha: HOY })
  })
})

describe('[RF-PAG-03] gastosRecientes y totalDelMes', () => {
  const g = (id: string, fecha: string, valor: number, extra: object = {}) => ({ id, fecha, categoria: 'Otros', valor, ...extra })

  it('ordena del más reciente al más antiguo y, a igual fecha, el último creado primero; limita la cantidad', () => {
    const lista = [g('a', '2026-11-18', 1), g('b', '2026-11-20', 1), g('c', '2026-11-20', 1), g('d', '2026-11-19', 1)]
    expect(gastosRecientes(lista, 3).map((x) => x.id)).toEqual(['c', 'b', 'd'])
  })

  it('suma solo los gastos del mes de hoy (Bogotá), ignorando los borrados lógicamente', () => {
    const lista = [
      g('a', '2026-11-01', 10000),
      g('b', '2026-11-20', 5000),
      g('c', '2026-10-31', 99999),
      g('d', '2026-12-01', 99999),
      g('e', '2026-11-15', 7000, { deleted_at: '2026-11-16T00:00:00Z' }),
    ]
    expect(totalDelMes(lista, HOY)).toBe(15000)
  })

  it('sin gastos el total es cero y valores no numéricos no contaminan la suma', () => {
    expect(totalDelMes([], HOY)).toBe(0)
    expect(totalDelMes([g('a', '2026-11-02', Number.NaN)], HOY)).toBe(0)
  })
})

describe('[RF-PAG-03] tope del valor', () => {
  const ok = { categoria: 'Otros', concepto: '', valor: '', fecha: HOY }

  it('el tope es de 999.999.999 pesos (cabe de sobra en numeric(14,2) y en un entero seguro)', () => {
    expect(VALOR_MAXIMO).toBe(999_999_999)
    expect(validarForm({ ...ok, valor: '999.999.999' }, HOY)).toEqual({})
    expect(validarForm({ ...ok, valor: '1.000.000.000' }, HOY).valor).toBe('El valor es demasiado grande.')
  })

  it('números enormes se frenan con ese mismo mensaje, sin pasar por Zod', () => {
    expect(validarForm({ ...ok, valor: '9'.repeat(20) }, HOY).valor).toBe('El valor es demasiado grande.')
    expect(validarForm({ ...ok, valor: String(Number.MAX_SAFE_INTEGER) }, HOY).valor).toBe('El valor es demasiado grande.')
  })

  it('los ceros a la izquierda no cambian el valor', () => {
    expect(parseValor('007')).toBe(7)
    expect(validarForm({ ...ok, valor: '007' }, HOY)).toEqual({})
  })
})
