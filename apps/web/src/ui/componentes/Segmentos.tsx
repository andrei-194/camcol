type Opcion<T extends string> = { valor: T; texto: string }

type Props<T extends string> = {
  /** Nombre accesible del grupo. */
  etiqueta: string
  opciones: Opcion<T>[]
  valor: T
  alCambiar: (valor: T) => void
}

/** Selector de una opción entre pocas (pastillas). La activa se anuncia con `aria-pressed`; cada una mide 48 px. */
export function Segmentos<T extends string>({ etiqueta, opciones, valor, alCambiar }: Props<T>) {
  return (
    <div role="group" aria-label={etiqueta} className="flex gap-1.5">
      {opciones.map((o) => {
        const activa = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activa}
            onClick={() => {
              if (!activa) alCambiar(o.valor)
            }}
            className={`inline-flex min-h-12 flex-1 items-center justify-center rounded-full px-3 text-pequeno font-semibold transition-colors ${
              activa ? 'bg-acento text-sobre-acento' : 'bg-superficie text-texto-secundario hover:bg-arena'
            }`}
          >
            {o.texto}
          </button>
        )
      })}
    </div>
  )
}
