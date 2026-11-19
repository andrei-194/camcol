# Revisión EGM-lite · CAM-104 · seed de los socios y `db:reiniciar`

Rama `CAM-104-seed-socios`, base `main` (`9eb6adb`). Revisores goldfish con contexto limpio.

| Ronda | Objeto | Resultado |
| --- | --- | --- |
| 1 | Spec (checklist) | 5 P1, 4 P2, 3 P3; los 10 arreglos se incorporaron antes de implementar |
| 2 | Diff `9eb6adb..4f14466` | 2 P1, 2 P2, 2 P3: fallo de red sin traza, `db:reiniciar` validaba después de borrar, mensaje de login, contrato de secretos, runbook, casos de borde de las pruebas. Arreglados en `c6f0c35` |
| 3 | Diff `9eb6adb..c6f0c35` | 0 P0-P2, 3 P3: `esFalloDeRed` demasiado amplio, login después del `insert` en `miembros`, `fetch` sin timeout. Arreglados en `a023606` (prueba en rojo en `270ffe4`) |

## Impugnados (CONTEST)

- Ejecución concurrente (422 de Auth): `db:reiniciar` es serial y el login de verificación lo delataría.
- Mensaje de login con cuenta sin confirmar: las cuentas se crean con `email_confirm: true`.
- Pruebas automáticas de la orquestación de `scripts/socios.mjs`: leerían el `socios.local.json` real; las cubren las pruebas de la parte pura y la verificación empírica (plantilla rechazada sin borrar datos, contraseña distinta, reparación de `miembros`, `db:reiniciar` completo).

## Notas (Nit)

- El `esLocal` de `scripts/cargar-catalogo.mjs` es más débil que `esApiLocal`: unificarlo en otra tarea.

Sin Blocker ni Major abiertos. Pruebas: `test:db` 20 suites sin fallas.
