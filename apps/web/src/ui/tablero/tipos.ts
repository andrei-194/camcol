// Datos que pinta el tablero de Inicio. Los calcula el servidor (regla 3); T-M7 los conecta.
//
// Alcance de T-D4 (CAM-109), solo la capa visual:
//  - RF-DSH-01 (selector de periodo): el selector está; la comparación con el periodo anterior llega en `variacionPct`.
//  - RF-DSH-02 (indicadores): ventas, costo, ganancia, margen, unidades, pedidos, ticket, gastos y utilidad neta.
//  - RF-DSH-03: el gráfico de unidades por semana está; la tabla por artículo y el total del mes frente al mes
//    anterior los construye T-M7-02 (CAM-71).
//  - RF-DSH-04: «por confirmar», «esperando pago» y «faltantes» están; capital en inventario y artículos con stock en
//    cero los construye T-M7-03 (CAM-72). Los pendientes de subir los muestran el banner y la barra de estado.
//  - RF-DSH-05 (caché «datos al…»): T-M7-04 (CAM-73).
export interface DatosTablero {
  ventas: number
  costo: number
  ganancia: number
  margenPct: number
  pedidos: number
  ticket: number
  unidadesVendidas: number
  gastos: number
  utilidadNeta: number
  /** Cambio de las ventas frente al periodo anterior, en %; `null` si no hay con qué comparar. */
  variacionPct: number | null
  /** Ventas y costo por día del periodo. */
  serieDiaria: { etiqueta: string; ventas: number; costo: number }[]
  /** Unidades vendidas por semana (el gráfico dibuja como máximo las últimas 12). */
  unidadesSemanales: { etiqueta: string; unidades: number }[]
  /** Ordenados de más a menos vendido. */
  masVendidos: { nombre: string; unidades: number }[]
  porConfirmar: number
  esperandoPago: { cantidad: number; valor: number }
  faltantes: { cantidad: number; ejemplo?: string }
}
