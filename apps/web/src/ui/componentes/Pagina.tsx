import type { ReactNode } from 'react'
import { BarraSuperior } from './BarraSuperior'

type Props = {
  titulo: string
  volverA?: string
  subtitulo?: string
  marca?: boolean
  children: ReactNode
}

/** Pantalla estándar: barra superior negra y contenido en una columna de 448 px máximo (pensada para 360 px). */
export function Pagina({ titulo, volverA, subtitulo, marca, children }: Props) {
  return (
    <>
      <BarraSuperior titulo={titulo} volverA={volverA} subtitulo={subtitulo} marca={marca} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-6">{children}</main>
    </>
  )
}
