# TASKS — Backlog ordenado del MVP

> Versión 1.1 · Implementa `SPEC.md` según `PLAN.md`. **Un PR por tarea.** TDD: la prueba se escribe **antes** y se ve fallar. Cada tarea cita los IDs que cierra; una tarea no termina si alguno de esos IDs no tiene prueba.
> Estado: `[ ]` pendiente · `[~]` en curso · `[x]` hecha.
> Cada tarea tiene un issue en Linear (proyecto *Camino PWA*, hitos H1 a H5) con el mismo código; el enlace va junto al código. Rama: `CAM-n-descripcion-corta`.

**Definición de hecho (DoD) para toda tarea**
- Pruebas nuevas y existentes en verde; `tsc --noEmit` y lint limpios.
- Pruebas nombradas con el ID (`[RN-INV-03]`, `[E5]`).
- Sin secretos en el repo; migraciones solo hacia adelante.
- UI: probada en viewport 360 px, sin scroll horizontal, con estados vacío/cargando/error.
- Si cambia un contrato (`aplicar_ops`, `sync_pull`, esquema), se actualiza `PLAN.md` en el mismo PR.

---

## M0 — Arranque del repositorio
**Meta:** proyecto reproducible con CI verde y la migración 0001 corriendo en local.

- [x] **T-M0-01** ([CAM-26](https://linear.app/caminocol/issue/CAM-26)) Inicializar monorepo ligero (`apps/web` con Vite + React + TS strict + Tailwind + React Router; ESLint, Prettier, Vitest). Cierra: base de RNF-UX-01.
- [x] **T-M0-02** ([CAM-27](https://linear.app/caminocol/issue/CAM-27)) Mover `tests/core.test.mjs` a `tests/db/core.test.mjs` y ejecutarlo en `npm run test:db`. **Done:** 24 pruebas verdes. Ya cubren RN-INV-01/02/03/04/05, RN-COS-01/02/03, RN-PAG-01 y RN-DOC-01/02: **renombrar las pruebas** para citar esos IDs.
- [x] **T-M0-03** ([CAM-28](https://linear.app/caminocol/issue/CAM-28)) `supabase init`, `supabase start` y aplicar `0001_core.sql` en local; documentar comandos en `README.md`. Cierra: RNF-REL-03 (migraciones hacia adelante con la CLI).
- [ ] **T-M0-04** ([CAM-10](https://linear.app/caminocol/issue/CAM-10)) `ci.yml` con lint + typecheck + unit + DB; protección de rama. **Done:** PR de prueba verde. **Avance (2026-11-18):** `ci.yml` ya corre dos trabajos (base de datos y app web) en cada PR. Falta activar la protección de la rama `main` (requiere permisos de administrador en GitHub).
- [x] **T-M0-05** ([CAM-29](https://linear.app/caminocol/issue/CAM-29)) `docs/runbook.md` (esqueleto): variables de entorno, cómo correr local, procedimiento de pérdida de dispositivo.

## M1 — Base de datos: sincronización y endurecimiento (`0002_sync.sql`)
**Meta:** el servidor expone `aplicar_ops` y `sync_pull`, seguros e idempotentes. Todo con pruebas primero en `tests/db/`.

- [x] **T-M1-00** ([CAM-30](https://linear.app/caminocol/issue/CAM-30)) Adaptar `0001_core.sql` al flujo `recibido → confirmado → finalizado` (SPEC §9.1, D-004 en DECISIONS): estados y `pv_transicion_valida`; `despachado_en` → `finalizado_en`; descuento de stock y fijación de costo al finalizar; `comprometido` solo en `confirmado`; finalizar exige saldo 0 (RN-VEN-05); `entrega_tipo`, `transportadora`, `guia`, `envio_costo` quedan como datos; vistas, `resumen_periodo`, documentos y `v_necesidades_compra` ajustados. **Prueba primero:** reescribir en `tests/db/` los casos de despacho para que citen [RN-INV-02/03], [RN-VEN-02/03/05], [E4], [E5], [E11]. Permitido editar `0001` porque aún no se aplica a un proyecto real (nota en DECISIONS). Cierra: RN-INV-02/03/04, RN-COS-02, RN-VEN-02/03/05, RF-DOC-03.
- [x] **T-M1-01** ([CAM-31](https://linear.app/caminocol/issue/CAM-31)) Columnas `updated_at`/triggers, *touch* del padre, `terceros.productos_ofrecidos`, `adjuntos`, `configuracion`, `ping()`, `uso_bd()`. Cierra: base de RF-SYN-08/09. **Pruebas:** tocar un ítem actualiza `updated_at` del padre.
- [x] **T-M1-02** ([CAM-32](https://linear.app/caminocol/issue/CAM-32)) `detectar_duplicados_tercero` (teléfono normalizado, documento, nombre normalizado). Cierra: RF-TER-04. **Pruebas:** `+57 300 111 2233` = `3001112233`; documento igual; nombre similar; no falso positivo con nombres distintos.
- [x] **T-M1-03** ([CAM-33](https://linear.app/caminocol/issue/CAM-33)) `aplicar_ops` — infraestructura mínima: orden, sub-bloque con excepción por operación, `sync_ops`, `ya_aplicada` y códigos de error. Si una operación falla o queda en revisión, **la cola del cliente se detiene** (sin estado `bloqueada`, D-009). Cierra: RF-SYN-01/05/07, [E2]. **Pruebas:** reenvío idéntico no duplica; una operación fallida no deja datos a medias.
- [x] **T-M1-04** ([CAM-34](https://linear.app/caminocol/issue/CAM-34)) Op `tercero.crear` con `revision` y `resolucion`. Cierra: RF-SYN-06, [E14].
- [x] **T-M1-05** ([CAM-35](https://linear.app/caminocol/issue/CAM-35)) Op `pedido_venta.crear`, solo con conexión (D-009) (con `cliente_nuevo`, validación de precio, advertencias `PRECIO_CAMBIO`/`STOCK`, `tasa_impuesto` desde servidor, cota de `fecha`). Cierra: RF-VEN-01/08, RN-PRE-02.
- [x] **T-M1-06** ([CAM-36](https://linear.app/caminocol/issue/CAM-36)) Op `orden_compra.registrar` (con `proveedor_nuevo`, recepción y pagos atómicos). Cierra: RF-COM-02/03/04/05, [E1] (parte servidor), [E8]. **Pruebas:** compra inmediata completa suma stock y costo; si falla el pago, **no** queda nada a medias.
- [x] **T-M1-07** ([CAM-37](https://linear.app/caminocol/issue/CAM-37)) Ops `gasto.registrar` y `adjunto.vincular`. Cierra: RF-PAG-03, RF-SYN-09.
- [x] **T-M1-08** ([CAM-38](https://linear.app/caminocol/issue/CAM-38)) `sync_pull` simple: **un solo cursor** (`updated_at`); snapshot de catálogo, terceros, stock, pedidos abiertos y de los últimos 90 días; borrado lógico. Sin cursores por tabla ni `has_more` mientras los datos quepan en una respuesta (D-009). Cierra: RF-SYN-08.
- [x] **T-M1-09** ([CAM-39](https://linear.app/caminocol/issue/CAM-39)) Endurecimiento: `search_path`, `REVOKE` a `anon`, Storage `soportes` + políticas, publicación Realtime. Cierra: RNF-SEC-01/03/04.
- [x] **T-M1-11** ([CAM-88](https://linear.app/caminocol/issue/CAM-88)) Candado de pedidos finalizados (hallazgo H-02 de la auditoría): un pedido `finalizado` o `devuelto` no admite cambios en el dinero de la cabecera, en `costo_unitario` de sus ítems ni en sus cobros. Migración `0011`. **Prueba primero:** `tests/db/candado_finalizados.test.mjs` (rama `CAM-88-candado-pedido-finalizado`, ya en rojo). Cierra: AGENTS regla 3 (hallazgo H-02). Independiente de CAM-35/36/37. Ojo: `sync_pull.test.mjs` altera `finalizado_en` de un pedido finalizado; si se protege ese campo hay que adaptar esa suite, y un trigger sobre `pagos` debe filtrar por `direccion = 'cobro'` para no tapar el error del CHECK que espera `core.test.mjs`.
- [x] **T-M1-12** ([CAM-90](https://linear.app/caminocol/issue/CAM-90)) Compra de apertura (hallazgo H-01, D-014): modalidad `apertura` en `ordenes_compra`; no cuenta en `compras_periodo`, no genera cuenta por pagar y no admite pagos. Migración `0012`. **Prueba primero:** `tests/db/compra_apertura.test.mjs` (rama `CAM-90-compra-apertura`, ya en rojo). Agrega RN-COM-04 a la spec. Después de T-M1-06.
- [x] **T-M1-13** ([CAM-89](https://linear.app/caminocol/issue/CAM-89)) Cerrar la escritura directa que se salta `aplicar_ops` (hallazgo H-03): inserts en estados finales, edición manual de `consecutivos` y `costo_promedio`, borrado de recepciones, archivar pedidos finalizados, ajustes sin motivo. Migración `0013`. **Prueba primero:** `tests/db/escritura_directa.test.mjs` (rama `CAM-89-cerrar-escritura-directa`, ya en rojo). Cierra: AGENTS regla 4. **Después** de T-M1-05, 06, 07 y 12. **Alcance incluido:** adaptar `tests/db/sync_pull.test.mjs` (actualiza `costo_promedio` por `UPDATE`, inserta un `ajuste` sin motivo y pedidos ya `finalizado`: los candados lo rechazan) y redefinir `emitir_documento` para que solo ella mueva `consecutivos`.
- [x] **T-M1-14** ([CAM-92](https://linear.app/caminocol/issue/CAM-92)) Las funciones creadas después de 0004 las ejecuta `anon` (hallazgo H-15, RNF-SEC-03): revocar `EXECUTE` a `PUBLIC`/`anon` en las funciones de `public` y en los privilegios por defecto futuros. Migración `0014`. **Prueba primero:** `tests/db/funciones_sin_anon.test.mjs` (rama `CAM-92-funciones-sin-anon`, ya en rojo; carga todas las migraciones). Independiente; antes de T-M1-10.
- [x] **T-M1-10** ([CAM-40](https://linear.app/caminocol/issue/CAM-40)) Pruebas de **integración real** (Supabase local): RLS con JWT de miembro vs no miembro vía PostgREST; **concurrencia** con 2 conexiones finalizando la última unidad. Cierra: RNF-SEC-02, [E6], [E12]. Hecho: `tests/integration/` + `npm run test:integration` (ver `PLAN.md` §10); verificó además H-15 en Supabase real.
- [x] **T-M1-15** ([CAM-94](https://linear.app/caminocol/issue/CAM-94)) Validaciones del servidor (hallazgos H-05, H-07, H-08; D-015): total no negativo, descuento ≤ subtotal, motivos y campos obligatorios de la spec, una sola vía para el costo del flete. Migración `0015`. **Prueba primero:** `tests/db/validaciones_pedido.test.mjs`.
- [x] **T-M1-16** ([CAM-95](https://linear.app/caminocol/issue/CAM-95)) Cerrar los movimientos `compra`/`venta` hechos a mano (hallazgo H-16; D-015). Migración `0016`. **Prueba primero:** `tests/db/movimientos_internos.test.mjs`.
- [x] **T-M1-17** ([CAM-96](https://linear.app/caminocol/issue/CAM-96)) Spec de reembolsos y control de sobrepago (hallazgo H-06; D-015). Solo documentación: SPEC (RF-PAG-04..06, RN-PAG-02..07, E16..E18), PLAN §4.3 (`pago.reembolsar`) y la nota «T-M1-17» de `docs/DECISIONS.md`. De ahí salen T-M1-18 y T-M4-08.
- [ ] **T-M1-18** (issue por crear) Reembolsos y control de sobrepago en el servidor (hallazgo H-06). Migración `0017`: `pagos.direccion` admite `reembolso` y columna `motivo`, op `pago.reembolsar`, triggers de sobrepago y de inmutabilidad del reembolso, vista `v_por_reembolsar`, columna `reembolsos` en `resumen_periodo`, `sync_pull` con reembolsos. **Prueba primero:** `tests/db/reembolsos.test.mjs`. Cierra: RF-PAG-04/05/06, RN-PAG-02..07, [E16], [E17], [E18]. Depende de T-M1-17 y, para el orden de migraciones, de T-M1-15 y T-M1-16 (0015, 0016).
- [x] **Correcciones surgidas en H1** (no estaban en el plan): [CAM-85](https://linear.app/caminocol/issue/CAM-85) fechas por defecto del esquema en hora de Bogotá (CI fallaba de noche); [CAM-86](https://linear.app/caminocol/issue/CAM-86) finalizar fallaba con 0002 por `touch_padre` (migración 0006); [CAM-87](https://linear.app/caminocol/issue/CAM-87) `test:db` descubre solo las suites. Ver D-012.

**Hecho de M1:** `npm run test:db` y `npm run test:integration` verdes; contratos en `PLAN.md` coinciden con el código.

## M2 — Esqueleto de la app: sesión, PWA, datos locales y sincronización
**Meta:** app instalable que abre offline, con escritor, puller y centro de pendientes funcionando sobre una op de ejemplo.

- [ ] **T-M2-00** ([CAM-84](https://linear.app/caminocol/issue/CAM-84)) Spike de iOS (1 día, iPhone real): instalar una PWA mínima, guardar un blob en IndexedDB, comprobar `storage.persist()` tras varios días y compartir un PDF a WhatsApp con `navigator.share`. Registrar el resultado en `docs/DECISIONS.md`. En Windows no existe un simulador de iOS (Xcode solo corre en Mac) y el WebKit de Playwright no reproduce una PWA instalada, así que hace falta un iPhone real o un servicio de dispositivos reales. **Bloquea** el resto de H2.
- [ ] **T-M2-01** ([CAM-41](https://linear.app/caminocol/issue/CAM-41)) Cliente Supabase, login email+contraseña, guardia de rutas, pantalla "Sin acceso". Cierra: RF-AUTH-01/02/04.
- [ ] **T-M2-02** ([CAM-42](https://linear.app/caminocol/issue/CAM-42)) PWA: manifest, íconos, SW con precache, `registerType:'prompt'`, `storage.persist()`, pantalla "Cómo instalar". Cierra: RF-OPS-01/02/03.
- [ ] **T-M2-03** ([CAM-43](https://linear.app/caminocol/issue/CAM-43)) Dexie v1 (esquema del plan), `device_id` estable, UUID v7, utilidades de formato (COP, fechas Bogotá). Cierra: RNF-UX-01, RF-SYN-11.
- [ ] **T-M2-04** ([CAM-44](https://linear.app/caminocol/issue/CAM-44)) **Puller** simple: carga inicial y refresco al abrir, al volver a primer plano y con "Actualizar", sin pisar registros `_pendiente`. Cierra: RF-SYN-08. **Pruebas** con `fake-indexeddb` y servidor simulado.
- [ ] **T-M2-05** ([CAM-45](https://linear.app/caminocol/issue/CAM-45)) **Escritor**: aplicar → (ok | revisión | error | red); solo las operaciones que admiten offline (compra, proveedor, gasto, adjunto) se encolan, las demás dicen "Requiere conexión"; distinción red/rechazo; timeout 8 s. Cierra: RF-SYN-01/02. **Pruebas:** red caída → encola; rechazo → no encola; respuesta perdida + reenvío → `ya_aplicada`.
- [ ] **T-M2-06** ([CAM-46](https://linear.app/caminocol/issue/CAM-46)) **Centro de pendientes**: lista, descartar, subir seleccionados, resultados, banner con antigüedad y **exportar** JSON; sin editar ni importar (D-009). Cierra: RF-SYN-03/04/10, RF-AUTH-03, [E13]. **Pruebas:** nada se envía sin pulsar "Subir".
- [ ] **T-M2-07** ([CAM-47](https://linear.app/caminocol/issue/CAM-47)) Indicadores siempre visibles: conexión, pendientes y "datos al …" (**sin Realtime**, D-009). Cierra: RNF-UX-02.
- [ ] **T-M2-08** ([CAM-48](https://linear.app/caminocol/issue/CAM-48)) Compresión y almacenamiento de fotos locales + subida posterior y `adjunto.vincular`. Cierra: RF-SYN-09.
- [ ] **T-M2-09** ([CAM-49](https://linear.app/caminocol/issue/CAM-49)) E2E Playwright base: abrir app con red cortada, crear algo, ver ⏳, restablecer red, ver banner, subir. Cierra: parte de [E1].

## M3 — Terceros y catálogo
- [ ] **T-M3-01** ([CAM-50](https://linear.app/caminocol/issue/CAM-50)) Lista/búsqueda local de terceros y formulario (cliente/proveedor/ambos), GPS con alternativa manual, foto, consentimiento. Cierra: RF-TER-01/02/03/05, RN-DAT-01, RNF-UX-04.
- [ ] **T-M3-02** ([CAM-51](https://linear.app/caminocol/issue/CAM-51)) Detección de duplicados al crear (online: aviso; offline: se resuelve al sincronizar). Cierra: RF-TER-04.
- [ ] **T-M3-03** ([CAM-52](https://linear.app/caminocol/issue/CAM-52)) Edición y borrado lógico (solo online). Cierra: RF-TER-06.
- [ ] **T-M3-04** ([CAM-53](https://linear.app/caminocol/issue/CAM-53)) Catálogo: productos, artículos (presentación, unidades, banderas), listas y precios con escalones, asignar lista a cliente. Carga inicial con los 10 artículos de `docs/negocio/catalogo.md`. Cierra: RF-CAT-01/02/03/04.
- [ ] **T-M3-05** ([CAM-54](https://linear.app/caminocol/issue/CAM-54)) `domain/pricing` + pruebas de propiedad; **paridad** con `precio_para` de Postgres. Cierra: RN-PRE-01.

## M4 — Pedidos de venta
- [ ] **T-M4-01** ([CAM-55](https://linear.app/caminocol/issue/CAM-55)) `domain/totals` y `domain/pedidoEstados` + **prueba de paridad** con triggers/totales de SQL (fast-check + PGlite). Cierra: RF-VEN-03, RN-COS-03.
- [ ] **T-M4-02** ([CAM-56](https://linear.app/caminocol/issue/CAM-56)) Formulario "Nuevo pedido": cliente (buscar/crear), ítems con precio automático y descuento, envío, entrega, notas; solo con conexión (D-009). Cierra: RF-VEN-01/02/08/10, RNF-UX-05, [E10].
- [x] ~~**T-M4-03**~~ *Eliminada (D-006): no hay parser de WhatsApp.*
- [ ] **T-M4-04** ([CAM-57](https://linear.app/caminocol/issue/CAM-57)) Lista de PV (filtros) + vistas "Por confirmar" y "Esperando pago". Cierra: RF-VEN-06.
- [ ] **T-M4-05** ([CAM-58](https://linear.app/caminocol/issue/CAM-58)) Detalle de PV con acciones por estado, motivos obligatorios, acción "Registrar cobro y finalizar", datos de envío (transportadora, guía, `envio_costo`), historial, diálogos de confirmación en acciones irreversibles. Cierra: RF-VEN-05/07, RNF-UX-03, RN-VEN-01/02/03/04/05, [E4], [E5], [E11].
- [ ] **T-M4-06** ([CAM-59](https://linear.app/caminocol/issue/CAM-59)) Cobros a clientes y saldo por pedido. Cierra: RF-PAG-01.
- [ ] **T-M4-08** (issue por crear) Pantalla de **reembolso** en el detalle del PV `cancelado`/`devuelto` y lista «por reembolsar»: saldo, valor, medio (sugerido el del último cobro), motivo, confirmación (RNF-UX-03), historial de reembolsos; solo con conexión ("Requiere conexión" sin red); aviso previo de sobrepago en el cobro. Cierra: RF-PAG-04/05/06 (UI), RF-VEN-07, RN-PAG-07. Depende de T-M1-18 y T-M4-05/06.
- [ ] **T-M4-07** ([CAM-60](https://linear.app/caminocol/issue/CAM-60)) Documentos de venta: `confirmacion` (offline), `remision`/`factura_interna` (online), anulación, PDF y **compartir por WhatsApp**. Cierra: RF-DOC-01–06, RN-DOC-01/02, [E9].

## M5 — Compras
- [ ] **T-M5-01** ([CAM-61](https://linear.app/caminocol/issue/CAM-61)) Formulario "Nueva compra" con modos **inmediata** y **encargo** (la modalidad `apertura` de RN-COM-04 existe en el servidor; la carga del inventario inicial puede tener su propia pantalla o un modo oculto), proveedor (buscar/crear), ítems, recepción con lote/vencimiento, pago y foto de soporte; offline-capable. Cierra: RF-COM-01/02/03/04/05, RN-COM-01/02, [E1].
- [ ] **T-M5-02** ([CAM-62](https://linear.app/caminocol/issue/CAM-62)) Detalle de OC: recibir (parcial), pagar, cancelar (solo antes de recibir). Cierra: RF-COM-08, RN-COM-03, [E8].
- [ ] **T-M5-03** ([CAM-63](https://linear.app/caminocol/issue/CAM-63)) **Necesidades de compra** por proveedor + "Crear OC desde necesidades". Cierra: RF-COM-06, [E7].
- [ ] **T-M5-04** ([CAM-64](https://linear.app/caminocol/issue/CAM-64)) Comprobante de compra PDF y compartir. Cierra: RF-COM-07.
- [ ] **T-M5-05** ([CAM-65](https://linear.app/caminocol/issue/CAM-65)) Gastos (con categoría, offline). Cierra: RF-PAG-03.
- [x] ~~**T-M5-06**~~ *Eliminada (D13): no hay cuentas por pagar; las compras son de contado.*

## M6 — Inventario
- [ ] **T-M6-01** ([CAM-66](https://linear.app/caminocol/issue/CAM-66)) Pantalla de stock (físico/comprometido/en camino/disponible/faltante/costo) con etiqueta "datos al …". Cierra: RF-INV-01/05, [E15].
- [ ] **T-M6-02** ([CAM-67](https://linear.app/caminocol/issue/CAM-67)) Kardex por artículo (online). Cierra: RF-INV-02.
- [ ] **T-M6-03** ([CAM-68](https://linear.app/caminocol/issue/CAM-68)) Ajustes y mermas con motivo (online). Cierra: RF-INV-03, RN-INV-01.
- [ ] **T-M6-04** ([CAM-69](https://linear.app/caminocol/issue/CAM-69)) Lotes y alerta de vencimiento (≤ 60 días, informativa). Cierra: RF-INV-04, L2.

## M7 — Dashboard
- [ ] **T-M7-01** ([CAM-70](https://linear.app/caminocol/issue/CAM-70)) Selector de periodo (hoy/semana/mes) con comparación contra el periodo anterior, e indicadores de ventas, costo, ganancia, margen, unidades, pedidos, ticket promedio, gastos y utilidad neta. Cierra: RF-DSH-01/02, [E10].
- [ ] **T-M7-02** ([CAM-71](https://linear.app/caminocol/issue/CAM-71)) Tabla por artículo (unidades, ventas, costo, ganancia, margen) y gráfico de unidades por semana (últimas 8). Si hace falta, una vista SQL de ventas por semana. Cierra: RF-DSH-03.
- [ ] **T-M7-03** ([CAM-72](https://linear.app/caminocol/issue/CAM-72)) Panel de administración (por confirmar, esperando pago, faltantes, capital en inventario, stock en cero, pendientes). Cierra: RF-DSH-04.
- [ ] **T-M7-04** ([CAM-73](https://linear.app/caminocol/issue/CAM-73)) Caché del dashboard con "datos al …" (sin Realtime). Cierra: RF-DSH-05, [E15].
- [ ] **T-M7-05** ([CAM-74](https://linear.app/caminocol/issue/CAM-74)) Revisión con la skill `dataviz` (si está disponible) para consistencia de color/contraste.

## M8 — Endurecimiento, operación y puesta en producción
- [ ] **T-M8-01** ([CAM-75](https://linear.app/caminocol/issue/CAM-75)) `backup.yml` cifrado + `restore-check.sh`; **ejecutar una restauración real** y registrar evidencia en `docs/runbook.md`. Cierra: RNF-REL-01, RF-OPS-04.
- [ ] **T-M8-02** ([CAM-76](https://linear.app/caminocol/issue/CAM-76)) `keepalive.yml` + `ping()`. Cierra: RNF-REL-02. Ojo: desde 0014 `anon` no ejecuta `ping()`; el keep-alive debe usar el JWT de un usuario de servicio.
- [ ] **T-M8-03** ([CAM-77](https://linear.app/caminocol/issue/CAM-77)) Ajustes: dispositivo, almacenamiento persistente, registro de errores local exportable, uso de BD con alerta 70 %, versión. Cierra: RF-OPS-02, RNF-PERF-03.
- [ ] **T-M8-04** ([CAM-78](https://linear.app/caminocol/issue/CAM-78)) Cabeceras de seguridad (`_headers`/CSP), auditoría de dependencias, scrub de PII, revisión del checklist de `PLAN.md` §14. Cierra: RNF-SEC-05/06/07.
- [ ] **T-M8-05** ([CAM-79](https://linear.app/caminocol/issue/CAM-79)) Rendimiento: virtualizar listas, presupuesto de bundle, Lighthouse PWA. Cierra: RNF-PERF-01/02.
- [ ] **T-M8-06** ([CAM-80](https://linear.app/caminocol/issue/CAM-80)) Accesibilidad: auditoría AA y tamaños táctiles. Cierra: RNF-UX-04.
- [ ] **T-M8-07** ([CAM-81](https://linear.app/caminocol/issue/CAM-81)) E2E completos E1–E15 en Chromium y WebKit con red cortada y restablecida.
- [ ] **T-M8-08** ([CAM-82](https://linear.app/caminocol/issue/CAM-82)) Despliegue: proyecto Supabase de producción, `db-push.yml`, Cloudflare Pages, crear usuarios y `miembros`, cargar configuración del negocio y catálogo inicial.
- [ ] **T-M8-09** ([CAM-83](https://linear.app/caminocol/issue/CAM-83)) **UAT con ambos socios en dispositivos reales** (iPhone y Android): checklist abajo. Cierra: métrica de éxito de la spec.

### Checklist UAT (T-M8-09)
1. Instalar la PWA en ambos teléfonos y abrir en modo avión.
2. Socia en modo avión: capturar un proveedor nuevo con foto y GPS, y una compra inmediata de 3 artículos.
3. Verificar ⏳, stock "estimado" y que **nada** se sube solo.
4. Recuperar señal, abrir Pendientes, revisar y subir; ver resultado ✔ y la foto vinculada.
5. Socio ve en tiempo real stock y proveedor nuevo.
6. Crear en la PWA un pedido que llegó por WhatsApp (≤ 60 s); confirmar (reserva); registrar el cobro y finalizar con transportadora; emitir remisión; compartirla por WhatsApp.
7. Intentar finalizar un pedido sin stock → mensaje claro; intentar finalizar sin pago → mensaje claro.
8. Registrar un cobro, un gasto y revisar el dashboard del día y de la semana.
9. Cerrar sesión con pendientes → advertencia.
10. Restaurar el backup en local y verificar conteos.

## Orden y dependencias
`M0 → M1 → M2 → (M3 ∥ M5.5) → M4 → M5 → M6 → M7 → M8`. M1 y M2 son la columna vertebral: **no empezar M4/M5 antes de que el E2E de M2 pase.**

## Preguntas abiertas (el agente asume el valor por defecto y lo registra en `docs/DECISIONS.md`)
| ID | Pregunta | Default |
|---|---|---|
| Q1 | ¿El flete se cobra al cliente? | Ambos campos disponibles (`envio_cobrado`/`envio_costo`) |
| Q2 | ¿Qué significan "deducciones" en el dashboard? | Descuentos + costo de mercancía + gastos |
| Q3 | ¿Costo promedio o por lote? | Promedio ponderado |
| Q4 | Tratamiento de IVA de los productos | Tasa 0 %, precios netos |
| Q5 | ¿El pull del otro socio puede ser automático? | Sí (solo lectura) |
| Q6 | Datos del negocio para los PDF (razón social, NIT, dirección, logo) | Placeholders en `configuracion.negocio` |
| Q7 | ¿Qué usa hoy caminocol.com para pedir? | Resuelta (D-006): mensaje de texto libre; la PWA no lo lee |
