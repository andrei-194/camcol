# Goldfish Review Report

**Target:** `D:/projects/Freelancer/PROYECTO-CAMINO/docs/spec/PLAN.md` (v1.1, líneas 1-450)

Etapa 9 (Implementation Readiness Test), ronda 2. Fuera de alcance por decisión previa: dashboard (§5.6), valores del CSP (§6), plantillas de PDF (§7) y `bloqueada` en `db.ts` (CAM-45). La sección 0017/reembolsos (§4.3) se evaluó como contrato pendiente.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details` | completed |
| `egm-style` | completed |

Resumen: 1 Blocker, 17 Major, 24 Nit tras deduplicar. Los ids originales se conservan y los duplicados se agrupan bajo un mismo hallazgo.

## Prioritized Findings (Blockers -> Major -> Nits)

### Blocker

#### codebase-details-2-1 (= implementation-readiness-2-12) - Severity: Blocker
* **Reviewer Lens:** `codebase-details` (implementation-readiness lo calificó Major)
* **Affected Scope:** L384 (§9)
* **Discrepancy Description**: El PLAN dice que cerrar sesión llama a `limpiarCacheDeServidor`. `servicioAuth.cerrarSesion()` solo hace `signOut({scope:'local'})` y borra `camino.auth.usuario`. Nadie invoca `limpiarCacheDeServidor` (`db.ts:132`). Ninguna tarea cierra el hueco (T-M2-06 cubre advertencia y exportación).
* **Rationale & Recommendation**: Un agente asumirá que caché y cursor ya se limpian y un segundo usuario vería el snapshot del primero. Marcar la llamada como pendiente, asignarla a una tarea (T-M2-06) y definir cuándo se limpia (cierre de sesión o cambio de usuario).

### Major

#### implementation-readiness-2-1 / codebase-details-2-2 / style-2-4 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `codebase-details`, `style`
* **Affected Scope:** L227, L237
* **Discrepancy Description**: La lista de objetos de 0017 es "cerrada" y dice "No se toca ninguna otra función", pero L237 exige que `pv_totales` rechace `total < cobrado_neto`. Eso obliga a reemplazar `trg_pv_totales()` de 0001, que no está en la lista. Tampoco se dan el código de error ni el orden de trigger. La regla correría en cada UPDATE del pedido y bloquearía devolver o editar pedidos anteriores a 0017 con cobros mayores al total.
* **Rationale & Recommendation**: Añadir el objeto a la lista, fijar nombre, evento y código (p. ej. `E_SOBREPAGO`). Aplicar la regla solo cuando `total` cambie (`is distinct from old.total`).

#### implementation-readiness-2-2 / codebase-details-2-5 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `codebase-details`
* **Affected Scope:** L214-222, L229-237
* **Discrepancy Description**: Varias reglas de trigger no tienen código de error ni texto (RN-PAG-03, RN-PAG-05, motivo, tope, rechazo por totales). Un mensaje con prefijo `RN-PAG-05:` no cumple la regex de 0003 (`^[A-Z][A-Z0-9_]*(:|$)`) y saldría como `ERROR_INTERNO`. No se fija el orden de validación del op. La regla "valor entero" solo está en el op, y no se dice si el INSERT directo de reembolsos está permitido.
* **Rationale & Recommendation**: Añadir a la tabla de triggers una columna "código y prefijo del mensaje" (p. ej. `E_ESTADO`, `E_SOBREPAGO`, `E_REEMBOLSO_INMUTABLE`). Fijar el orden de validación y la política de INSERT directo.

#### implementation-readiness-2-3 / codebase-details-2-3 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `codebase-details`
* **Affected Scope:** L205-208, L217
* **Discrepancy Description**: `fecha` del payload es una fecha, pero `pagos.fecha` es `timestamptz` (0001:374). Un `::timestamptz` en sesión UTC deja 19:00 del día anterior en Bogotá. `resumen_periodo.reembolsos` agrupa por día de Bogotá y E17 daría el día equivocado. No se define el valor por defecto (`now()` o medianoche de Bogotá) ni contra qué se compara "mañana".
* **Rationale & Recommendation**: Fijar la conversión, p. ej. `((p->>'fecha')::date)::timestamp at time zone 'America/Bogota'`, el default y la comparación del límite.

#### implementation-readiness-2-4 / codebase-details-2-4 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `codebase-details`
* **Affected Scope:** L229-237
* **Discrepancy Description**: El control de sobrepago cubre solo el INSERT de cobros. Quedan abiertos el UPDATE de `valor` en un PV `confirmado`, el UPDATE o DELETE de un cobro en un PV `cancelado` (0011 solo bloquea `finalizado` y `devuelto`) y mover un cobro a otro `pedido_venta_id`. La invariante `0 ≤ cobrado_neto ≤ total` no queda garantizada pese a "cualquier ruta" (L229).
* **Rationale & Recommendation**: Definir el comportamiento de `pagos_sobrepago` ante UPDATE y DELETE. Lo más simple es rechazar cambios a cobros de un PV `cancelado` y revalidar el tope en UPDATE.

#### implementation-readiness-2-5 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** L237, L394-407 (§10)
* **Discrepancy Description**: El candado `for update` contra reembolsos o cobros simultáneos no tiene prueba posible en PGlite (una sola conexión). §10 no incluye suite de integración de reembolsos y `ops_extremo_a_extremo` dice "Ops 0007-0012".
* **Rationale & Recommendation**: Añadir en `tests/integration/` un caso de dos conexiones sobre el último saldo y ampliar `ops_extremo_a_extremo` a 0017.

#### implementation-readiness-2-8 / style-2-6 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `style`
* **Affected Scope:** L125, L128, L341
* **Discrepancy Description**: SPEC RF-SYN-07 dice que si una op falla o queda en revisión la cola se detiene. El servidor aplica el resto del lote (0003, sin `exit`) y el cliente solo deja de enviar "más lotes", pero §5.2 sube todo en un único lote. Una dependiente de una fallida recibe `E_REF` y queda en `error` sin recuperación. Tampoco se define si una op en `error` se reenvía.
* **Rationale & Recommendation**: Definir el tamaño del lote (una op por llamada más su `adjunto.vincular`, o parar en el primer `error`/`revision`) o enmendar RF-SYN-07. Aclarar el reenvío.

#### implementation-readiness-2-9 / codebase-details-2-8 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `codebase-details`
* **Affected Scope:** L146-148, L165, L183, L323-324, L333, L341, L344
* **Discrepancy Description**: Con `usar_existente` el servidor devuelve otro `id`, pero §5.1 dice que el pull reemplaza la fila local "con el mismo id". La fila local pendiente queda huérfana y no se dice cómo reasignar `proveedor_id` en la OC local. Reenviar con `resolucion` exige modificar `datos` conservando el `op_id`, contra RF-SYN-04. L324 dice que `error` guarda "el código y el mensaje", pero `OpOutbox` no declara esos campos.
* **Rationale & Recommendation**: Especificar los campos de `outbox` (`resultado`, `resolucion`, `codigo`, `mensaje`), la mutación permitida y la limpieza de filas locales.

#### implementation-readiness-2-10 / style-2-1 / style-2-2 / codebase-details-2-12 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `style`, `codebase-details`
* **Affected Scope:** L146, L148-152, L154-170
* **Discrepancy Description**: L162 dice que el servidor valida `precio_unitario ≈ precio_lista·(1−pct/100)` con tolerancia, mientras L167-168 dicen que siempre recalcula y sobrescribe. El JSON incluye `stock_visto_en` (que 0010 no lee y la Nota T-M1-05 punto 8 rechaza) y omite `transportadora` y `guia`. SPEC RN-PRE-02 y §10.4 siguen diciendo "se respeta lo pactado".
* **Rationale & Recommendation**: Borrar o marcar como histórico el bosquejo de L146 y L162, quitar `stock_visto_en` del JSON, alinear el JSON con la nota y enmendar RN-PRE-02.

#### implementation-readiness-2-11 / codebase-details-2-6 / style-2-3 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `codebase-details`, `style`
* **Affected Scope:** L34, L51-53, L138, L180, L285, L325
* **Discrepancy Description**: Los principios 2 y 3 dicen "la UI lee solo de Dexie" y "una sola ruta de escritura (`aplicar_ops`)". §4.5 admite cobros, estados, ajustes y mermas por UPDATE o RPC directo "o" a elección del implementador, y L325 lista lecturas online sin espejo. No hay contrato para el INSERT en `pagos` ni para "Registrar cobro y finalizar" en una sola operación (RF-PAG-01, atomicidad), ni para el aviso de RF-PAG-05 ni para interpretar un error PostgREST con `E_SOBREPAGO:`.
* **Rationale & Recommendation**: Definir el contrato (RPC o payload y atomicidad) antes de T-M4-06, o acotar los principios a las ops de §4.3 y a las lecturas de §5.1.

#### implementation-readiness-2-13 - Severity: Major
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** L262
* **Discrepancy Description**: "El cliente puede restarle un margen (p. ej. 2 min)" deja la decisión al implementador. Una transacción larga puede confirmar con `updated_at` anterior al cursor y perderse sin error.
* **Rationale & Recommendation**: Fijar un margen obligatorio y su prueba en T-M2-04.

#### codebase-details-2-7 - Severity: Major
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** L203, L309, L337-341
* **Discrepancy Description**: La subida de fotos no está definida: falta la convención de `path` en el bucket `soportes`, los valores de `adjuntos_locales.estado`, qué componente sube el blob y cuándo, el reintento y la API de Storage. `adjunto.vincular` no valida que el objeto exista y un `path` mal construido queda huérfano.
* **Rationale & Recommendation**: Especificar path, estados, responsable, reintento y manejo de fallo.

#### codebase-details-2-9 - Severity: Major
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** L243
* **Discrepancy Description**: El PLAN dice que el filtro `direccion = 'cobro'` dentro del `greatest(updated_at…)` pasa a otra condición. En 0005:56-57 el `greatest` no filtra por dirección; solo el arreglo `pagos` lo hace (0005:52).
* **Rationale & Recommendation**: Corregir la descripción: el cambio real es una línea en el arreglo, y el reembolso ya mueve el cursor.

#### style-2-5 - Severity: Major
* **Reviewer Lens:** `style`
* **Affected Scope:** L338
* **Discrepancy Description**: La clasificación red/rechazo deja sin ubicar 500, 401 por JWT vencido y 429. "Estado HTTP 0" no es un estado HTTP.
* **Rationale & Recommendation**: Añadir una regla para el resto (p. ej. otro 5xx = rechazo, no se encola) y decir "sin respuesta".

#### style-2-7 - Severity: Major
* **Reviewer Lens:** `style`
* **Affected Scope:** L374
* **Discrepancy Description**: El PLAN usa un número provisional `BOR-<device>-<n>` para la `confirmacion` offline, mientras SPEC RF-DOC-01 y §10.1 la definen "sin consecutivo". No dice qué imprime el PDF. `pedido_venta.crear` es solo online, así que offline solo aplica a pedidos ya cacheados.
* **Rationale & Recommendation**: Definir qué número o texto se imprime y aclarar el alcance offline.

### Nit

* **implementation-readiness-2-6 / codebase-details-2-11 / codebase-details-2-18** (L224-227, L231-237, L242): los CHECK de `pagos` no son anónimos (`pagos_direccion_check`, `pagos_check`; 0012 ya borra uno por nombre). La tabla de triggers omite `pagos_no_apertura` (0012) y `pagos_updated_at` (0002). Faltan el nombre del archivo de migración, el tipo y la posición de `resumen_periodo.reembolsos`, si `v_por_reembolsar` excluye `deleted_at` y qué pruebas existentes se tocan.
* **implementation-readiness-2-7** (L210, L227): "la cubre el REVOKE por defecto de 0014" es confuso. Decir que `drop`+`create` de `resumen_periodo` hereda el grant de los default privileges.
* **implementation-readiness-2-14** (L278-279, L350): no se dice qué hace el puller con filas `deleted_at` ni hay punto de entrada para repetir la sincronización inicial.
* **implementation-readiness-2-15 / style-2-15** (L397): "E1–E15" pero SPEC tiene E1–E18. Indicar cuáles de E16–E18 van en e2e. Otros: L404 ("no se bloquea de más"), L424 ("usuario de servicio" sin definir), L417 ("backup reciente" sin criterio), L443-447 (casillas `[ ]` aunque RLS y "sin anon" ya están verificados), L156/L176 (`dias_credito`, `condicion_pago` en el JSON aunque solo se acepta `contado`), L199 (dos condiciones en una frase), L121 ("forma vigente" mientras `pago.reembolsar` es T-M1-18).
* **implementation-readiness-2-16** (SPEC L244, RF-CAT-04, RF-VEN-02): restos de offline que contradicen D-009.
* **implementation-readiness-2-17 / codebase-details-2-16** (L61-90): el árbol de §3 omite `test-setup.ts`, `index.css`, `vite-env.d.ts`, `domain/auth/tipos.ts` y `apps/web/vite.config.ts`. Además, `aplicar_ops` solo lee `op_id`, `tipo` y `datos`: `device_id` y `client_created_at` (SPEC §10.2, RF-SYN-11) no llegan al servidor y el PLAN no lo dice.
* **codebase-details-2-10** (L132): `E_STOCK` no existe (finalizar sin stock lanza "Stock insuficiente…", 0001:496) y `E_ESTADO` es nuevo en 0017. Aclararlo.
* **codebase-details-2-13 / style-2-10** (L320-321, L384, `db.ts:113-125`): `gastos` está en `TABLAS_CACHE_SERVIDOR`, así que al limpiar el caché el gasto ya subido desaparece del dispositivo, contra "se conserva".
* **codebase-details-2-14** (§1, L11-28): Zod, `@react-pdf/renderer`, Recharts, Playwright, fast-check y `user-event` no están instalados y §1 no marca lo pendiente.
* **codebase-details-2-15** (L365): `_redirects` y `_headers` no existen en `apps/web/public/`. Marcarlos pendientes (T-M8-04) en §3.
* **codebase-details-2-17 / AGENTS.md L7**: lista "Realtime" en el stack, contra D-009 y PLAN §1 y §4.2.
* **style-2-8** (L117): `search_path public, extensions` no es exclusivo de `detectar_duplicados_tercero`; lo usan 0007, 0008, 0009, 0010 y 0012. Decir "las funciones que usan `pg_trgm` o `extensions`".
* **style-2-9** (L146, §13 ítem 7): hedge obsoleto sobre `pg_trgm`. DECISIONS ya usa trigramas con pruebas.
* **style-2-11**: sin acción (`bloqueada` conocida, CAM-45).
* **style-2-12**: anglicismos ("dedupe", "scrub", "upserts", "stale-while-revalidate", "keep-alive") y adjetivos subjetivos sin dato (L13, L14, L23).
* **style-2-13**: terminología inestable: "caché"/"cache", "cobrado_neto"/"cobrado neto", "outbox/cola/Pendientes" sin definir, banner "N sin subir" frente a "Tienes N sin subir", L340 "Nada reintenta" ambiguo.
* **style-2-14** (L364): "mejor trato" y "~7 días" sin evidencia. Decir qué decide el lector.
* **Fuera del PLAN, a corregir en el mismo cambio** (style): SPEC §10.2 y RF-SYN-11 con el contrato viejo de ops; DECISIONS D-016 ("sin `persist()` por ahora") contra PLAN §6 y la Nota T-M2-02.

## Lo que sí coincide con el código (según los reviewers)

Contrato y manejadores de `aplicar_ops` (0003, 0007-0010, 0012), `sync_pull` (0005, 0006), candados de 0011, 0013, 0015 y 0016, esquema Dexie v1, configuración PWA, rutas, claves de `localStorage`, CI y `emitir_documento`.
