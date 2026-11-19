import type { ReactNode } from 'react'

/** Íconos de la barra inferior: trazo de 1,7 px que toma el color del texto. Decorativos (`aria-hidden`). */
function Icono({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="size-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const IconoVentas = () => (
  <Icono>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </Icono>
)
export const IconoCompras = () => (
  <Icono>
    <path d="M4 9h16l-1.5 10h-13z" />
    <path d="M8 9l3-5M16 9l-3-5" />
  </Icono>
)
export const IconoInventario = () => (
  <Icono>
    <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </Icono>
)
export const IconoMas = () => (
  <Icono>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </Icono>
)
