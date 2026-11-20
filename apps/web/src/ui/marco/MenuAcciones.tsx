import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'

const ACCIONES = [
  { a: '/ventas/nuevo', texto: 'Nuevo pedido', icono: '+', principal: true },
  { a: '/compras/nueva', texto: 'Nueva compra', icono: '↓', principal: false },
  { a: '/gastos/nuevo', texto: 'Gasto', icono: '$', principal: false },
]

/**
 * Botón «+» flotante con las tres acciones rápidas: Nuevo pedido (la principal), Nueva compra y Gasto.
 * Patrón de menú: el foco entra al primer elemento, las flechas, Inicio y Fin lo recorren, Escape y Tab lo cierran
 * (Tab deja el foco en el botón para que no se escape a la barra inferior, tapada por el fondo) y un cambio de
 * ruta lo cierra solo. El nombre del botón es fijo; `aria-expanded` dice si está abierto.
 */
export function MenuAcciones() {
  const { pathname } = useLocation()
  // El menú está abierto solo en la ruta donde se abrió: al navegar (atrás, enlace, acción) se cierra sin efectos.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null)
  const abierto = abiertoEn === pathname
  const idMenu = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const devolverFoco = useRef(false)

  const cerrar = useCallback((conFoco: boolean) => {
    devolverFoco.current = conFoco
    setAbiertoEn(null)
  }, [])

  // Al abrir, el foco va al primer elemento; al cerrar por teclado o fondo, vuelve al botón.
  useEffect(() => {
    if (abierto) {
      menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    } else if (devolverFoco.current) {
      devolverFoco.current = false
      boton.current?.focus()
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') cerrar(true)
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [abierto, cerrar])

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      cerrar(true)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const destino =
      e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[destino]?.focus()
    e.preventDefault()
  }

  return (
    <>
      {abierto && <div data-testid="fondo-menu" aria-hidden="true" onClick={() => cerrar(true)} className="fixed inset-0 z-30 bg-cafe/55" />}
      <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3">
        {abierto && (
          <div
            ref={menu}
            id={idMenu}
            role="menu"
            aria-label="Acciones rápidas"
            onKeyDown={alTeclear}
            className="flex flex-col items-end gap-2.5"
          >
            {ACCIONES.map((x) => (
              <Link
                key={x.a}
                to={x.a}
                role="menuitem"
                onClick={() => cerrar(false)}
                className="flex min-h-12 items-center gap-2.5 rounded-full bg-fondo py-1 pl-1.5 pr-5 font-semibold text-texto shadow-flotante"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-9 items-center justify-center rounded-full text-seccion ${x.principal ? 'bg-acento text-sobre-acento' : 'bg-cafe text-trigo'}`}
                >
                  {x.icono}
                </span>
                {x.texto}
              </Link>
            ))}
          </div>
        )}
        <button
          ref={boton}
          type="button"
          aria-label="Acciones rápidas"
          aria-expanded={abierto}
          aria-haspopup="menu"
          aria-controls={abierto ? idMenu : undefined}
          onClick={() => setAbiertoEn(abierto ? null : pathname)}
          className={`flex size-14 items-center justify-center rounded-full text-[1.75rem] leading-none shadow-flotante transition-colors ${abierto ? 'bg-fondo text-texto' : 'bg-acento text-sobre-acento hover:bg-acento-hover'}`}
        >
          <span aria-hidden="true">{abierto ? '×' : '+'}</span>
        </button>
      </div>
    </>
  )
}
