// Datos que pinta el tablero de Inicio (RF-DSH-02 a 04). Los calcula el servidor (regla 3); T-M7 los conecta.
export interface DatosTablero {
  ventas: number
  costo: number
  ganancia: number
  margenPct: number
  pedidos: number
  ticket: number
  /** Cambio de las ventas frente al periodo anterior, en %; `null` si no hay con qué comparar. */
  variacionPct: number | null
  /** Ventas y costo por día del periodo. */
  serieDiaria: { etiqueta: string; ventas: number; costo: number }[]
  /** Unidades vendidas por semana (las últimas 8). */
  unidadesSemanales: { etiqueta: string; unidades: number }[]
  /** Ordenados de más a menos vendido. */
  masVendidos: { nombre: string; unidades: number }[]
  porConfirmar: number
  esperandoPago: { cantidad: number; valor: number }
  faltantes: { cantidad: number; ejemplo?: string }
}
