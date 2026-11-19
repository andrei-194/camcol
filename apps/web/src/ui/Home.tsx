import { Aviso } from './componentes/Aviso'
import { Pagina } from './componentes/Pagina'
import { BannerPendientes } from './pendientes/BannerPendientes'

/** Inicio. Los accesos viven en la barra inferior y en «Más»; el tablero de ventas llega con T-D4 y T-M7. */
export function Home() {
  return (
    <Pagina titulo="Camino Col" subtitulo="Del campo colombiano a tu mesa." marca>
      <BannerPendientes />
      <Aviso tono="info">Tu tablero de ventas, compras e inventario llega pronto.</Aviso>
    </Pagina>
  )
}
