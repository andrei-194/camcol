# Goldfish Annotated Review Report

Status: resolved (ronda 1, auto accept: 24 correcciones aplicadas; M7, CSP de M8 y M9 quedaron marcados «se define al iniciar la tarea»)

**Target:** `docs/spec/PLAN.md` (líneas 1-366) · Etapa 9, ronda 1
**Origen de los hallazgos:** `implementation_readiness_report.md` (mismo directorio)

Comprobé en el repositorio antes de categorizar: `bloqueada` sigue en `apps/web/src/infra/db/db.ts:25` y en `PLAN.md` L242; los CHECK de `direccion` y de ligadura de `pagos` son anónimos (`0001_core.sql` L369 y L384); 0004 saca todas las tablas de `supabase_realtime` (L9, L75-77); `sync_pull` filtra `direccion = 'cobro'` (`0005_sync_pull.sql` L52). Los hallazgos B1, B3, B4 y B6 son correctos.

## Resumen de categorías

| Categoría | Cantidad | Ids |
|---|---|---|
| PROPOSE FIX | 24 | B1 a B6, M1 a M6, M8 (alinear), M10 a M15, y los nits baratos |
| ESCALATE | 3 | M7, M8 (CSP), M9 |
| CONTEST | 0 | — |
| DECLINE | 9 nits | ver al final |

## Blockers

### B1 · Realtime y stock estimado siguen prescritos — PROPOSE FIX
*   **Alcance:** L5, 17, 21, 35-36, 45, 47, 69-72, 96, 267-274, 308, 341, 349
*   **Justificación:** correcto; 0004 y D-009 ya lo eliminaron y la nota de L5 solo difiere la reescritura.
*   **Edición:** quitar Realtime de la tabla de stack (§1), del diagrama (§2) y de la estructura (§3); reescribir §4.2(8) como «sin Realtime (0004)»; reescribir §5.4 como «Puller»; borrar `stockEstimado` de §5.5 (queda el indicador de pendientes); quitar la mención de §13.3 y de §10. La nota de L5 se reduce a una línea que remite a D-009.

### B2 · §4.2 describe como futuro lo entregado — PROPOSE FIX
*   **Alcance:** L88-101
*   **Edición:** reescribir §4.2 como tabla «migración → qué contiene → estado»: 0001 núcleo, 0002 sync, 0003 `aplicar_ops`, 0004 endurecimiento, 0005 `sync_pull`, 0006 `touch_padre`, 0007 a 0010 ops, 0011 candado, 0012 apertura, 0013 escritura directa, 0014 funciones sin `anon`, 0015 validaciones, 0016 movimientos internos (hechas) y 0017 reembolsos (pendiente, CAM-97).

### B3 · Outbox: `bloqueada` y cursor por tabla — PROPOSE FIX (PLAN) + nota de código
*   **Alcance:** L242, L244
*   **Edición:** enum final `pendiente | error | revision`; cursor único (fila `sync_meta` con `tabla = 'global'`, D-016); definir el ciclo de vida: tras una subida `ok` o `ya_aplicada` la fila de outbox se **borra** y el resultado queda en la fila del servidor que llega por pull; `terceros.roles` lo deriva el puller de `es_cliente` y `es_proveedor`.
*   **Código:** quitar `'bloqueada'` de `EstadoOutbox` en `db.ts` no se hace aquí (esta revisión solo edita el PLAN). Queda anotado como requisito de CAM-45 (escritor).

### B4 · `0017`: restricciones anónimas y objetos sin especificar — PROPOSE FIX
*   **Alcance:** L177-196
*   **Edición:** añadir a §4.3 el SQL de reemplazo de los dos CHECK de `pagos` buscándolos en `pg_constraint` por su definición (no por nombre autogenerado); la firma `op_pago_reembolsar(p jsonb) returns jsonb`; la lista cerrada de objetos que 0017 crea o redefine (`pagos_candado`, `pv_totales` si aplica, `sync_pull`, `resumen_periodo`, nuevo `v_por_reembolsar`); y que `pagos.op_id` queda nulo como en las demás ops (la idempotencia la da `sync_ops`).

### B5 · `0017`: orden de triggers, códigos y bloqueo — PROPOSE FIX
*   **Alcance:** L188-196
*   **Edición:** fijar que los triggers de `pagos` se disparan por orden alfabético de nombre, con una tabla «trigger → regla → error»; el bloqueo es `select ... from pedidos_venta where id = new.pedido_venta_id for update` dentro del trigger antes de calcular `cobrado_neto`; `E_SOBREPAGO` solo aplica a cobros en pedidos `recibido` o `confirmado`, y en `cancelado`, `finalizado` y `devuelto` rige el candado existente; lista de casos de prueba con resultado esperado por RN-PAG.

### B6 · `sync_pull` con reembolsos — PROPOSE FIX
*   **Alcance:** L192, 211, 217
*   **Edición:** 0017 reemplaza `sync_pull` completa; el filtro de `pagos` pasa a `direccion in ('cobro','reembolso')` en el arreglo y en el `greatest(updated_at...)`; el cliente separa cobros de reembolsos por `direccion`. Los pedidos `cancelado` o `devuelto` sin `finalizado_en` reciente **no** entran al snapshot: la lista «por reembolsar» y el detalle de esos pedidos se piden online (`v_por_reembolsar`), coherente con D-009 (los reembolsos son solo con conexión).

## Majors

### M1 · Estructura del repo (§3) contradice `apps/web/src` — PROPOSE FIX
*   **Edición:** reemplazar el árbol por el real (`infra/db`, `infra/auth`, `infra/supabase`, `domain/auth`, `application/auth`, `pwa`, `routes.tsx`, `ui/auth`, `ui/Ajustes.tsx`, `ui/Home.tsx`, `src/test`) y fijar las rutas de lo pendiente (`infra/sync/puller.ts`, `infra/sync/writer.ts`). Rutas e2e: `tests/e2e/` (manda AGENTS.md). `tests/db/` en lugar de `tests/core.test.mjs`.

### M2 · §3 lista archivos inexistentes y solo dos migraciones — PROPOSE FIX
*   **Edición:** marcar cada archivo `existe` o `pendiente (T-M…)`: `backup.sh`, `restore-check.sh`, `keepalive.sh` y los workflows de despliegue pertenecen a T-M8 y se marcan así; añadir `scripts/test-db.mjs` y `scripts/test-integration.mjs`; citar 0001 a 0017.

### M3 · Restos de D-009 en el cuerpo (§5.3, Importar/Editar JSON) — PROPOSE FIX
*   **Edición:** reescribir §5.3 según D-009: lista, descartar, subir seleccionados, banner y **exportar** JSON; sin Editar ni Importar. Definir el JSON exportado: `{ "version": 1, "device_id", "exportado_en", "ops": [ <fila de outbox con su payload> ] }`, sin blobs de fotos (se avisa que las fotos locales no se exportan).

### M4 · Gastos en Dexie sin fuente de hidratación — PROPOSE FIX
*   **Edición:** aclarar en §5.1 que `gastos` y `adjuntos` no vienen por `sync_pull`: la fila local queda como registro de lo creado en este dispositivo y se marca `_pendiente` hasta subir; tras subir, la fila local se conserva con el id del servidor. `v_por_reembolsar` y los pagos de un pedido se leen online. Dar la forma de cada tabla Dexie con una tabla campo → origen.

### M5 · Escritor y subida incompletos — PROPOSE FIX
*   **Edición:** definir «online» como: último resultado de red conocido y no `navigator.onLine === false`, con timeout de 8 s; quitar «pull dirigido de tablas afectadas» (el puller usa un solo cursor); mapear `status` → estado de outbox: `ok` y `ya_aplicada` borran; `error` marca `error` y guarda `error.codigo`; `revision` marca `revision`. La subida envía en el orden de `created_at`; una op que depende de otra (`adjunto.vincular` tras `gasto.registrar`) va en el mismo lote y se detiene en la primera `revision` o `error` (`detener_cola`). **H-12** (confirmar que el cliente se detiene) se cierra aquí.

### M6 · §10 y CI desactualizados — PROPOSE FIX
*   **Edición:** quitar números de migración fijos («todas las migraciones de `supabase/migrations/`»); aclarar que `tests/db/` carga las migraciones que cada suite necesita y que `test:integration` corre local y no en CI (nota T-M1-10 de `DECISIONS.md`); documentar `tests/integration/entorno.mjs`.

### M7 · Dashboard: fuente de cada indicador — ESCALATE
*   **Por qué:** elegir qué vista o RPC alimenta cada indicador es una decisión de producto que toca T-M7 (H4) y H-10, H-13 y H-14, todavía abiertas. Detallarlo ahora fijaría decisiones antes de su tarea.
*   **Decisión necesaria:** ¿se especifica ahora o al empezar T-M7? Propuesta: dejar §5.6 como «se detalla al iniciar T-M7» con la lista de indicadores de D-008.

### M8 · PWA y hosting — PROPOSE FIX (alinear) + ESCALATE (CSP)
*   **Alinear:** §6 pasa a decir lo hecho en T-M2-02: sin `runtimeCaching` (equivale a NetworkOnly para Supabase), `storage.persist()` se pide al arrancar y al evento `appinstalled`; D-016 aclarado.
*   **CSP (`_headers`, `_redirects`):** ESCALATE, igual que M7: depende del despliegue (T-M8) y del dominio de Supabase del proyecto real, que aún no existe.

### M9 · PDFs: plantillas y texto de compartir — ESCALATE
*   **Por qué:** el diseño de los documentos (columnas, texto de WhatsApp, logo) es de producto y pertenece a T-M6. Propuesta: dejar §7 con el contrato del snapshot y marcar la plantilla como «se define al iniciar T-M6».

### M10 · Auth (§9) desactualizado — PROPOSE FIX
*   **Edición:** alinear con T-M2-01: pertenencia por `miembros.user_id`; claves `camino.auth.usuario` y `camino.miembro.<id>` en `localStorage`; `signOut({ scope: 'local' })`; al cerrar sesión se llama a `limpiarCacheDeServidor`, que **conserva** la outbox, `adjuntos_locales`, `kv` y las filas `_pendiente` (regla 10).

### M11 · Cursor de `sync_pull` — PROPOSE FIX
*   **Edición:** documentar `cursor = null` con base vacía; que el cursor no incluye `stock` (se refresca con cada pull completo); citar `touch_padre` de 0006.

### M12 · Versión y fecha — PROPOSE FIX
*   **Edición:** poner «Versión 1.1 · 2026-11-18» y una línea de historial.

### M13 · Contrato de ops mezcla tiempos y bocetos — PROPOSE FIX
*   **Edición:** cada op con el mismo formato: estado (`implementada en 00NN` o `por implementar en 0017`), payload, reglas, errores. En lo pendiente se usa «debe».

### M14 · Párrafos de una línea con muchas reglas — PROPOSE FIX
*   **Edición:** convertir los párrafos de L128, 141-146, 159-167, 171 y 188-196 en listas o tablas; partir la celda de L321.

### M15 · «Verifica versiones» repetido — PROPOSE FIX
*   **Edición:** dejar la instrucción solo en §13 y quitar las menciones sueltas.

## Nits

**PROPOSE FIX:** `implementation-readiness-1-17` (versiones reales de `package.json`), `-1-21` (columnas de `v_por_reembolsar`), `-1-22` (una sola definición de `ping()`), `codebase-details-1-11` (`search_path` de `detectar_duplicados_tercero`), `-1-12` (`E_DUPLICADO` por carrera de `unique_violation`), `style-1-11`, `style-1-12`, `style-1-13`, `style-1-14`, `style-1-17`, `style-1-18`, `style-1-21`.

**DECLINE:** `implementation-readiness-1-18` (duplica M12), `-1-19`, `-1-20`, `style-1-8`, `style-1-9`, `style-1-10`, `style-1-15`, `style-1-16`, `style-1-19`, `style-1-20`, `style-1-22`.

## Pendiente fuera del PLAN

*   Quitar `'bloqueada'` de `EstadoOutbox` en `apps/web/src/infra/db/db.ts` (CAM-45).
*   No leídos por los revisores: SPEC.md completo y las migraciones 0015 y 0016. Una ronda 2 con fresh reviewers los cubrirá.
