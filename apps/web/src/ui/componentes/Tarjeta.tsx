import type { HTMLAttributes } from 'react'

/** Superficie blanca con borde fino. Se usa para agrupar, no para decorar: no anidar tarjetas. */
export function Tarjeta({ className = '', ...resto }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-tarjeta border border-borde bg-fondo p-4 shadow-tarjeta ${className}`} {...resto} />
}
