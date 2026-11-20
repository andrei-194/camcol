# Revisión EGM-lite · CAM-109 · tablero de Inicio con gráficos (T-D4)

Rama `CAM-109-tablero-inicio`, base `release/diseno` (`56ee0c4`). Revisor goldfish con contexto limpio.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/diseno...CAM-109-tablero-inicio` | 0 P0/P1, 3 P2, 6 P3 (más 1 impugnado). Arreglos tras el rojo `e1a114b` |

## Arreglados

- [P2] Alcance parcial sin anotar: `DatosTablero` y el tablero ahora cubren los nueve indicadores de RF-DSH-02 (costo, unidades vendidas, gastos y utilidad neta se añadieron). La tabla por artículo, el capital en inventario, el stock en cero y la caché «datos al…» quedan para T-M7 (CAM-71 a CAM-73), escrito en `tipos.ts` y `diseno.md`.
- [P2] Contraste: las barras, el arco y las barras horizontales usaban trigo claro sobre blanco (~1,6:1); ahora usan `borde-fuerte` y cacao. Cada barra de las semanas lleva su cifra.
- [P2] El gráfico de área decía siempre «Esta semana»: ahora se titula «Ventas y costo por día».
- [P3] Cifras en es-CO (`formatPorcentaje`, `formatCantidad`), variación 0 como «Sin cambio», escala del arco que sube a 100 si el margen pasa de 50, máximo de 12 barras con ancho mínimo, área con un solo día, arco en 0 % sin trazo, `title` en los nombres recortados, claves sin colisión.
- [P3] Pruebas: orden de las frases, referencias `url(#id)`, listas vacías, nombres repetidos, periodos semana y mes, todo en cero, un solo punto.

## Impugnado (CONTEST)

- [P3] Los tiempos de espera subidos en dos pruebas de T-D3: al sumar pruebas, la suite completa en paralelo vencía su espera de 1 s; sola corre en menos de 200 ms.

Sin Blocker ni Major abiertos. Pruebas: 436 de la app, `typecheck`, `lint` y `build` en verde. La prueba E2E de Playwright no se corrió (necesita Supabase levantado).
