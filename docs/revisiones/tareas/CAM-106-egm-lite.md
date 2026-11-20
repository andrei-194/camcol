# Revisión EGM-lite · CAM-106 · tokens, fuentes autoalojadas y papel (T-D1)

Rama `CAM-106-tokens-tipografia`, base `release/diseno` (`bb6bc08`). Revisor goldfish con contexto limpio, sobre el diff completo.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/diseno...CAM-106-tokens-tipografia` | 0 P0/P1, 2 P2, 5 P3. Sin clases rotas ni regresiones de contraste en las pantallas actuales. Arreglos en `5a82a7b` (prueba en rojo en `5fe09ef`) |

## Arreglados

- [P2] `diseno.md` describía como vigente lo que aún no existe: ahora separa lo hecho en T-D1 del objetivo de T-D2 a T-D6 y conserva la tabla de componentes actuales.
- [P2] `font-variation-settings: 'opsz'` fijaba el eje óptico de Fraunces: se quitó y lo ajusta el navegador; una prueba lo impide.
- [P3] Sombra de `Tarjeta` sin cobertura, pruebas de fuentes débiles (firma `wOF2`, rangos de peso, precaché), par de contraste de la selección y pares citados en el documento, y dos frases inexactas de `diseno.md`.

## Impugnado (CONTEST)

- [P3] Tokens y clases sin uso todavía (`arena`, `text-cifra`, `.nombre`, `.camino-punteado`) y flechas fuera del recorte de la fuente: las consumen T-D2 a T-D6 (CAM-107 a CAM-111) y la navegación usará íconos SVG.

Sin Blocker ni Major abiertos. Pruebas: 327 de la app, `typecheck`, `lint` y `build` en verde.
