import type { ReactNode } from 'react'
import { Pagina } from '../componentes/Pagina'
import { Tarjeta } from '../componentes/Tarjeta'

/** Contenedor de las pantallas de acceso: cabecera de marca con el lema y el contenido en una tarjeta. Pensado para 360 px. */
export function PantallaCentrada({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Pagina titulo={titulo} subtitulo="Del campo colombiano a tu mesa." marca>
      <Tarjeta className="flex flex-col gap-4">{children}</Tarjeta>
    </Pagina>
  )
}
