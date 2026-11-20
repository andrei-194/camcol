import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useIndicadores } from '../../application/sync/useIndicadores'
import { db as dbGlobal, type CaminoDB } from '../../infra/db/db'
import { Logo } from '../componentes/Logo'
import { IconoCompras, IconoInventario, IconoMas, IconoVentas } from './iconos'

const BASE = 'relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-pequeno text-texto-secundario'

function Destino({ a, icono, texto, contador }: { a: string; icono: ReactNode; texto: string; contador?: number }) {
  return (
    <li>
      <NavLink to={a} className={({ isActive }) => `${BASE} ${isActive ? 'font-semibold text-texto' : ''}`}>
        {({ isActive }) => (
          <>
            {isActive && <span aria-hidden="true" className="absolute -top-px h-[3px] w-7 rounded-b-full bg-acento" />}
            <span className={isActive ? 'text-acento' : ''}>{icono}</span>
            {texto}
            {contador ? (
              <span
                aria-hidden="true"
                className="absolute right-[calc(50%-1.5rem)] top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-advertencia px-1 text-pequeno font-semibold text-sobre-acento"
              >
                {contador}
              </span>
            ) : null}
          </>
        )}
      </NavLink>
    </li>
  )
}

/** Navegación principal: cuatro destinos y, en el centro, Inicio como un disco de café con un anillo de trigo incompleto. */
export function BarraInferior({ db = dbGlobal }: { db?: CaminoDB }) {
  const { pendientes } = useIndicadores(db)
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-trigo bg-fondo pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-[1fr_1fr_5.5rem_1fr_1fr]">
        <Destino a="/ventas" icono={<IconoVentas />} texto="Ventas" />
        <Destino a="/compras" icono={<IconoCompras />} texto="Compras" />
        <li>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${BASE} justify-end pb-2 ${isActive ? 'font-semibold text-texto' : ''}`}
          >
            <span
              aria-hidden="true"
              className="absolute -top-7 left-1/2 flex size-[68px] -translate-x-1/2 items-center justify-center rounded-full border-4 border-fondo bg-[radial-gradient(circle_at_35%_28%,var(--color-acento),var(--color-cafe)_70%)] text-trigo shadow-flotante"
            >
              <svg viewBox="0 0 68 68" aria-hidden="true" focusable="false" className="absolute -inset-1 size-[68px]">
                <circle
                  cx="34"
                  cy="34"
                  r="31"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray="74 26"
                  transform="rotate(128 34 34)"
                />
              </svg>
              <Logo className="relative h-5 w-auto" />
            </span>
            Inicio
          </NavLink>
        </li>
        <Destino a="/inventario" icono={<IconoInventario />} texto="Inventario" />
        <Destino a="/mas" icono={<IconoMas />} texto="Más" contador={pendientes} />
      </ul>
    </nav>
  )
}
