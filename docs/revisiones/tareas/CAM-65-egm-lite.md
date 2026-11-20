# Revisión EGM-lite · CAM-65 · pantallas de gastos (T-M5-05)

Rama `CAM-65-gastos`, base `release/h3-operacion`. Revisor goldfish con contexto limpio.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/h3-operacion...CAM-65-gastos` | 0 P0, **1 P1**, 5 P2, 2 P3 (más 1 impugnado). Arreglos tras el rojo de la ronda |

## Arreglados

- **[P1] Con conexión, el gasto no aparecía en la lista ni sumaba en el total:** `sync_pull` no trae gastos (PLAN §5.1) y el escritor solo deja fila local cuando encola. `GastoNuevo` ahora la guarda al confirmar el servidor (mismo `id`, sin duplicado), con prueba que recorre guardar y «Ver gastos». Mi prueba anterior con conexión no miraba la lista y lo ocultaba.
- [P2] El total y la lista se rotulan «en este teléfono» y la limitación queda en `DECISIONS.md`.
- [P2] Tope del valor de 999.999.999 con su mensaje (antes, 20 nueves pasaban la pantalla y fallaban con un mensaje técnico de Zod).
- [P2] El foco va al primer campo con error tras un envío inválido.
- [P2] Pruebas de la fecha futura y vacía en pantalla.
- [P3] Una fila con fecha vacía o inválida muestra «Sin fecha» en vez de tirar la lista.
- [P3] Pruebas: foco y salto circular de `Chips`, sesión vencida, «aún no está lista», subida de la foto al aplicarse, cargando y error de la lista, límite de 50, doble envío con Enter y el mes anterior también en enero.

## Impugnado (CONTEST)

- [P3] La rama «revisión» de `GastoNuevo`: `gasto.registrar` nunca devuelve revisión (no tiene candidatos de duplicados); añadirla sería código que no puede ejecutarse.

Sin Blocker ni Major abiertos. Pruebas: 534 de la app, `typecheck`, `lint` y `build` en verde. Sin comprobar contra Supabase real (la prueba E2E de Playwright necesita servicios levantados).
