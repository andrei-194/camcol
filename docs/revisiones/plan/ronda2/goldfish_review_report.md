# Goldfish Annotated Review Report · ronda 2
nStatus: resolved (ronda 2, auto accept: 15 correcciones aplicadas a PLAN, SPEC RN-PRE-02, TASKS y DECISIONS)

**Target:** `docs/spec/PLAN.md` v1.1 (líneas 1-450) · Etapa 9
**Origen:** `implementation_readiness_report.md` (mismo directorio)

Comprobé en el repo: el Blocker es cierto (`servicioAuth.cerrarSesion` no llama a `limpiarCacheDeServidor`; nadie la invoca); el prefijo `RN-PAG-05:` no cumple la regex `^[A-Z][A-Z0-9_]*(:|$)` de `0003_aplicar_ops.sql` L132 y saldría como `ERROR_INTERNO`; `sync_pull` (`0005` L56-58) calcula `greatest(...)` **sin** filtrar por dirección y solo el arreglo `pagos` filtra `'cobro'`; SPEC RF-SYN-07 dice «la cola se detiene», RN-PRE-02 dice «se respeta lo pactado» y RF-DOC-01 dice que la `confirmacion` va **sin consecutivo**.

| Id | Sev | Categoría | Edición propuesta |
|---|---|---|---|
| codebase-details-2-1 | Blocker | PROPOSE FIX | §9: la limpieza **no** ocurre al cerrar sesión; ocurre **al iniciar sesión con un usuario distinto** del recordado (`camino.auth.usuario`), antes del primer pull. Añadirlo a T-M2-04 (CAM-44) en `TASKS.md`. |
| 2-1 / 2-2 / style-2-4 | Major | PROPOSE FIX | §4.3: añadir `pv_totales` (reemplazo de función) a la lista de objetos de 0017, con `E_TOTAL` solo si `total` cambia. |
| 2-2 / 2-5 | Major | PROPOSE FIX | Tabla de triggers con columna «código»: RN-PAG-03 → `E_ESTADO`; RN-PAG-04 → `E_SOBREPAGO`; RN-PAG-05 → `E_PAGO_INMUTABLE`; motivo vacío → `DATOS_INVALIDOS`. El ID de la regla va dentro del mensaje, no como prefijo. Orden de validación: estado, motivo, tope. |
| 2-3 / 2-3 | Major | PROPOSE FIX | `fecha` (date) → `pagos.fecha` (timestamptz) con `((p->>'fecha')::date)::timestamp at time zone 'America/Bogota'`; por defecto `now()`. |
| 2-4 / 2-4 | Major | PROPOSE FIX | En un PV `cancelado` o `devuelto` los **cobros** no se editan ni se borran (`E_ESTADO`); en `recibido`/`confirmado`, `update` del `valor` de un cobro revalida el tope. |
| 2-5 | Major | PROPOSE FIX | §10: suite nueva `tests/integration/reembolsos.test.mjs` (dos conexiones sobre el último saldo) y T-M1-18 la exige; `ops_extremo_a_extremo` cubre `pago.reembolsar`. |
| 2-8 / style-2-6 | Major | PROPOSE FIX (**decisión**) | §5.2: el cliente envía las ops **de una en una**, por `created_at`, y se detiene en la primera que no sea `ok`/`ya_aplicada` (cumple RF-SYN-07 y elimina el problema de las dependientes). El contrato del servidor por lotes (D-013) no cambia. |
| 2-9 / 2-8 | Major | PROPOSE FIX | §5.2/§5.1: en `revision`, la UI escribe `resolucion` dentro de `datos` de la misma fila (no es edición del usuario) y la devuelve a `pendiente`; la fila local `_pendiente` se conserva hasta resolver; campos de la fila: `error?: {codigo, mensaje}`, `resultado?: {candidatos}`. |
| 2-10 / style-2-1, 2-2 / 2-12 | Major | PROPOSE FIX (**decisión**) | §4.3: quitar el boceto antiguo que «valida» el precio; vale lo de 0010 (el servidor usa `precio_para` y avisa `PRECIO_CAMBIO`); quitar `stock_visto_en` del payload. **SPEC RN-PRE-02** se corrige a esa regla (lo aceptó el socio) y se anota en `DECISIONS.md`. |
| 2-11 / 2-6 / style-2-3 | Major | PROPOSE FIX + diferir | Principio 3 y §2: las ops por `aplicar_ops` son la ruta de escritura de lo que admite offline; cobros, cambios de estado y edición de maestros son **solo online** por `UPDATE`/RPC con los triggers como autoridad (§4.5). El contrato de «cobrar y finalizar» atómico se define al iniciar T-M4-05/06. |
| 2-13 | Major | PROPOSE FIX | §4.4: el cliente resta **2 minutos** al cursor (constante). |
| codebase-details-2-7 | Major | PROPOSE FIX + diferir | §5.1: la subida de fotos y su `path` se definen al iniciar T-M2-08 (CAM-48); se deja esa nota. |
| codebase-details-2-9 | Major | PROPOSE FIX | §4.3 lecturas: solo el arreglo `pagos` de `sync_pull` filtra por dirección; el `greatest` ya no filtra. |
| style-2-5 | Major | PROPOSE FIX | §5.2: **red** = `TypeError`, `AbortError`, timeout o 502-504; **rechazo** = SQLSTATE o `status:error`; todo lo demás (401, 429, otros 5xx) = «no se aplicó»: se encola con aviso y 401 pide volver a entrar. Se quita «HTTP 0». |
| style-2-7 | Major | PROPOSE FIX | §7: quitar el número provisional `BOR-<device>-<n>`; la `confirmacion` va sin consecutivo (RF-DOC-01). |

**Nits (17):** PROPOSE FIX los de 0017 (columnas de `v_por_reembolsar`, nombres), la terminología (`PV`/`OC`, «pedido») y los restos en SPEC/AGENTS/DECISIONS; DECLINE el resto. Detalle en `implementation_readiness_report.md`.
