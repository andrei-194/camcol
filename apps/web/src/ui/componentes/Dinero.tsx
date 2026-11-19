import { formatCOP } from '../../lib/formato'

type Props = { valor: number; className?: string }

/** Dinero en pesos sin decimales: el protagonista de su tarjeta, en Fraunces con cifras tabulares; el «$» va menor y en tinta. */
export function Dinero({ valor, className = '' }: Props) {
  const texto = formatCOP(valor).replace(/[\u00a0\u202f]/g, ' ')
  const partes = /^(-?)\$\s*(.*)$/.exec(texto)
  const signo = partes?.[1] ?? ''
  const cifra = partes?.[2] ?? texto
  return (
    <data value={valor} className={`font-titulo font-semibold tabular-nums ${className}`}>
      {signo}
      <span className="mr-0.5 text-[0.6em] text-texto-secundario">$</span>
      {cifra}
    </data>
  )
}
