import { Link } from 'react-router-dom'

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
    <header className="sobre-oscuro border-b-4 border-acento bg-texto text-fondo">
      <div className="mx-auto flex w-full max-w-md flex-col px-4 pb-4 pt-1">
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
