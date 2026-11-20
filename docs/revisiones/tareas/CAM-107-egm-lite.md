# Revisión EGM-lite · CAM-107 · componentes base del rediseño (T-D2)

Rama `CAM-107-componentes-base`, base `release/diseno` (`645befd`). Revisor goldfish con contexto limpio.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/diseno...CAM-107-componentes-base` | 0 P0/P1, 2 P2, 2 P3 (más 1 impugnado). Arreglos en el commit siguiente al rojo de la ronda |

## Arreglados

- [P2] Los selects (`campos.tsx`, `TerceroNuevo.tsx`) seguían sobre el papel mientras los campos de texto pasaron a blanco: ahora todos usan `bg-tarjeta`, y una prueba recorre `src/ui` para impedir que vuelva a pasar.
- [P2] `diseno.md` decía que `Tarjeta` usa `shadow-tarjeta` y que `CampoTexto` lleva sombra: corregido.
- [P3] `Dinero` pintaba «$ NaN» con valores no finitos y su `value` no coincidía con lo mostrado con decimales: ahora muestra «—» y redondea al entero.
- [P3] Pruebas de `Boton` secundario, `BotonEnlace` y `Segmentos` con valor fuera de las opciones o lista vacía.

## Impugnado (CONTEST)

- [P3] La prueba de `Dinero` usa el mismo `Intl.NumberFormat` que `formatCOP`: es deliberado, comprueba que `Dinero` solo parte el resultado sin alterar la cifra; el formato ya tiene sus pruebas en `formato.test.ts`.

Sin Blocker ni Major abiertos. Pruebas: 349 de la app, `typecheck`, `lint` y `build` en verde.
