# Revisión EGM-lite · CAM-111 · PWA: íconos de la web, color de la barra y arranque (T-D6)

Rama `CAM-111-pwa-iconos`, base `release/diseno` (`cdb2483` y siguientes). Revisor goldfish con contexto limpio.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/diseno...CAM-111-pwa-iconos` | 0 P0/P1, 5 P2, 2 P3. Arreglos tras el rojo de la ronda |

## Arreglados

- [P2] `favicon.ico` fuera del precaché: ahora está en `includeAssets`, con prueba.
- [P2] Pruebas débiles de íconos: ahora decodifican los PNG (`src/test/png.ts`) y exigen opacidad en todos los píxeles, fondo oscuro y marca clara, y la marca del maskable dentro del 80 % central; el `.ico` se lee y debe traer la entrada de 48 px.
- [P2] Comparación por cadena exacta de `index.html`: lectura tolerante al orden de atributos; se comprueba que `favicon.svg` exista y que `short_name` coincida con el título de iOS.
- [P2] `black` no se funde con el café en iPhone: `diseno.md` ya no lo afirma; documenta la franja negra y la decisión pendiente de `black-translucent` con `viewport-fit=cover`.
- [P3] Nota de que los márgenes de zona segura no actúan sin `viewport-fit=cover`, el `.ico` de 16, 32 y 48 px verificado, `DECISIONS.md` en pasado y lista «Verificar en el teléfono».

Sin Blocker ni Major abiertos. Quedan sin comprobar en dispositivo real: color de la barra, arranque, ícono instalado, favicon de escritorio y teclado abierto.
