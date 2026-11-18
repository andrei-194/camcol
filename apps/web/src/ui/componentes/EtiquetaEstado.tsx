import type { HTMLAttributes } from 'react'

export type TonoEtiqueta = 'neutro' | 'acento' | 'advertencia' | 'peligro' | 'exito'

const TONOS: Record<TonoEtiqueta, string> = {
  neutro: 'border-borde-fuerte bg-superficie text-texto',
  acento: 'border-acento bg-acento-suave text-acento',
  advertencia: 'border-advertencia bg-advertencia-suave text-advertencia',
  peligro: 'border-peligro bg-peligro-suave text-peligro',
  exito: 'border-exito bg-fondo text-exito',
}

/** Pastilla de estado. El significado va en el texto; el color solo lo refuerza. */
export function EtiquetaEstado({
  tono = 'neutro',
  className = '',
  ...resto
}: HTMLAttributes<HTMLSpanElement> & { tono?: TonoEtiqueta }) {
  return (
    <span
      data-tono={tono}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-pequeno font-semibold ${TONOS[tono]} ${className}`}
      {...resto}
    />
  )
}
