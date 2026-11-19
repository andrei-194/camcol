import type { ReactNode } from 'react'
import { IndicadoresEstado } from '../IndicadoresEstado'
import { BarraInferior } from './BarraInferior'
import { MenuAcciones } from './MenuAcciones'

/** Marco de las pantallas con sesión: estado arriba, contenido, y la barra inferior con el botón «+» siempre a mano. */
export function MarcoApp({ children }: { children: ReactNode }) {
  return (
    <>
      <IndicadoresEstado />
      <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <BarraInferior />
      <MenuAcciones />
    </>
  )
}
