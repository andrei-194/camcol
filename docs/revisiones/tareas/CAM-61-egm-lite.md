# Revisión EGM-lite · CAM-61 · pantalla «Nueva compra» (T-M5-01)

Rama `CAM-61-nueva-compra`, base `release/h3-operacion`. Revisor goldfish con contexto limpio, que verificó contra el SQL real.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/h3-operacion...CAM-61-nueva-compra` | **1 P0**, 2 P1, 5 P2, 4 P3 (más 1 impugnado). Arreglos tras el rojo `4efa679` |

## Arreglados

- **[P0] El total del cliente podía diferir del del servidor y la compra inmediata fallaba con `E_PAGO`:** el servidor redondea cada línea al centavo y luego suma (`oc_recalcular`); el cliente sumaba en coma flotante. Ahora usa enteros, igual que el servidor, en el pago, en la fila local y en el resumen de Pendientes, con una **prueba de paridad con propiedades contra Postgres real (PGlite)** que antes fallaba (1,00 contra 1,01) y ahora pasa.
- **[P1] `0.500` se leía como 500:** un grupo de miles no puede empezar en cero, y bajo la cantidad se muestra cómo se interpretó, con la unidad.
- **[P1] Proveedor fantasma tras «usar el existente»:** `completar` en la outbox borra el tercero provisional y reapunta la orden; corrige también `tercero.crear`.
- [P2] Avisos si no se puede leer el catálogo o los proveedores, o si está vacío; frenar lo elegido que desapareció; errores por línea limpios al agregar o quitar; foco al mensaje del total; unidad visible; tope de cantidad de 999.999.
- [P3] Campo `fecha` muerto y prueba vacía quitados; ramas probadas (401, fallo del servidor, sin escritor, foto en encargo); fila local de la orden con la forma de `sync_pull`; `DECISIONS.md` al día.

## Impugnado (CONTEST)

- [P3] Prueba del timeout de red (la cubre `writer.test`) y del segundo toque en el mismo cuadro (el botón está deshabilitado mientras guarda).

Sin Blocker ni Major abiertos. Pruebas: 627 de la app (incluida la paridad con Postgres), `typecheck`, `lint` y `build` en verde. Sin comprobar contra Supabase real (la prueba E2E de Playwright necesita servicios levantados).
