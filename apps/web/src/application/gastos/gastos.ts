// Gastos operativos (T-M5-05, CAM-65, RF-PAG-03): validación del formulario, armado de la op `gasto.registrar`
// (PLAN §4.3) y totales para la lista. El servidor revalida todo (regla 3); esto da mensajes rápidos, también sin señal.
// Fuera de alcance por ahora: vínculo a un pedido u orden de compra y «quién pagó» (necesita los socios en el caché).
import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import type { CaminoDB, Fila } from '../../infra/db/db'

/** Tope por gasto: bastante por debajo de `numeric(14,2)` del servidor y de un entero seguro de JavaScript. */
export const VALOR_MAXIMO = 999_999_999

export const CATEGORIAS_GASTO = ['Combustible', 'Empaques', 'Transporte', 'Alimentación', 'Otros'] as const

export interface FormGasto {
  categoria: string
  concepto: string
  valor: string
  fecha: string
}

export type ErroresGasto = Partial<Record<'categoria' | 'valor' | 'fecha', string>>

export interface DatosGasto {
  id: string
  categoria: string
  concepto?: string
  valor: number
  fecha: string
}

export const formVacio = (hoy: string): FormGasto => ({ categoria: '', concepto: '', valor: '', fecha: hoy })

/**
 * Pesos enteros escritos como `45000`, `45.000`, `$ 45.000` o `1.250.000`. Los puntos solo valen como separador de
 * miles (grupos de tres). Decimales, signos o letras devuelven `null`.
 */
export function parseValor(texto: string): number | null {
  const t = texto.trim().replace(/^\$\s*/, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  if (/^\d+$/.test(t)) return Number(t)
  return null
}

export function validarForm(form: FormGasto, hoy: string): ErroresGasto {
  const errores: ErroresGasto = {}
  if (!form.categoria.trim()) errores.categoria = 'Elige una categoría.'
  if (!form.valor.trim()) errores.valor = 'Escribe el valor del gasto.'
  else {
    const v = parseValor(form.valor)
    if (v === null) errores.valor = 'El valor debe ser un número entero en pesos, sin decimales.'
    else if (v <= 0) errores.valor = 'El valor debe ser mayor que cero.'
    else if (v > VALOR_MAXIMO) errores.valor = 'El valor es demasiado grande.'
  }
  if (!form.fecha) errores.fecha = 'Elige la fecha del gasto.'
  else if (form.fecha > hoy) errores.fecha = 'La fecha no puede ser futura.'
  return errores
}

/** Payload de `gasto.registrar`. Se llama solo con un formulario ya validado. */
export function armarDatos(form: FormGasto, id: string): DatosGasto {
  const concepto = form.concepto.trim()
  return {
    id,
    categoria: form.categoria.trim(),
    ...(concepto ? { concepto } : {}),
    valor: parseValor(form.valor) ?? 0,
    fecha: form.fecha,
  }
}

/** Fila local provisional (se muestra con ⏳ hasta que la op se aplique). */
export const filaLocal = (datos: DatosGasto): Fila => ({ ...datos })

const vigentes = (todos: Fila[]) => todos.filter((g) => !g['deleted_at'])

/** Del más reciente al más antiguo; a igual fecha, primero el creado después (los ids son UUID v7, ordenables). */
export function gastosRecientes(todos: Fila[], limite = 50): Fila[] {
  return vigentes(todos)
    .sort((a, b) => String(b['fecha'] ?? '').localeCompare(String(a['fecha'] ?? '')) || b.id.localeCompare(a.id))
    .slice(0, limite)
}

/** Suma de los gastos del mes de `hoy` (día de Bogotá, `AAAA-MM-DD`). Ignora borrados y valores no numéricos. */
export function totalDelMes(todos: Fila[], hoy: string): number {
  const mes = hoy.slice(0, 7)
  return vigentes(todos).reduce((suma, g) => {
    const valor = Number(g['valor'])
    return String(g['fecha'] ?? '').startsWith(mes) && Number.isFinite(valor) ? suma + valor : suma
  }, 0)
}

export type CargaGastos = { fase: 'cargando' } | { fase: 'error' } | { fase: 'listo'; gastos: Fila[] }

/** Todos los gastos locales, vivos: se actualizan solos cuando cambia Dexie (pull o captura local). */
export function useGastos(db: CaminoDB): CargaGastos {
  const [carga, setCarga] = useState<CargaGastos>({ fase: 'cargando' })
  useEffect(() => {
    const sub = liveQuery(() => db.gastos.toArray()).subscribe({
      next: (gastos) => setCarga({ fase: 'listo', gastos }),
      error: () => setCarga({ fase: 'error' }),
    })
    return () => sub.unsubscribe()
  }, [db])
  return carga
}
