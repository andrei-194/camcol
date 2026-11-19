import type { LiHTMLAttributes } from 'react'

/** Fila de una lista con filete punteado, como las fichas de la web. Va dentro de un `ul`. */
export function FilaLista({ className = '', ...resto }: LiHTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={`flex min-h-12 items-center justify-between gap-3 border-b border-dotted border-texto-secundario py-2 last:border-b-0 ${className}`}
      {...resto}
    />
  )
}
