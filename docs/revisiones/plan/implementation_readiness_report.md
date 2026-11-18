# Goldfish Review Report

**Target:** `docs/spec/PLAN.md` (líneas 1-366) · Etapa 9 (Implementation Readiness Test), ronda 1

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details` | completed |
| `egm-style` | completed |

Límites de cobertura declarados por los reviewers: nadie abrió SPEC.md completo; 0006-0016 se leyeron solo en parte (0015 y 0016 no); las afirmaciones del PLAN sobre ellas quedan sin verificar.

Veredicto: NO LISTO. El contrato núcleo de `aplicar_ops` y `sync_pull` (§4.3 núcleo, §4.4) está bien y coincide con 0003 y 0005. Los fallos están en las secciones que la nota de L5 difiere ("se reescriben al implementar"), en la estructura del repo y en `0017`, que quedó con huecos de diseño.

## Prioritized Findings (Blockers -> Major -> Nits)

### 🔴 Blockers

**B1 · Realtime y stock estimado siguen prescritos aunque D-009/0004 los eliminaron** — `implementation-readiness-1-1`, `codebase-details-1-1`
* **Alcance:** L5, 17, 21, 35-36, 45, 47, 69-72, 96, 267-274, 308, 341, 349 (§4.2 punto 8, §5.4, §5.5, §13.3)
* **Discrepancia:** §4.2(8) pide publicar 6 tablas en `supabase_realtime` y §5.4 describe suscripción con debounce. La migración 0004 hace lo contrario: saca de la publicación toda tabla de `public`. §5.5 describe `stockEstimado`, eliminado por D-009. La nota de L5 solo dice que "manda esto" y difiere la reescritura, aunque 0004 ya está aplicada.
* **Recomendación:** Reescribir ahora §4.2(8), §5.4, §5.5 y quitar `stockEstimado` y Realtime de §1, §2, §3, §10 y §13.3. Un implementador no debe cruzar con L5 para saber qué es vigente.

**B2 · §4.2 describe como futuro lo que ya está entregado, con migraciones mal atribuidas** — `codebase-details-1-2`, `implementation-readiness-1-8`
* **Alcance:** L88-101 (§4.2)
* **Discrepancia:** Se presenta como "alcance de 0002 (a construir con TDD)". El 0002 real solo trae `updated_at`/triggers, `touch_padre`, `productos_ofrecidos`, `adjuntos`, `configuracion`, `ping()`, `uso_bd()` y duplicados. `aplicar_ops` y `sync_pull` viven en 0003 y 0005; el endurecimiento y el bucket en 0004 y 0014. Un agente no sabe qué falta.
* **Recomendación:** Reescribir §4.2 como estado por migración (hecho/pendiente), no como alcance.

**B3 · Outbox: enum `bloqueada` y cursor por tabla contradicen D-009 y el código** — `implementation-readiness-1-2`, `codebase-details-1-3`
* **Alcance:** L242, L244 (§5.1); `apps/web/src/infra/db/db.ts` L25
* **Discrepancia:** El PLAN y `EstadoOutbox` conservan `bloqueada`; D-009 y §4.3 la eliminan. L244 dice "cursor por tabla" y `db.ts` ya usa una sola fila `tabla='global'` (D-016). Falta decir qué pasa con la fila de outbox tras una subida exitosa (borrar o marcar) y que `terceros.roles` lo deriva el puller localmente (D-016).
* **Recomendación:** Fijar el enum final `pendiente|error|revision`, ordenar quitar `bloqueada` de `db.ts` (con migración Dexie si aplica), fijar el ciclo de vida de la fila subida y documentar `roles` derivado.

**B4 · `0017` `pago.reembolsar`: restricciones anónimas y objetos redefinidos sin especificar** — `implementation-readiness-1-3`, `codebase-details-1-8`
* **Alcance:** L177-196 (§4.3, esquema `0017`)
* **Discrepancia:** Los CHECK de `direccion` y de ligadura en `pagos` son anónimos en 0001 (nombres autogenerados `pagos_direccion_check`, `pagos_check`); no se da SQL ni nombres para el `drop constraint`. No hay firma de `op_pago_reembolsar(jsonb)` ni lista cerrada de objetos que 0017 redefine (`pagos_candado`, `pv_totales`, `sync_pull`, `resumen_periodo`, `v_ventas_pedido`). L186 dice que `pagos.op_id` queda nulo, pero la columna existe como `op_id uuid unique`; no se aclara si se rellena. Se verificó que `v_cuentas_por_cobrar`, `resumen_periodo` y `v_ventas_pedido` filtran `cobro`/`pago` y por tanto ignoran `reembolso` sin cambios (a contrastar con el 0017 real).
* **Recomendación:** Añadir el SQL exacto de `DROP/ADD CONSTRAINT`, la firma de la op y la lista cerrada de objetos tocados; aclarar `op_id` en `pagos`.

**B5 · `0017`: orden de triggers, códigos y bloqueo sin definir** — `implementation-readiness-1-4`
* **Alcance:** L188-196
* **Discrepancia:** No se define el orden de disparo entre `pagos_candado` (0011), `pagos_reembolso_candado` y el candado de cobros ampliado, así que no se sabe si gana RN-PAG-01 o RN-PAG-02. La fórmula de `cobrado_neto` "bajo el mismo bloqueo" no dice si es `SELECT ... FOR UPDATE` sobre `pedidos_venta` dentro de un trigger de `pagos`. No se dice en qué estados puede darse `E_SOBREPAGO` en cobros (0011 ya rechaza cobros en PV `finalizado`). `pv_totales` rechaza `total < cobrado_neto` sin código ni estados.
* **Recomendación:** Especificar orden alfabético de triggers por nombre, códigos de error, estados aplicables y los casos de prueba (L326 exige una por RN).

**B6 · `sync_pull` con reembolsos: cambio de filtro sin especificar y cobertura de snapshot** — `implementation-readiness-1-5`, `codebase-details-1-9`
* **Alcance:** L192, L211, L217
* **Discrepancia:** 0005 filtra `direccion = 'cobro'` en dos lugares (arreglo `pagos` y `greatest(updated_at...)`). El plan no dice cómo se redefine `sync_pull` ni si el cliente debe separar cobros de reembolsos al calcular saldo (afecta T-M4-08). Además la ventana del snapshot (`estado in ('recibido','confirmado') or finalizado_en >= ventana`) deja fuera PV `cancelado`/`devuelto` sin `finalizado_en` reciente, justo los que `v_por_reembolsar` necesita; un dispositivo nuevo no los vería.
* **Recomendación:** Indicar el cambio exacto de filtro (`direccion in ('cobro','reembolso')`), que 0017 reemplaza la función completa, y decidir si esos PV se piden online o entran en el snapshot.

### 🟡 Majors

**M1 · Estructura del repo (§3) contradice `apps/web/src/`** — `implementation-readiness-1-6`, `codebase-details-1-5`
* **Alcance:** L58-81, L35-39
* **Discrepancia:** El PLAN dice `infra/local/`, `infra/remote/`, `infra/sync/`, `ui/routes`, `ui/screens`. El código tiene `infra/db/` (`db.ts`, `deviceId.ts`), `infra/supabase/client.ts`, `infra/auth/`, `domain/auth/`, `application/auth/`, `pwa/`, `routes.tsx`, `ui/auth/`, `ui/Ajustes.tsx`, `ui/Home.tsx` y `src/test/servicioAuthFalso.ts`. e2e: PLAN dice `apps/web/e2e/`, AGENTS.md dice `tests/e2e/`. `tests/core.test.mjs` (L326) ya está en `tests/db/core.test.mjs`.
* **Recomendación:** Corregir el árbol a lo existente y fijar rutas exactas para los archivos nuevos (`infra/sync/writer.ts`, `puller.ts`, etc.).

**M2 · §3 lista archivos inexistentes y solo dos migraciones; no marca Create/Modify/Delete** — `implementation-readiness-1-7`, `codebase-details-1-14`
* **Alcance:** L59-66, L79-81
* **Discrepancia:** Se listan `backup.sh`, `restore-check.sh`, `keepalive.sh` y workflows `db-push/backup/keepalive.yml` que no existen, sin tarea dueña; solo se citan 0001 y 0002 (existen 0001-0016). No se marca Create/Modify/Delete por archivo, como pide el estándar. Se omiten `scripts/test-db.mjs` y `scripts/test-integration.mjs`.
* **Recomendación:** Marcar cada archivo con su acción y la tarea que lo crea; añadir 0003-0017.

**M3 · Contenido de D-009 aún en el cuerpo (Pendientes, dashboard, stock estimado)** — `codebase-details-1-4`, `implementation-readiness-1-12`, `style-1-1`
* **Alcance:** L5, 36, 38, 62, 242, 244, 255, 264-265 (§5.3), 273-274 (§5.5), 292, 308
* **Discrepancia:** §5.3 aún exige Editar (reemplazar payload) e Importar/Exportar JSON, y no define el formato del JSON (esquema, versión, blobs) ni plantilla de texto legible por cada uno de los 4 tipos.
* **Recomendación:** Reescribir o marcar cada sección como "Eliminado (D-009)", como ya se hizo con §8; definir formato de exportación si se conserva.

**M4 · Gastos: tabla Dexie sin fuente de hidratación** — `codebase-details-1-6`, `implementation-readiness-1-10`
* **Alcance:** L220-221, L229-247 (§5.1), L239
* **Discrepancia:** El pull no trae `gastos` ni `adjuntos` ("se leen online"), pero `db.ts` define la tabla `gastos` en `TABLAS_CACHE_SERVIDOR`. L247 dice "la fila del servidor reemplaza a la local", sin fila que llegue por pull. §5.1 solo dice "items embebidos"; no define dónde van pagos, reembolsos ni blobs de adjuntos (`adjuntos_locales` solo tiene `id, op_id, estado`), ni aclara que `v_por_reembolsar` es online.
* **Recomendación:** Documentar la forma exacta de cada tabla Dexie y cómo se hidratan gastos tras subir.

**M5 · Escritor y subida: algoritmo incompleto** — `implementation-readiness-1-11`, `codebase-details-1-7`
* **Alcance:** L103-108, L249-262 (§5.2)
* **Discrepancia:** "Online (heurística)" sin definir. "Pull dirigido de tablas afectadas" no existe porque `sync_pull` es un cursor único sin parámetros (L200). No se mapea `status` de `aplicar_ops` a estado de outbox en lote, ni cómo se detiene la cola (`detener_cola`, H-12 por confirmar). `aplicar_ops` aplica todas las ops aunque una falle, así que una dependiente (`adjunto.vincular` tras un `gasto.registrar` fallido) falla con `E_REF`; el PLAN solo describe `commit(op)` de una en una. Falta orden y granularidad de envío.
* **Recomendación:** Dar el algoritmo completo de lote, orden y dependencias; quitar "tablas afectadas".

**M6 · §10 y CI desactualizados o contradictorios** — `implementation-readiness-1-9`, `codebase-details-1-13`
* **Alcance:** L310, L317, L324, L332
* **Discrepancia:** "CLI aplica 0001-0014" (existen hasta 0016, vendrá 0017); "PGlite (0001+0002)" (hay 17 archivos en `tests/db/`); "Ops 0007-0012". L332 dice que `ci.yml` corre integración (Supabase local) como obligatoria, pero DECISIONS (nota T-M1-10) dice que `test:integration` no corre en CI. `tests/integration/entorno.mjs` no se documenta.
* **Recomendación:** Alinear con lo que ejecuta `ci.yml` y quitar números de migración fijos.

**M7 · Dashboard (§5.6): fuente de indicadores sin definir** — `implementation-readiness-1-13`
* **Alcance:** L276-277
* **Discrepancia:** D-008 pide unidades por semana y mes y otros indicadores; no se dice qué vista/RPC los alimenta ni la forma del JSON en `kv`. Faltan consultas de capital en inventario, stock en cero y pendientes de subir; H-10, H-13 y H-14 siguen abiertas.
* **Recomendación:** Enumerar la fuente de cada indicador.

**M8 · PWA/hosting (§6): CSP sin valores y contradicciones sobre `persist()`** — `implementation-readiness-1-14`
* **Alcance:** L279-285, L333
* **Discrepancia:** `_headers` sin directivas ni dominio de Supabase y sin tarea dueña (D-016/T-M2-02 lo dejan fuera). L282 pide NetworkOnly para Supabase; T-M2-02 se hizo sin `runtimeCaching`. L284 pide `storage.persist()`; D-016 dice sin `persist` por ahora y T-M2-02 dice que se pide al arrancar.
* **Recomendación:** Fijar el CSP exacto y decidir quién llama a `persist()`.

**M9 · PDFs (§7): plantillas y contenido de compartir sin definir** — `implementation-readiness-1-15`
* **Alcance:** L287-292
* **Discrepancia:** Faltan columnas, anchos, fuente con soporte de acentos/COP, descarga offline del logo (`logo_path`) y la plantilla del campo `texto`. `ComprobanteCompra` offline usa `BOR-<device>-<n>` sin decir dónde se muestra frente a RN de consecutivos.
* **Recomendación:** Dar plantilla de texto y contrato del snapshot.

**M10 · Auth (§9) desactualizado respecto a T-M2-01** — `implementation-readiness-1-16`
* **Alcance:** L299-302
* **Discrepancia:** No menciona `miembros` por `user_id`, claves `camino.auth.usuario` y `camino.miembro.<id>`, ni `signOut({scope:'local'})`. "Solo limpia si el cierre fue explícito y sin pendientes" choca con `limpiarCacheDeServidor`, que conserva filas `_pendiente` por diseño.
* **Recomendación:** Alinear con T-M2-01 y D-016.

**M11 · Cursor de `sync_pull`: casos límite y `touch_padre` vigente** — `codebase-details-1-10`
* **Alcance:** L215-216, L220
* **Discrepancia:** El cursor (`greatest`) no incluye `stock`. Con `desde = null` sobre base vacía devuelve `cursor = null` y no se documenta. L216 cita `touch_padre` de 0002, pero la versión vigente es la de 0006, que excluye el cambio solo de `costo_unitario`.
* **Recomendación:** Documentar `cursor = null` y citar 0006.

**M12 · Versión y fecha no corresponden al contenido** — `style-1-2`
* **Alcance:** L3, L180, L188
* **Discrepancia:** "Versión 1.0 · 2026-11-17", pero el cuerpo cita CAM-96 y 0017 con fecha 2026-11-18, D-015, D-017 y 0016.
* **Recomendación:** Poner fecha y versión reales o quitar la versión y usar git.

**M13 · Contrato de ops mezcla tiempos verbales, bocetos y notas** — `style-1-3`, `style-1-5`
* **Alcance:** L101, 128, 132, 138-144, 158, 167, 171, 177
* **Discrepancia:** Conviven "Implementado en 00NN", "Por implementar" y bocetos JSON originales; se contradicen (L132 muestra `id`, L140 lo declara opcional). `0017` se redacta en indicativo y se lee como comportamiento existente. El rótulo "T-M1-18, spec T-M1-17" (L177) confunde.
* **Recomendación:** Un contrato único por op (campos, reglas, errores); marcar visiblemente el estado; usar "debe" en lo pendiente.

**M14 · Párrafos de una línea con 10-20 reglas encadenadas** — `style-1-4`, `style-1-6`
* **Alcance:** L128, 141-146, 159-167, 171, 188-196 (peor caso: más de 200 palabras en una línea), L321 (celda de tabla de más de 60 palabras)
* **Recomendación:** Listas o tablas (regla / error / ID); separar casos de prueba con resultado esperado concreto.

**M15 · Instrucción "verifica versiones" repetida** — `style-1-7`
* **Alcance:** L4, 24, 28, 284, 331, 341, §13
* **Recomendación:** Dejar §13 como lista única y quitar repeticiones sueltas.

### 🟢 Nits

* `implementation-readiness-1-17` · L4, L28: "última estable" pese a `package.json` con versiones fijas (Vite 8, `vite-plugin-pwa` 2.0). Citar las reales.
* `implementation-readiness-1-18` · L3, L58: versión/fecha (duplicado de M12).
* `implementation-readiness-1-19` · L121-128: `tercero.crear` muestra `consentimiento_en` e `id` como si fueran obligatorios; marcar opcionales en el ejemplo.
* `implementation-readiness-1-20` · L113, L170-171: formato de fecha inconsistente entre ops (`AAAA-MM-DD` frente a ISO con zona).
* `implementation-readiness-1-21` · L186, L192: faltan nombres y tipo exactos de columnas de `v_por_reembolsar` (`cobrado`, `por_reembolsar`).
* `implementation-readiness-1-22` · L93, 225: `ping()` descrito en §4.2, §4.5 y §12 con fragmentos distintos; una sola definición.
* `codebase-details-1-11` · L93-94, L225: "`search_path = public` en todas las funciones" es inexacto, `detectar_duplicados_tercero` usa `public, extensions` (pg_trgm en `extensions`); `uso_bd()` y `pg_database_size` sin verificar.
* `codebase-details-1-12` · L108, L111: `sync_ops` ya existía en 0001 con `device_id` (ya no se envía, D-013); falta decir que una carrera `unique_violation` sin registro previo devuelve `E_DUPLICADO` con status `error` y detiene la cola.
* `style-1-8` · L11-26: "Rapidez", "PWA robusta", "Maquetación declarativa" sin criterio medible.
* `style-1-9` · L51: "siempre rápida y offline-capable"; decir "lee de Dexie sin red".
* `style-1-10` · L10, 28, 331: exceso de negrita.
* `style-1-11` · L54: "hexagonal ligera"; decir que `application/` depende de puertos implementados en `infra/`.
* `style-1-12` · L94: "sin excepción" y "ninguna" duplican L360.
* `style-1-13` · L126: "nombre muy similar" sin umbral; remitir a 0007.
* `style-1-14` · L145, L171: nota de `op_id` nulo repetida tres veces; una sola nota.
* `style-1-15` · L202: "(p. ej. 2 min)" sin decidir quién fija el margen.
* `style-1-16` · L219: "(se corrige con el snapshot inicial)" sin quién ni cuándo lo dispara.
* `style-1-17` · L225: párrafo de ~150 palabras sobre triggers con H-03/H-16 sin enlace; usar lista por migración.
* `style-1-18` · L232-246, L255, L265: pseudocódigo sin formato uniforme; unificar el estado `revision`.
* `style-1-19` · L284, L340: "tratamiento más favorable" y "consultas de humo" vagos; nombrar la política o remitir a §13.6.
* `style-1-20` · L296: indicar a qué referencias se refiere el número de sección conservado (opcional).
* `style-1-21` · L326: "deben seguir en verde" coloquial; "deben pasar".
* `style-1-22` · L342: "alerta al 70 % de 500 MB" sin destinatario ni acción.

## Verificado y correcto

Códigos del núcleo de `aplicar_ops`, orden de ops, idempotencia y `ya_aplicada` en el mismo lote; `sync_ops` solo registra ops exitosas; `tipos_op` con regex de función; `sync_pull` con cursor único, snapshot de 90 días, pagos aparte con `cambio_en`, stock derivado de `v_stock` más `costo_promedio` y filtros `cobro`/`pago`; `registerType: 'prompt'` y `navigateFallback` en `pwa/config.ts`; `servicioAuth.ts` no cierra sesión por fallo de red; UUID v7 en `lib/uuid.ts`; sin `db.delete()` en Dexie.

## Resumen de severidad

🔴 6 consolidados (de 8 ids originales de Blocker) · 🟡 15 consolidados · 🟢 22 ids

Nota: `codebase-details-1-14` se clasificó Major en el reporte original y se fusionó en M2.
