import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

export type VarianteBoton = 'primario' | 'secundario' | 'peligro'

const BASE =
  'inline-flex min-h-12 items-center justify-center rounded-full px-5 py-2 text-cuerpo font-semibold ' +
  'transition-colors disabled:cursor-not-allowed disabled:border-arena disabled:bg-arena disabled:text-texto-secundario'

const VARIANTES: Record<VarianteBoton, string> = {
  // Café: la acción principal de la pantalla.
  primario: 'bg-acento text-sobre-acento hover:bg-acento-hover',
  // Contorno cacao: acciones de apoyo.
  secundario: 'border-2 border-acento bg-transparent text-acento hover:bg-superficie',
  // Rojo: solo acciones destructivas.
  peligro: 'bg-peligro text-sobre-peligro hover:opacity-90',
}

export function clasesBoton(variante: VarianteBoton = 'primario'): string {
  return `${BASE} ${VARIANTES[variante]}`
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton }

/** Botón del sistema de diseño: 48 px de alto mínimo, `type="button"` por defecto. */
export function Boton({ variante = 'primario', type = 'button', className = '', ...resto }: Props) {
  return <button type={type} data-variante={variante} className={`${clasesBoton(variante)} ${className}`} {...resto} />
}

/** Enlace con aspecto de botón (navegación). */
export function BotonEnlace({ variante = 'primario', className = '', ...resto }: LinkProps & { variante?: VarianteBoton }) {
  return <Link data-variante={variante} className={`${clasesBoton(variante)} ${className}`} {...resto} />
}

/** Clases de un enlace dentro de un texto: café subrayado, con área táctil cómoda. */
export const CLASES_ENLACE = 'text-acento underline underline-offset-2 hover:text-acento-hover'
