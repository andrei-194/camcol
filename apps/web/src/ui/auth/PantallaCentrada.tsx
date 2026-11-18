import type { ReactNode } from 'react'
import { Pagina } from '../componentes/Pagina'

/** Contenedor de las pantallas de acceso. Pensado para 360 px de ancho. */
export function PantallaCentrada({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Pagina titulo={titulo} marca>
      {children}
    </Pagina>
  )
}
