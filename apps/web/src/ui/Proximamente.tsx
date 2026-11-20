import { Aviso } from './componentes/Aviso'
import { BotonEnlace } from './componentes/Boton'
import { Pagina } from './componentes/Pagina'

/** Pantalla de una función que aún no está construida (llega con su hito). Mantiene la navegación completa. */
export function Proximamente({
  titulo,
  volverA,
  detalle,
  accion,
}: {
  titulo: string
  volverA?: string
  detalle: string
  /** Un camino ya construido hacia lo que sí se puede hacer hoy. */
  accion?: { a: string; texto: string }
}) {
  return (
    <Pagina titulo={titulo} volverA={volverA}>
      {accion && <BotonEnlace to={accion.a}>{accion.texto}</BotonEnlace>}
      <Aviso tono="info">{`${detalle} Esta pantalla llega pronto.`}</Aviso>
    </Pagina>
  )
}
