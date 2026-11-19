import { Aviso } from './componentes/Aviso'
import { Pagina } from './componentes/Pagina'

/** Pantalla de una función que aún no está construida (llega con su hito). Mantiene la navegación completa. */
export function Proximamente({ titulo, volverA, detalle }: { titulo: string; volverA?: string; detalle: string }) {
  return (
    <Pagina titulo={titulo} volverA={volverA}>
      <Aviso tono="info">{`${detalle} Esta pantalla llega pronto.`}</Aviso>
    </Pagina>
  )
}
