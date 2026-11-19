import { Segmentos } from './Segmentos'

export type Periodo = 'hoy' | 'semana' | 'mes'

const OPCIONES: { valor: Periodo; texto: string }[] = [
  { valor: 'hoy', texto: 'Hoy' },
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
]

/** Periodo del tablero (RF-DSH-01): hoy, semana o mes. */
export function SelectorPeriodo({ valor, alCambiar }: { valor: Periodo; alCambiar: (p: Periodo) => void }) {
  return <Segmentos etiqueta="Periodo" opciones={OPCIONES} valor={valor} alCambiar={alCambiar} />
}
