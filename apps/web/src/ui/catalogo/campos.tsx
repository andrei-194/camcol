import { useId, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import type { Fila } from '../../infra/db/db'

/** Campo de selección con el mismo aspecto que `CampoTexto` (48 px, etiqueta visible). */
export function CampoSelect({
  etiqueta,
  error,
  className = '',
  children,
  ...resto
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { etiqueta: string; error?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-texto">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={`min-h-12 w-full rounded-control border-2 bg-fondo px-3 text-cuerpo text-texto ${
          error ? 'border-peligro' : 'border-borde-fuerte'
        } ${className}`}
        {...resto}
      >
        {children}
      </select>
      {error && (
        <p role="alert" className="text-pequeno font-medium text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}

/** Casilla con etiqueta; toda la fila es táctil (≥ 48 px). */
export function CampoCasilla({ etiqueta, ...resto }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & { etiqueta: string }) {
  const id = useId()
  return (
    <div className="flex min-h-12 items-center gap-3">
      <input id={id} type="checkbox" className="size-6 accent-acento" {...resto} />
      <label htmlFor={id} className="flex-1 py-2 text-cuerpo text-texto">
        {etiqueta}
      </label>
    </div>
  )
}

export const texto = (f: Fila, campo: string): string => (f[campo] == null ? '' : String(f[campo]))
export const numero = (f: Fila, campo: string): number => Number(f[campo] ?? 0)

/** «18.500», «$ 18500» → 18500. Vacío o con letras → null. COP sin decimales. */
export function leerPesos(texto: string): number | null {
  const limpio = texto.replace(/[\s$.]/g, '')
  return /^\d+$/.test(limpio) ? Number(limpio) : null
}

export const AVISO_SIN_RED = 'Requiere conexión. Conéctate para hacer este cambio; ver el catálogo sí funciona sin red.'
