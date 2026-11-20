# Revisión EGM-lite · CAM-108 · marco de la app (T-D3)

Rama `CAM-108-marco-app`, base `release/diseno` (`86f7664`). Revisor goldfish con contexto limpio.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/diseno...CAM-108-marco-app` | 0 P0/P1, 2 P2, 7 P3 (más 1 impugnado). Arreglos tras el rojo `54cdcfd` |

## Arreglados

- [P2] El fondo del menú «+» era solo visual: el foco se escapaba a la barra tapada y el menú sobrevivía a un cambio de ruta. Ahora se cierra al navegar (estado ligado a la ruta), con Tab y con Escape; Inicio y Fin recorren las acciones.
- [P2] Pruebas débiles del marco: flechas, `aria-controls`, foco al cerrar, navegación de la acción, cierre por ruta, `aria-current` en subrutas, contador con errores, colores de los indicadores, `volverA`, aviso de Inicio y holguras.
- [P3] El foco ya no vuelve al «+» al elegir una acción; el nombre del botón es fijo («Acciones rápidas») y `aria-expanded` dice el estado; holgura inferior de 8,5 rem; el aviso de actualización flota por encima de la barra y del «+»; contador de Más en la escala de tamaños, con su par de contraste probado y un comentario erróneo corregido; `diseno.md` al día, con «Capas y menú flotante».

## Impugnado (CONTEST)

- [P3] Doble suscripción a los pendientes (`BarraInferior` e `IndicadoresEstado`): sin error funcional; compartirla exigiría un contexto nuevo solo para evitar una lectura liviana.

## Pendiente de verificar `[⏳ ACK]`

- Comportamiento de la barra inferior y del «+» con el teclado del teléfono abierto (hipótesis del revisor, sin medir). Se confirma en la prueba en el teléfono; no se arregla antes de verlo.

Sin Blocker ni Major abiertos. Pruebas: 387 de la app, `typecheck`, `lint` y `build` en verde. La prueba E2E de Playwright no se corrió (necesita Supabase levantado).
