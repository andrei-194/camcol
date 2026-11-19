# Revisión egm-lite · CAM-103 (arranque desde cero) y CAM-102 (regla EGM)

Base: `origin/release/h3` = `d2f9e8f`. Tres rondas de un revisor goldfish de contexto limpio (`egm-codebase-details`), lanzadas por el socio con `/egm:egm-lite`.

| Ronda | Hallazgos | Resultado |
| --- | --- | --- |
| 1 | 3 P1, 3 P2, 3 P3 (docs contradictorias, usuario `miembros` sin explicar, mensaje engañoso con base remota, errores sin traducir, pruebas frágiles) | 8 corregidos, 4 contestados con razón |
| 2 | 2 P2 (URL del helper doble codificada; `db:reset` borra usuarios) | corregidos |
| 3 | 1 P2, 1 P3 (`db:reset` borra también el catálogo; usuario no integrado en los pasos) | corregidos |

**Contestados (ronda 1):** helper justificado por la cobertura de errores; prueba de la regla 14 va como tarea aparte (la guarda no cambió); `process.exit(2)` en el `catch` es inocuo; `DECISIONS.md:195` es una nota histórica fechada.

**Pendiente:** probar el arranque desde un clon limpio (prueba empírica); crear `npm run db:socio` o un seed para no repetir el usuario tras cada `db:reset`.

Detalle de la lista de verificación: ver historial del commit.
