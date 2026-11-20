# Revisión EGM-lite · CAM-111 · PWA: íconos de la web, color de la barra y arranque (T-D6)

Rama `CAM-111-pwa-iconos`, base `release/diseno` (`cdb2483` y siguientes). Revisor goldfish con contexto limpio.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/diseno...CAM-111-pwa-iconos` | 0 P0/P1, 5 P2, 2 P3. Arreglos tras el rojo de la ronda |
| 2 | Mismo diff, tras los arreglos | 0 P0/P1, 1 P2, 4 P3, todos sobre las pruebas. Arreglos tras el rojo de `png.test.ts` |

## Arreglados

- [P2] `favicon.ico` fuera del precaché: ahora está en `includeAssets`, con prueba.
- [P2] Pruebas débiles de íconos: ahora decodifican los PNG (`src/test/png.ts`) y exigen opacidad en todos los píxeles, fondo oscuro y marca clara, y la marca del maskable dentro del 80 % central; el `.ico` se lee y debe traer la entrada de 48 px.
- [P2] Comparación por cadena exacta de `index.html`: lectura tolerante al orden de atributos; se comprueba que `favicon.svg` exista y que `short_name` coincida con el título de iOS.
- [P2] `black` no se funde con el café en iPhone: `diseno.md` ya no lo afirma; documenta la franja negra y la decisión pendiente de `black-translucent` con `viewport-fit=cover`.
- [P3] Nota de que los márgenes de zona segura no actúan sin `viewport-fit=cover`, el `.ico` de 16, 32 y 48 px verificado, `DECISIONS.md` en pasado y lista «Verificar en el teléfono».

## Ronda 2

- [P2] Un `expect` por píxel (~593 mil llamadas, riesgo de lentitud y mensajes sin contexto): ahora se cuentan los píxeles no opacos y hay un solo `expect` con el número en el mensaje.
- [P3] El decodificador de PNG de las pruebas (`src/test/png.ts`) ya falla con mensaje claro ante un filtro desconocido, datos truncados o un formato no compatible, y tiene sus propias pruebas (`png.test.ts`, filtros 0 a 4 incluidos).
- [P3] Zona segura del maskable: ahora exige marca presente y toda dentro del círculo de 80 % (antes, un cuadrado y pasaba en vacío).
- [P3] `diseno.md` acota lo que afirma del precaché y del `.ico`; el precaché real se comprobó en el `sw.js` del build. La lectura de `index.html` ignora comentarios.

Sin Blocker ni Major abiertos. Quedan sin comprobar en dispositivo real: color de la barra, arranque, ícono instalado, favicon de escritorio y teclado abierto.
