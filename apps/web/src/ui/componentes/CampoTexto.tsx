import { useId, type InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  etiqueta: string
  error?: string
  ayuda?: string
}

/** Campo de texto con etiqueta visible, ayuda y error vinculados (aria-describedby). 48 px de alto. */
export function CampoTexto({ etiqueta, error, ayuda, className = '', ...resto }: Props) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const descritoPor = [ayuda ? idAyuda : '', error ? idError : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-texto">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={descritoPor}
        className={`min-h-12 w-full rounded-control border-2 bg-tarjeta px-3 text-cuerpo text-texto ${
          error ? 'border-peligro' : 'border-borde-fuerte'
        } ${className}`}
        {...resto}
      />
      {ayuda && (
        <p id={idAyuda} className="text-pequeno text-texto-secundario">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="text-pequeno font-medium text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}
