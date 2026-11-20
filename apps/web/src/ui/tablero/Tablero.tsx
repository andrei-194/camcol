import { formatCantidad, formatPorcentaje } from '../../lib/formato'
import { BotonEnlace } from '../componentes/Boton'
import { Dinero } from '../componentes/Dinero'
import { SelectorPeriodo, type Periodo } from '../componentes/SelectorPeriodo'
import { Tarjeta } from '../componentes/Tarjeta'
import { frasesDeDecision } from './frases'
import { AreaVentasCosto, Arco, BarrasHorizontales, BarrasPeriodo } from './graficos'
import type { DatosTablero } from './tipos'

const TITULO_VENTAS: Record<Periodo, string> = { hoy: 'Ventas de hoy', semana: 'Ventas de la semana', mes: 'Ventas del mes' }
const QUE_HACER: Record<Periodo, string> = { hoy: 'Qué hacer hoy', semana: 'Qué hacer esta semana', mes: 'Qué hacer este mes' }

function Cifra({ n, texto, alerta = false }: { n: number; texto: string; alerta?: boolean }) {
  return (
    <div className="border-l border-borde pl-3 first:border-l-0 first:pl-0">
      <b className={`block font-titulo text-[1.75rem] font-semibold leading-none tabular-nums ${alerta && n > 0 ? 'text-advertencia' : 'text-texto'}`}>{n}</b>
      <span className="mt-0.5 block text-pequeno text-texto-secundario">{texto}</span>
    </div>
  )
}

function Titulo({ children, detalle }: { children: string; detalle?: string }) {
  return (
    <h2 className="mb-1 flex justify-between text-pequeno font-semibold text-texto">
      {children}
      {detalle && <span className="font-normal text-texto-secundario">{detalle}</span>}
    </h2>
  )
}

function Indicador({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <Tarjeta className="p-3">
      <span className="text-pequeno text-texto-secundario">{etiqueta}</span>
      <span className="block text-seccion">{children}</span>
    </Tarjeta>
  )
}

function Variacion({ pct }: { pct: number | null }) {
  if (pct === null) return null
  if (pct === 0) return <span className="text-pequeno font-semibold text-texto-secundario">Sin cambio frente al periodo anterior</span>
  return (
    <span className={`text-pequeno font-semibold ${pct > 0 ? 'text-exito' : 'text-peligro'}`}>
      {`${pct > 0 ? '▲' : '▼'} ${formatPorcentaje(Math.abs(pct))} % frente al periodo anterior`}
    </span>
  )
}

/** Tablero de Inicio (RF-DSH): lo urgente arriba, las ventas en grande, gráficos que ayudan a decidir y qué hacer hoy. */
export function Tablero({ datos, periodo, alCambiarPeriodo }: { datos: DatosTablero | null; periodo: Periodo; alCambiarPeriodo: (p: Periodo) => void }) {
  if (!datos) {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <p className="font-titulo text-seccion font-semibold">Aún no hay ventas</p>
        <p className="text-texto-secundario">Cuando registres pedidos, aquí verás cuánto vendes y cuánto ganas, y qué atender cada día.</p>
        <BotonEnlace to="/ventas/nuevo">Registrar el primer pedido</BotonEnlace>
      </Tarjeta>
    )
  }
  // Un margen de más de 50 % sube la escala del arco para no recortarlo sin aviso.
  const escalaArco = datos.margenPct > 50 ? 100 : 50
  return (
    <div className="flex flex-col gap-4">
      <SelectorPeriodo valor={periodo} alCambiar={alCambiarPeriodo} />

      <Tarjeta>
        <section aria-label="Lo que pide atención" className="grid grid-cols-3 gap-2">
          <Cifra n={datos.porConfirmar} texto="por confirmar" alerta />
          <Cifra n={datos.esperandoPago.cantidad} texto="esperando pago" alerta />
          <Cifra n={datos.faltantes.cantidad} texto="artículos faltantes" alerta />
        </section>
      </Tarjeta>

      <Tarjeta className="grid grid-cols-[minmax(0,10.6rem)_1fr] items-center gap-3">
        <Arco valor={datos.margenPct} max={escalaArco} etiqueta="margen" texto={`${formatPorcentaje(datos.margenPct)} %`} />
        <div className="flex flex-col gap-2">
          <div>
            <span className="text-pequeno text-texto-secundario">{TITULO_VENTAS[periodo]}</span>
            <Dinero valor={datos.ventas} className="block text-seccion" />
            <Variacion pct={datos.variacionPct} />
          </div>
          <div>
            <span className="text-pequeno text-texto-secundario">Ganancia</span>
            <Dinero valor={datos.ganancia} className="block text-seccion" />
          </div>
        </div>
      </Tarjeta>

      <div className="grid grid-cols-2 gap-3">
        <Indicador etiqueta="Costo">
          <Dinero valor={datos.costo} />
        </Indicador>
        <Indicador etiqueta="Utilidad neta">
          <Dinero valor={datos.utilidadNeta} />
        </Indicador>
        <Indicador etiqueta="Gastos">
          <Dinero valor={datos.gastos} />
        </Indicador>
        <Indicador etiqueta="Ticket promedio">
          <Dinero valor={datos.ticket} />
        </Indicador>
        <Indicador etiqueta="Pedidos">
          <b className="font-titulo font-semibold tabular-nums">{formatCantidad(datos.pedidos)}</b>
        </Indicador>
        <Indicador etiqueta="Unidades vendidas">
          <b className="font-titulo font-semibold tabular-nums">{formatCantidad(datos.unidadesVendidas)}</b>
        </Indicador>
      </div>

      <Tarjeta className="p-3">
        <Titulo detalle={`${datos.serieDiaria.length} ${datos.serieDiaria.length === 1 ? 'día' : 'días'}`}>Ventas y costo por día</Titulo>
        <AreaVentasCosto datos={datos.serieDiaria} />
      </Tarjeta>

      <Tarjeta className="p-3">
        <Titulo detalle={`${Math.min(datos.unidadesSemanales.length, 12)} semanas`}>Unidades por semana</Titulo>
        <BarrasPeriodo titulo="Unidades por semana" datos={datos.unidadesSemanales} />
      </Tarjeta>

      <Tarjeta className="p-3">
        <Titulo>Lo más vendido</Titulo>
        <BarrasHorizontales titulo="Lo más vendido" datos={datos.masVendidos} />
      </Tarjeta>

      <section aria-label={QUE_HACER[periodo]} className="flex flex-col gap-1.5 rounded-tarjeta border border-advertencia bg-advertencia-suave p-3 text-pequeno text-advertencia">
        {frasesDeDecision(datos).map((f) => (
          <p key={f}>{f}</p>
        ))}
      </section>
    </div>
  )
}
