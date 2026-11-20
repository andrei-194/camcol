# Revisión EGM-lite · CAM-110 · pantallas existentes con el rediseño (T-D5)

Rama `CAM-110-pantallas-existentes`, base `release/diseno` (`0a7334f`). Revisor goldfish con contexto limpio.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Diff `release/diseno...CAM-110-pantallas-existentes` | 0 P0/P1, 4 P2, 5 P3 (más 1 impugnado). Arreglos tras el rojo `234a4e6` |

## Arreglados

- [P2] «Volver» a `/mas` confundía a quien llegaba por el aviso de Inicio o la barra de estado: ahora regresa a la pantalla de la que vienes si hay historial dentro de la app (sin interceptar clics con tecla modificadora) y, si se abrió directo, usa el destino fijo del `href`. Pruebas con historial y con acceso directo.
- [P2] Sin pruebas de los destinos de «Volver»: ahora las hay en Pendientes, Catálogo, Terceros, Ajustes y Cómo instalar.
- [P2] `asyncUtilTimeout` igualaba el límite por prueba: ahora 3 s y `testTimeout` de 15 s, con un comentario honesto sobre su origen.
- [P2] «Pendientes con selección y botones» no estaba cubierto ni anotado: queda anotado como pendiente en `diseno.md`; se aplicó lo barato (nombres de candidatos en cursiva, cubierto por la prueba de candidatos).
- [P3] Guarda de estilo robusta (ruta desde el archivo, `divide-y`, límite de 10 s), `diseno.md` al día, Ajustes con una tarjeta por bloque, y el lema solo en el login (`PantallaCentrada` recibe el subtítulo).

## Impugnado (CONTEST)

- [P3] Cuadros hechos a mano con `border-2 border-peligro` o `border-advertencia` (confirmaciones y errores): superficies de significado propio, deliberadamente no son tarjetas. El «Volver» de Cómo instalar queda resuelto por el arreglo de «Volver» con historial.

Sin Blocker ni Major abiertos. Pruebas: 451 de la app, `typecheck`, `lint` y `build` en verde. La prueba E2E de Playwright no se corrió (necesita Supabase levantado). Capturas a 360 px: pendientes.
