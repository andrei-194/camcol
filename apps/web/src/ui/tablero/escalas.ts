// Escalas de los gráficos del tablero: funciones puras que convierten datos en medidas de SVG.

const valido = (n: number) => Number.isFinite(n) && n > 0

/** Alto de una barra (0 a `alto`). Valores no válidos, negativos o un máximo de cero no dibujan nada. */
export function alturaBarra(valor: number, max: number, alto: number): number {
  if (!valido(valor) || !valido(max)) return 0
  return Math.min(alto, (valor / max) * alto)
}

/** Ancho de una barra horizontal como porcentaje del máximo (0 a 100). */
export function anchoBarra(valor: number, max: number): number {
  return alturaBarra(valor, max, 100)
}

/** Cuánto del arco se llena (0 a 100) con `valor` sobre una escala de 0 a `max`. */
export function proporcionArco(valor: number, max: number): number {
  return Math.round(alturaBarra(valor, max, 100) * 100) / 100
}

export interface AreaSerie {
  ancho: number
  alto: number
  margen: number
  max: number
}

/** Puntos (x, y) de una serie repartida a lo ancho; el máximo toca el borde superior del margen. */
export function puntosSerie(serie: number[], { ancho, alto, margen, max }: AreaSerie): { x: number; y: number }[] {
  const util = ancho - 2 * margen
  const altoUtil = alto - 2 * margen
  return serie.map((v, i) => ({
    x: serie.length === 1 ? ancho / 2 : margen + (i * util) / (serie.length - 1),
    y: alto - margen - alturaBarra(v, max, altoUtil),
  }))
}
