import { useId } from 'react'
import { formatCantidad, formatCOP } from '../../lib/formato'
import { alturaBarra, anchoBarra, proporcionArco, puntosSerie } from './escalas'

const TINTA = 'var(--color-texto-secundario)'
const LINEA = 'var(--color-arena)'
const CACAO = 'var(--color-acento)'
// Lo que comunica un dato va en un marrón con al menos 3:1 sobre la tarjeta blanca; el trigo claro queda solo en lo decorativo.
const MARRON = 'var(--color-borde-fuerte)'
const MAX_PERIODOS = 12

/** Indicador de arco sombreado (el margen). `valor` va de 0 a `max`; `texto` es lo que se lee en el centro. */
export function Arco({ valor, max, etiqueta, texto }: { valor: number; max: number; etiqueta: string; texto: string }) {
  const id = useId()
  const relleno = proporcionArco(valor, max)
  return (
    <svg viewBox="0 0 170 104" role="img" aria-label={`${etiqueta} ${texto}`} className="h-auto w-full max-w-[170px] overflow-visible">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1">
          <stop offset="0" stopColor={MARRON} />
          <stop offset="1" stopColor={CACAO} />
        </linearGradient>
        <filter id={`${id}-s`} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#3a2418" floodOpacity="0.28" />
        </filter>
      </defs>
      <path d="M15 92 A70 70 0 0 1 155 92" fill="none" stroke="var(--color-acento-suave)" strokeWidth="16" strokeLinecap="round" pathLength="100" />
      {relleno > 0 && (
        <path
          data-relleno
          d="M15 92 A70 70 0 0 1 155 92"
          fill="none"
          stroke={`url(#${id}-g)`}
          strokeWidth="16"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${relleno} 100`}
          filter={`url(#${id}-s)`}
        />
      )}
      <g aria-hidden="true" fontFamily="var(--font-titulo)">
        <text x="85" y="70" textAnchor="middle" fontWeight="600" fontSize="30" fill="var(--color-texto)">
          {texto}
        </text>
        <text x="85" y="88" textAnchor="middle" fontFamily="var(--font-cuerpo)" fontSize="12" fill={TINTA}>
          {etiqueta}
        </text>
        <text x="15" y="104" textAnchor="middle" fontFamily="var(--font-cuerpo)" fontSize="10" fill={TINTA}>
          0
        </text>
        <text x="155" y="104" textAnchor="middle" fontFamily="var(--font-cuerpo)" fontSize="10" fill={TINTA}>
          {max} %
        </text>
      </g>
    </svg>
  )
}

/** Barras por periodo (por ejemplo, unidades por semana), cada una con su cifra; la última va resaltada en cacao. */
export function BarrasPeriodo({ titulo, datos }: { titulo: string; datos: { etiqueta: string; unidades: number }[] }) {
  const recientes = datos.slice(-MAX_PERIODOS)
  if (recientes.length === 0) return null
  const ancho = 300
  const alto = 104
  const base = 88
  const max = Math.max(...recientes.map((d) => d.unidades))
  const paso = (ancho - 16) / recientes.length
  const bw = Math.max(2, Math.min(28, paso - 8))
  const ultimo = recientes[recientes.length - 1]!
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${titulo}: ${ultimo.etiqueta} ${ultimo.unidades}; máximo ${max}`} className="h-auto w-full">
      {[28, 58, 88].map((y) => (
        <line key={y} x1="0" x2={ancho} y1={y} y2={y} stroke={LINEA} />
      ))}
      {recientes.map((d, i) => {
        const h = alturaBarra(d.unidades, max, 70)
        const x = 8 + i * paso + (paso - bw) / 2
        const actual = i === recientes.length - 1
        return (
          <g key={`${d.etiqueta}-${i}`}>
            <rect data-barra data-actual={String(actual)} x={x} y={base - h} width={bw} height={h} rx="5" fill={actual ? CACAO : MARRON} />
            <text aria-hidden="true" x={x + bw / 2} y={base - h - 4} textAnchor="middle" fontSize="9.5" fill="var(--color-texto)">
              {d.unidades}
            </text>
            <text aria-hidden="true" x={x + bw / 2} y="101" textAnchor="middle" fontSize="9.5" fill={TINTA}>
              {d.etiqueta}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Ventas (línea y área en cacao) contra costo (línea punteada) por día; el último punto va resaltado. */
export function AreaVentasCosto({ datos }: { datos: { etiqueta: string; ventas: number; costo: number }[] }) {
  const id = useId()
  if (datos.length === 0) return null
  const geom = { ancho: 300, alto: 100, margen: 12, max: Math.max(...datos.flatMap((d) => [d.ventas, d.costo])) }
  const pv = puntosSerie(datos.map((d) => d.ventas), geom)
  const pc = puntosSerie(datos.map((d) => d.costo), geom)
  const linea = (p: { x: number; y: number }[]) => p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')
  const hayLinea = datos.length >= 2
  const area = `M${pv[0]!.x.toFixed(1)},${geom.alto - geom.margen} ${pv.map((q) => `L${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')} L${pv[pv.length - 1]!.x.toFixed(1)},${geom.alto - geom.margen} Z`
  const ultimo = datos[datos.length - 1]!
  const fin = pv[pv.length - 1]!
  return (
    <svg
      viewBox="0 0 300 108"
      role="img"
      aria-label={`Ventas y costo, ${ultimo.etiqueta}: ventas ${formatCOP(ultimo.ventas)}, costo ${formatCOP(ultimo.costo)}`}
      className="h-auto w-full"
    >
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CACAO} stopOpacity="0.35" />
          <stop offset="1" stopColor={CACAO} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[12, 45, 78].map((y) => (
        <line key={y} x1="0" x2="300" y1={y} y2={y} stroke={LINEA} />
      ))}
      {hayLinea && <path d={area} fill={`url(#${id}-a)`} />}
      {hayLinea && <polyline data-serie="ventas" points={linea(pv)} fill="none" stroke={CACAO} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
      {hayLinea && <polyline data-serie="costo" points={linea(pc)} fill="none" stroke={TINTA} strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />}
      <circle data-final cx={fin.x} cy={fin.y} r="4.5" fill={CACAO} stroke="var(--color-tarjeta)" strokeWidth="2" />
      {datos.map((d, i) => (
        <text key={`${d.etiqueta}-${i}`} aria-hidden="true" x={pv[i]!.x} y="103" textAnchor="middle" fontSize="9.5" fill={TINTA}>
          {d.etiqueta}
        </text>
      ))}
    </svg>
  )
}

/** Barras horizontales (lo más vendido): el mayor ocupa todo el ancho. Es una lista, así que se lee en orden. */
export function BarrasHorizontales({ titulo, datos }: { titulo: string; datos: { nombre: string; unidades: number }[] }) {
  const max = Math.max(0, ...datos.map((d) => d.unidades))
  return (
    <ul aria-label={titulo} className="flex flex-col gap-2 text-pequeno">
      {datos.map((d, i) => (
        <li key={`${d.nombre}-${i}`} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2">
          <span title={d.nombre} className="truncate text-texto">
            {d.nombre}
          </span>
          <span className="block h-2.5 rounded-full bg-superficie">
            <span data-barra className="block h-full rounded-full bg-gradient-to-r from-borde-fuerte to-acento" style={{ width: `${anchoBarra(d.unidades, max)}%` }} />
          </span>
          <b className="text-right font-titulo font-semibold tabular-nums">{formatCantidad(d.unidades)}</b>
        </li>
      ))}
    </ul>
  )
}
