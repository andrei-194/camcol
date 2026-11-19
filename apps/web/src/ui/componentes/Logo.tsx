import { MARCA_CAMINO } from './marcaCamino'

type Props = {
  /** Con título es una imagen accesible; sin él es decorativo. */
  titulo?: string
  className?: string
}

/** Montaña con camino de la marca. Toma el color del texto (`currentColor`): trigo sobre el café, cacao sobre el papel. */
export function Logo({ titulo, className = '' }: Props) {
  return (
    <svg
      viewBox={MARCA_CAMINO.viewBox}
      fill="currentColor"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <path d={MARCA_CAMINO.d} fillRule="evenodd" />
    </svg>
  )
}
