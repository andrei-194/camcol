import { useState } from 'react'
import { Pagina } from './componentes/Pagina'
import type { Periodo } from './componentes/SelectorPeriodo'
import { BannerPendientes } from './pendientes/BannerPendientes'
import { Tablero } from './tablero/Tablero'

/**
 * Inicio: el tablero (RF-DSH). Los datos de ventas llegan con T-M7; mientras no existan muestra un estado vacío que
 * invita a registrar el primer pedido. Los accesos viven en la barra inferior y en «Más».
 */
export function Home() {
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  return (
    <Pagina titulo="Camino Col" subtitulo="Del campo colombiano a tu mesa." marca>
      <BannerPendientes />
      <Tablero datos={null} periodo={periodo} alCambiarPeriodo={setPeriodo} />
    </Pagina>
  )
}
