import { Link } from 'react-router-dom'
import { Logo } from './Logo'

type Props = {
  titulo: string
  /** Si hay destino, se muestra «Volver». */
  volverA?: string
  subtitulo?: string
  /** Título grande de marca (inicio y acceso). */
  marca?: boolean
}

/** Encabezado negro con filo café. Lleva el único h1 de la pantalla. */
export function BarraSuperior({ titulo, volverA, subtitulo, marca = false }: Props) {
  return (
    <header className="sobre-oscuro relative overflow-hidden border-b-2 border-trigo bg-cafe text-fondo">
      <Logo className="pointer-events-none absolute -right-6 -top-3 h-24 w-auto text-trigo opacity-45" />
      <div className="relative mx-auto flex w-full max-w-md flex-col px-4 pb-4 pt-1">
        {volverA && (
          <Link to={volverA} className="-ml-2 inline-flex min-h-12 w-fit items-center gap-1 px-2 text-fondo underline underline-offset-2">
            <span aria-hidden="true">‹</span>
            Volver
          </Link>
        )}
        <h1
          className={`font-titulo font-semibold ${marca ? 'pt-4 text-marca' : 'text-titulo'} ${volverA ? '' : 'pt-3'}`}
        >
          {titulo}
        </h1>
        {subtitulo && <p className="mt-1 text-cuerpo text-fondo">{subtitulo}</p>}
      </div>
    </header>
  )
}
