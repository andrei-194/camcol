import type { HTMLAttributes } from 'react'

/** Superficie blanca sobre el papel, con la sombra de papeles apilados. Se usa para agrupar, no para decorar: no anidar tarjetas. */
export function Tarjeta({ className = '', ...resto }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-papel ${className}`} {...resto} />
}
