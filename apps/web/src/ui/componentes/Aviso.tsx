import type { HTMLAttributes } from 'react'

export type TonoAviso = 'info' | 'advertencia' | 'error'

const TONOS: Record<TonoAviso, string> = {
  info: 'border-borde-fuerte bg-superficie text-texto',
  advertencia: 'border-advertencia bg-advertencia-suave text-advertencia',
  error: 'border-peligro bg-peligro-suave text-peligro',
}

/** Mensaje en línea. Los errores se anuncian con `role="alert"`; el resto con `role="status"`. */
export function Aviso({
  tono = 'info',
  role,
  className = '',
  ...resto
}: HTMLAttributes<HTMLDivElement> & { tono?: TonoAviso }) {
  return (
    <div
      role={role ?? (tono === 'error' ? 'alert' : 'status')}
      className={`rounded-control border-2 p-3 ${TONOS[tono]} ${className}`}
      {...resto}
    />
  )
}
