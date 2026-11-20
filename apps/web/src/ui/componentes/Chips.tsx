import { useId, useRef, type KeyboardEvent } from 'react'

type Props = {
  /** Nombre accesible del grupo, también visible como etiqueta. */
  etiqueta: string
  opciones: readonly string[]
  valor: string
  alCambiar: (valor: string) => void
  error?: string
}

/**
 * Elección única entre pocas opciones, en chips que se acomodan en varias filas. Es un grupo de radios: solo el
 * elegido (o el primero, si no hay ninguno) entra en el orden de tabulación y las flechas mueven la elección.
 */
export function Chips({ etiqueta, opciones, valor, alCambiar, error }: Props) {
  const id = useId()
  const idError = `${id}-error`
  const botones = useRef<Array<HTMLButtonElement | null>>([])
  const elegido = opciones.indexOf(valor)
  const entra = elegido >= 0 ? elegido : 0

  function alTeclear(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (paso === 0) return
    e.preventDefault()
    const destino = (i + paso + opciones.length) % opciones.length
    alCambiar(opciones[destino]!)
    botones.current[destino]?.focus()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-etiqueta`} className="font-medium text-texto">
        {etiqueta}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-etiqueta`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className="flex flex-wrap gap-2"
      >
        {opciones.map((o, i) => {
          const activa = o === valor
          return (
            <button
              key={o}
              ref={(el) => {
                botones.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={activa}
              tabIndex={i === entra ? 0 : -1}
              onClick={() => alCambiar(o)}
              onKeyDown={(e) => alTeclear(e, i)}
              className={`inline-flex min-h-12 items-center rounded-full border-2 px-4 text-cuerpo font-semibold transition-colors ${
                activa ? 'border-acento bg-acento text-sobre-acento' : 'border-borde-fuerte bg-tarjeta text-texto hover:bg-superficie'
              }`}
            >
              {o}
            </button>
          )
        })}
      </div>
      {error && (
        <p id={idError} role="alert" className="text-pequeno font-medium text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}
