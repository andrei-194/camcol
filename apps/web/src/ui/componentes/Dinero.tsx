import { formatCOP } from '../../lib/formato'

type Props = { valor: number; className?: string }

/**
 * Dinero en pesos sin decimales: el protagonista de su tarjeta, en Fraunces con cifras tabulares; el «$» va menor y en
 * tinta. Un valor que no es un número finito se muestra como «—» en vez de «$ NaN».
 */
export function Dinero({ valor, className = '' }: Props) {
  if (!Number.isFinite(valor)) return <span className={`font-titulo font-semibold ${className}`}>—</span>
  const entero = Math.round(valor) + 0 // el «+ 0» convierte -0 en 0
  const texto = formatCOP(entero).replace(new RegExp('[\\u00a0\\u202f]', 'g'), ' ')
  const partes = /^(-?)\$\s*(.*)$/.exec(texto)
  const signo = partes?.[1] ?? ''
  const cifra = partes?.[2] ?? texto
  return (
    <data value={entero} className={`font-titulo font-semibold tabular-nums ${className}`}>
      {signo}
      <span className="mr-0.5 text-[0.6em] text-texto-secundario">$</span>
      {cifra}
    </data>
  )
}
