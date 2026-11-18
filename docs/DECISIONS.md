# Decisiones del proyecto

Registro de decisiones de negocio y de la spec. Las de arquitectura van en [adr/](adr/). Cada entrada dice qué se decidió, por qué y qué documentos afecta.

## D-001 · Plataforma propia en lugar de Odoo — 2026-11-17

Se abandona Odoo; el back-office es una PWA sobre Supabase. Ver [ADR-0004](adr/0004-plataforma-propia-pwa-supabase.md). Se eliminó del repositorio todo lo de Odoo (Docker, addons, Python, specs y ADR de entorno).

## D-002 · El pedido se finaliza y se descuenta al confirmar el pago — 2026-11-17

**Decisión (socios):** los clientes siguen pidiendo por la web como hoy; el pedido y los datos se confirman por WhatsApp; los socios crean el pedido en la PWA. Mientras el pedido espera el pago, el stock queda **reservado** (`comprometido`). Al confirmar el pago, el pedido pasa a **`finalizado`** y **se descuenta del inventario**. `finalizado` reemplaza a los estados de alistamiento, despacho y entrega.

**Por qué:** un pedido sin pago verificado no debe afectar inventario ni balance (principio ya presente en ADR-0002 y ADR-0003).

**Flujo:** `recibido → confirmado → finalizado`, con `cancelado` antes de finalizar y `devuelto` después. El envío (transportadora, guía, costo) pasa a ser información del pedido, no un estado.

**Documentos actualizados:** `SPEC.md` v1.1 (D11, RF-VEN-05/06/10, RF-PAG-01, RN-INV-02/03/04, RN-COS-02, RN-VEN-02/03/05, §9.1, E4, E5, E6, E9, E11, L4, L8), `TASKS.md` (T-M1-00 y ajustes) y roadmap.

**Estado:** cerrada.

## D-003 · La web no cambia — 2026-11-17

El sitio de caminocol.com se mantiene como está, sin carrito ni integración. Ver también D-006.

## D-004 · Se permite editar `0001_core.sql` — 2026-11-17

La migración `0001` implementa el flujo anterior (despacho y entrega). Como **nunca se ha aplicado a un proyecto real**, se corrige en su lugar en lugar de crear una migración que deshaga estados (regla de AGENTS.md, punto 11). La tarea es **T-M1-00**, con la prueba escrita primero. Desde su primer `db push` real, `0001` queda congelada.

**Corrección 2026-11-18 (CAM-85):** las fechas por defecto (`vigente_desde`, `fecha_ingreso`, `gastos.fecha`) pasan de `current_date` (UTC) a la fecha de `America/Bogota`; de noche el día UTC ya cambiaba y fallaba CI.

## D-005 · Todo es de contado y en su totalidad — 2026-11-17

**Decisión (socios):** no se vende nada a crédito; las compras también se pagan al momento y completas. Por eso un pedido solo se finaliza con el **saldo en 0** (RN-VEN-05) y la acción "Registrar cobro y finalizar" hace ambas cosas en un solo paso. Reemplaza la suposición anterior (antes P-004). Las columnas de crédito del modelo siguen existiendo pero no tienen interfaz.

## D-006 · WhatsApp es asunto de la web; no hay parser — 2026-11-17

**Decisión (socios):** no se toca nada de WhatsApp. La web arma el mensaje y la conversación ocurre fuera de la PWA.

**Por qué:** se revisó `components/wa.ts` y `lib/catalog.ts` del sitio. El mensaje es texto libre de **un solo producto**, sin cantidad, sin datos del cliente y sin número de pedido (por ejemplo: "Hola CAMINO, quiero pedir Café Villa Luz (250 g). ¿Me confirmas disponibilidad, forma de pago y entrega?"). Un parser no tendría qué leer.

**Qué cambia:** se eliminan RF-VEN-04 (pegar pedido), RF-VEN-09 (referencia repetida), el §8 de PLAN, la tarea T-M4-03 y el dominio `whatsappParser`. El escenario E3 pasa a describir el registro manual. La PWA solo comparte PDFs con la hoja de compartir del sistema (RF-DOC-06). Reemplaza a D-003 en lo del parser y cierra P-002.

## D-007 · Catálogo y precios confirmados — 2026-11-17

**Decisión (socios):**
- La crema de cacao vale **$22.000** (el del costeo). La web muestra $25.000 y se corrige en su repositorio, fuera de este proyecto.
- Las **pastillas de chocolate** se venden y se manejan en inventario, aunque aún no estén en la web.
- Café en **grano o molido** no es un artículo distinto: se pregunta al cliente por WhatsApp y se anota en las notas del pedido.
- La presentación de **5 libras** es un artículo con stock propio, porque el proveedor la entrega empacada.
- Café Jardín y Café Montañero de Ceilán usan el precio de la web.

Detalle completo en [negocio/catalogo.md](negocio/catalogo.md). Cierra P-006 y P-007.

## D-008 · Dashboard simple (KISS) — 2026-11-17

**Decisión (socios):** el dashboard muestra lo básico para administrar: costo, precio de venta, diferencia (ganancia), unidades vendidas por semana y por mes, y unos pocos indicadores de gestión.

**Qué cambia:**
- **Costo** = promedio ponderado de las compras. No incluye empaque, mermas, trabajo ni costo fijo del costeo; el empaque se registra como gasto.
- **Periodos:** hoy, semana y mes, con comparación contra el periodo anterior. Se eliminan "15 días" y "personalizado".
- **Se muestra:** ventas, costo, ganancia, margen %, unidades, pedidos, ticket promedio, gastos y utilidad neta; tabla por artículo; gráfico de unidades por semana; y un panel con pedidos por confirmar, pedidos esperando pago, faltantes, capital en inventario, stock en cero y pendientes de subir.
- **Se elimina:** ventas por proveedor, compras del periodo y cuentas por pagar (no hay crédito, D-005).

**Documentos actualizados:** SPEC (RF-DSH-01 a 04, RF-PAG-02, S3, objetivo 5) y TASKS (T-M7-01 a 03, T-M5-06 eliminada). Cierra P-005.

## D-009 · Offline recortado a lo esencial — 2026-11-17

**Decisión (socios, tras revisión técnica):** el caso real es que la socia registre una compra en finca sin señal y la suba después. El diseño completo de sincronización era el mayor riesgo y el mayor costo del proyecto, así que se recorta.

**Qué queda:**
- Offline solo para **compra** (con recepción, pago y proveedor nuevo), **proveedor** y **gasto**, más la foto de soporte.
- Pedidos, cobros, estados, clientes, facturar y editar maestros: **solo con conexión**. Los pedidos siguen usando `op_id` para que un toque doble no duplique nada.
- Lecturas con **un solo cursor** (snapshot), al abrir, al volver a primer plano y con "Actualizar".
- Pendientes: lista, subir, descartar y **exportar** JSON.
- Si una operación falla, la cola se detiene (sin estado `bloqueada`).

**Qué se pospone:** Realtime, "stock estimado" offline, editar pendientes e importar JSON.

**Fechas:** se mantienen las del roadmap. La revisión técnica las considera optimistas (H1 hacia mediados de enero); se recalibran al cerrar H1.

**Spike de iOS:** antes de seguir con H2 se prueba en el iPhone real el almacenamiento local y compartir un PDF (T-M2-00), porque no se pudo confirmar con fuentes. En Windows no hay simulador de iOS; se usa un iPhone real o un servicio de dispositivos reales.

**Documentos actualizados:** SPEC v1.2 (D10, RF-VEN-08, RF-SYN-02/04/07/08/10, RF-INV-05, RF-DSH-05, §10), nota de revisión al inicio de PLAN, TASKS y AGENTS.

## D-010 · Endurecimiento de seguridad (0004_hardening) — 2026-11-17

**Decisión (CAM-39, T-M1-09):** todo el endurecimiento va en `0004_hardening.sql`, sin tocar 0001/0002.
- `search_path` fijo en todas las funciones de `public` (bucle sobre el catálogo; el test falla si alguna queda sin él).
- `REVOKE` total a `anon` (tablas, vistas, secuencias, funciones; también `public` en funciones) y privilegios por defecto corregidos para objetos futuros. `authenticated` conserva acceso; la RLS "solo miembros" decide.
- `pg_trgm` se mueve al esquema `extensions`; `detectar_duplicados_tercero` pasa a `search_path = public, extensions`.
- Bucket privado `soportes` con política solo miembros sobre `storage.objects` (bloque protegido: se omite si no existe `storage`).
- Sin Realtime (D-009): la migración saca de `supabase_realtime` cualquier tabla de `public`. Esto reemplaza el punto 8 de PLAN §4.2.
- **`v_cuentas_por_pagar` se conserva.** Aunque no hay crédito a proveedores (D-005) y ninguna pantalla la usa, está listada en SPEC §4, la cubren pruebas de 0001 y no cuesta nada (es `security_invoker` y ahora inaccesible a `anon`). Eliminarla obligaría a editar 0001 y sus pruebas sin beneficio. Se reevalúa si algún día estorba.

**Sin probar aún (T-M1-10, Supabase local):** las políticas de Storage se probaron contra un stub de `storage.objects`; falta verificar con el Storage real (subida con JWT de miembro, URL firmada, rechazo a no miembro y a `anon`). Tampoco se probó que la API de PostgREST oculte las funciones a `anon` ni la publicación Realtime real.

## Nota T-M1-08 · `sync_pull` simple (CAM-38) — 2026-11-17

- Contrato en `PLAN.md` §4.4; migración `0005_sync_pull.sql`. Decisiones de detalle: el stock va siempre completo (derivado, sin cursor); con cursor no hay filtro de ventana de 90 días (solo el snapshot inicial); el cursor es estricto (`>`), el solape de seguridad lo pone el cliente; `pagos` se comparan aparte porque no tocan al padre; gastos y adjuntos no se leen en el pull.
- **Hallazgo resuelto (CAM-86):** `touch_padre` (0002) rompía `update pedidos_venta set estado='finalizado'`, porque `trg_pv_estado` actualiza los ítems (`costo_unitario`) y el *touch* de cada ítem intentaba actualizar el pedido en curso. Se corrige en `0006_fix_touch_padre.sql` (no actualiza el pedido si en el ítem solo cambió `costo_unitario`) y las pruebas de `core` ahora cargan 0001, 0002 y 0006.

## D-011 · La app web se desarrolla en Docker — 2026-11-17

**Decisión (socio desarrollador):** el PC no recibe herramientas de desarrollo nuevas. La app web (`apps/web`) corre en un contenedor `node:22` (`docker-compose.yml`): `npm run setup`, `dev`, `test`, `typecheck`, `lint` y `build`. Los `node_modules` viven en un volumen de Docker en el disco D:. El Node del PC (20 o superior) solo se usa para `test:db` y la CLI de Supabase.

**Por qué:** Vite 8 exige Node 22.12 o superior y el PC tiene 22.9; actualizarlo implicaba cambiar el PC y C: está casi lleno. El servidor de Vite escucha en todas las interfaces (`0.0.0.0`) con *polling*, para verlo desde el móvil en la misma red (`http://<IP del PC>:5173`).

**Consecuencia:** el editor no ve los tipos de las dependencias de `apps/web`; es esperado.

## D-012 · Flujo de ramas, PR y pruebas de base de datos — 2026-11-18

- *(El flujo de ramas y PR fue reemplazado por D-017.)* Cada tarea tiene su issue en Linear y su rama `CAM-n-descripcion-corta`; entonces era un PR por tarea. **Excepción única:** H1 (cimientos) se entregó en un solo PR (#2) porque eran la reestructuración del repo y el arranque.
- Los hallazgos que no son de la tarea en curso se abren como issue propio (p. ej. CAM-85, CAM-86, CAM-87), con prueba en rojo primero.
- Los números de migración se reservan por tarea al asignarla (0003 `aplicar_ops`, 0004 endurecimiento, 0005 `sync_pull`, 0006 corrección de `touch_padre`) para que las ramas en paralelo no choquen.
- `npm run test:db` descubre solo todos los `tests/db/*.test.mjs` (`scripts/test-db.mjs`, CAM-87): una tarea nueva solo añade su archivo. Antes, una fusión había dejado una suite fuera de la línea sin avisar.
- Las pruebas de `core` cargan todas las migraciones, para que los flujos de negocio se prueben con los *triggers* de las migraciones posteriores.

## D-013 · Contrato de `aplicar_ops` (CAM-33) — 2026-11-18

La entrada es `[{op_id, tipo, datos}]` y la salida `{detener_cola, resultados:[{op_id, status, resultado?, error?:{codigo,mensaje}}]}`, con `status` `ok`, `ya_aplicada`, `revision` o `error` (sin `bloqueada`, D-009). Cada operación corre en su sub-bloque; las fallidas o en revisión no se registran en `sync_ops` y pueden reenviarse. Los tipos se registran en `tipos_op` desde cada migración. Detalle en `PLAN.md` §4.3, que reemplaza el contrato anterior (`payload`, `device_id`).

## Nota T-M1-04 · `tercero.crear` (CAM-34) — 2026-11-18

- Contrato en `PLAN.md` §4.3; migración `0007_op_tercero.sql`. La lógica vive en `crear_tercero_desde_payload` para que `pedido_venta.crear` y `orden_compra.registrar` la reutilicen con `cliente_nuevo`/`proveedor_nuevo`.
- Decisiones de detalle (valores por defecto, sin cambio de reglas de negocio): teléfono opcional, pero si viene debe tener 7–15 dígitos; `usar_existente` suma el rol faltante al tercero existente (un cliente que también vende pasa a ser proveedor) para que la compra pueda asociarse sin otra edición online; el consentimiento exigido a clientes (RF-TER-05) se valida aquí también.
- Las suites usan nombres de prueba bien distintos: la similitud por trigramas (≥ 0,5) marca como duplicados nombres como «Proveedor 3» y «Proveedor 30».

## Nota T-M1-14 · funciones sin acceso de `anon` (CAM-92, H-15) — 2026-11-18

- Causa: el `EXECUTE` por defecto de `PUBLIC` es global; `alter default privileges in schema public ... from public` (0004) no lo quita. Migración `0014_funciones_sin_anon.sql`: revoca `EXECUTE` a `PUBLIC`/`anon` en las existentes, lo concede a `authenticated` y `service_role`, y cambia los privilegios por defecto (global para `PUBLIC`, del esquema para `anon`). Cada migración futura queda cubierta por `tests/db/funciones_sin_anon.test.mjs`.
- Los privilegios por defecto aplican al rol que ejecuta la migración (en Supabase, `postgres`). **Verificado en Supabase real (CAM-40):** con `db reset`, las 48 funciones de `public` no son ejecutables por `anon` ni `PUBLIC`, una función nueva creada por `postgres` nace sin `EXECUTE` para ellos, y PostgREST responde 401/42501 a `anon` en `ping()` y en toda función de `public` (`tests/integration/privilegios.test.mjs`).
- Consecuencia: `ping()` ya no es público (la prueba exige cero funciones para `anon`). El keep-alive de T-M8-02 usará el JWT de un usuario de servicio en vez de la anon key. Cambia la excepción que decía `PLAN.md` §13.

## Nota H-02 · candado de pedidos finalizados (CAM-88) — 2026-11-18

- Contrato en `PLAN.md` §4.3; migración `0011_candado_finalizados.sql` con tres triggers (`pv_candado`, `pvi_candado`, `pagos_candado`), sin tocar migraciones previas.
- Decisiones de detalle: el candado de cabecera compara solo los seis campos de dinero, así que `notas`, `estado` y `finalizado_en` siguen editables (la suite `sync_pull` no cambia). El trigger de `pagos` filtra por `direccion = 'cobro'` para no tapar el CHECK que espera `core`. No se reasignan privilegios de funciones: eso es de CAM-92 (otorgar `EXECUTE` a `authenticated` en todas las funciones expondría las `op_*` fuera de `aplicar_ops`).
- Fuera de alcance (H-17): `costo_unitario` sigue editable en pedidos abiertos; se sobrescribe al finalizar.

## Nota T-M1-06 · `orden_compra.registrar` (CAM-36) — 2026-11-18

Decisiones por defecto, a revisar: (1) la op acepta `inmediata` y `encargo`; en `inmediata` exige recepción total y pago exacto (D-005), en `encargo` permite recepción parcial y pagos opcionales sin pasar del total (el pago posterior de un encargo aún no tiene op propia). (2) Códigos de error nuevos: `E_RECEPCION`, `E_SOBRE_RECEPCION`, `E_VENCIMIENTO` y `E_PAGO`; las validaciones van antes de insertar para no depender de los mensajes de los triggers. (3) Los ítems de la recepción se pueden indicar por posición (`item`) cuando el cliente no manda ids. (4) Un proveedor nuevo con duplicados detiene toda la op en `revision`; no se crea nada hasta que el usuario resuelve. (5) La lista de modalidades admitidas está en una variable de la función para que CAM-90 agregue `apertura` sin cambiar el contrato.

## Nota T-M1-05 · `pedido_venta.crear` (CAM-35) — 2026-11-18

Decisiones por defecto, a revisar: (1) **Impuesto:** `configuracion` solo tiene la clave `negocio` (sin tasa), y el esquema ya guarda la tasa por artículo (`articulos.tasa_impuesto`, hoy 0). La op copia esa tasa al ítem; lo que envíe el cliente se ignora. Si los socios prefieren una tasa global en `configuracion`, es un cambio local a la función. (2) **Precio:** el servidor siempre recalcula `precio_lista` con `precio_para` (incluye el escalón «Llévate 2», D-007) y `precio_unitario`; si el cliente envió otro valor (> $0,01) se corrige y se devuelve `PRECIO_CAMBIO`. RN-PRE-02 («se respeta lo pactado») se pensó para pedidos offline; como los pedidos son solo online (D-009), el precio que vale es el vigente al momento de crear. El pedido, una vez creado, nunca cambia de precio. (3) Artículo sin precio en la lista del cliente ni en la pública: error `E_PRECIO` (no se inventa un precio). (4) `STOCK` compara la suma pedida por artículo contra `v_stock.disponible_para_prometer`; solo advierte (E5). (5) Fecha del pedido hasta mañana (`E_FECHA`), como en la compra; la fecha estimada de entrega sí puede ser futura. (6) Descuento global mayor que el subtotal: `DATOS_INVALIDOS`. (7) El `cliente_id` debe ser un tercero con rol cliente. (8) `stock_visto_en`, `transportadora` y `guia` no se aceptan en la creación (los dos últimos se completan al finalizar). (9) Como en 0008/0009, `pedidos_venta.op_id` queda nulo (el manejador no recibe el `op_id`); la idempotencia la da `sync_ops`.

## D-014 · El inventario inicial se carga como compra de apertura — 2026-11-18

La auditoría funcional (`docs/auditoria-h1-2026-11-18.md`, H-01) mostró que un ajuste de inventario no fija el costo: solo las compras actualizan `costo_promedio`. Cargar así el stock existente deja el costo en 0, infla el margen de las primeras ventas y deja el capital en bodega en $0.

**Decisión (socio, 2026-11-18):** el inventario existente se carga como una **compra de apertura**: nueva modalidad `apertura` de `ordenes_compra`, con un proveedor genérico («Inventario inicial»). Se recibe como cualquier compra (suma stock y fija costo), **no** cuenta en `compras_periodo`, **no** genera cuenta por pagar y no admite pagos. Los ajustes siguen siendo solo para corregir diferencias y no fijan costo. Tarea: T-M1-12 (CAM-90, migración 0012). En ese PR se añade RN-COM-04 a `SPEC.md` y se actualizan RF-COM-01, T-M5-01 y el payload de `orden_compra.registrar` en `PLAN.md` §4.3 (`modalidad` admite `apertura`).

**Implementado en `0012_compra_apertura.sql` (CAM-90).** Notas: (1) **un ajuste no fija costo**: solo las compras (incluida la de apertura) mueven `costo_promedio`; queda documentado para que nadie cargue el inventario inicial como ajuste. (2) Decisiones por defecto, a revisar: en la op `orden_compra.registrar` la apertura exige recepción total y rechaza `pagos` con `E_PAGO`; el proveedor «Inventario inicial» se crea con `proveedor_nuevo` (o se reutiliza por `proveedor_id`), sin fila sembrada en la migración; un trigger impide cambiar la modalidad de/hacia `apertura` en una orden ya pedida; `v_cuentas_por_pagar` y `resumen_periodo` excluyen la apertura (tampoco cuenta como gasto del periodo). (3) El privilegio de ejecución de las funciones nuevas lo cubre 0014.

## D-015 · Decisiones del socio sobre los hallazgos pendientes de la auditoría de H1 — 2026-11-18

Con H1 cerrado, el socio resolvió los hallazgos que seguían sin decisión (tabla de la nota «auditoría H1»):

- **H-05 y H-07 (validaciones):** se validan **en el servidor y también en la app**. El servidor rechaza total negativo y descuento mayor que el subtotal, y exige los motivos y campos obligatorios de la spec. La app avisa antes, pero el servidor decide (regla 3). Tarea: T-M1-15 ([CAM-94](https://linear.app/caminocol/issue/CAM-94)), migración `0015`.
- **H-06 (reembolsos):** **entra al MVP**, con control de sobrepago. Solo con conexión (D-009). Como AGENTS.md dejaba las devoluciones parciales fuera del MVP, primero se acota en la spec: T-M1-17 ([CAM-96](https://linear.app/caminocol/issue/CAM-96), solo spec). De ahí salen las tareas de implementación (migración `0017`).
- **H-08 (flete):** valor por defecto, una sola vía para el costo del flete (la del costo de envío del pedido); se documenta dentro de T-M1-15.
- **H-09 (stock negativo):** **solo avisar.** Mermas y ajustes se aceptan aunque dejen stock negativo, y la app lo muestra como alerta (se construye con el inventario, T-M6). Las ventas siguen rechazándolo ([E6]).
- **H-16 (movimientos a mano):** **se cierra.** En inserts directos solo se admiten `ajuste` y `merma`; `compra` y `venta` nacen solo de recepciones y finalizaciones. Tarea: T-M1-16 ([CAM-95](https://linear.app/caminocol/issue/CAM-95)), migración `0016`.
- **H-10 a H-14, H-17:** sin cambios; siguen como se anotan en la tabla (se resuelven al llegar a su tarea).
- **Impuesto de `pedido_venta.crear` (T-M1-05):** el socio dio por bueno que el servidor use `articulos.tasa_impuesto` (no hay tasa en `configuracion`) y siempre el precio de lista vigente al crear, con advertencia `PRECIO_CAMBIO`.

## Nota T-M1-17 · spec de reembolsos y control de sobrepago (CAM-96, H-06) — 2026-11-18

Se especificó (solo documentación) lo que el socio aprobó en D-015: el reembolso entra al MVP, con control de sobrepago, solo con conexión. Está en `SPEC.md` (RF-PAG-04..06, RN-PAG-02..07, RN-VEN-02, §9.1, E16..E18, L3) y `PLAN.md` §4.3 (`pago.reembolsar`, esquema de `0017`). Implementación: T-M1-18 y T-M4-08. **Valores por defecto, marcados para revisión del socio:**

1. **Modelo:** el reembolso es una fila de `pagos` con `direccion = 'reembolso'` (no un cobro negativo ni un estado nuevo del pedido). El pedido sigue `cancelado` o `devuelto`; «por reembolsar» se deriva (cobrado neto > 0). Los candados de cobros de 0011 no se tocan.
2. **Cuándo:** solo PV `cancelado` o `devuelto`. No se reembolsa un `confirmado` (si el cliente quiere su dinero, se cancela primero).
3. **Parcial:** se permite reembolsar por partes y en varias veces hasta dejar el cobrado neto en 0; el tope es el del pedido, no el de cada cobro. La devolución de mercancía sigue siendo solo total (AGENTS: devoluciones parciales fuera).
4. **Medio:** libre entre los medios válidos; la app sugiere el del último cobro. No se exige devolver por el mismo medio.
5. **Motivo:** obligatorio en cada reembolso (texto), además del motivo de la cancelación o devolución.
6. **Quién:** cualquier miembro (L6, sin roles). Se guarda quién lo registró (`created_by`) y, si se indica, qué socio puso el dinero (`pagado_por`).
7. **Sin reembolso:** no hay acción «condonar». Si los socios deciden quedarse con el dinero (p. ej. cliente que no devuelve mercancía), el aviso «por reembolsar» queda abierto. **Pregunta para el socio (P-008):** ¿hace falta una forma de cerrar ese aviso sin devolver dinero (nota o motivo), o basta con el aviso? Por defecto: basta con el aviso.
8. **Contabilidad:** las ventas netas, el costo y la utilidad no cambian por el reembolso (un `devuelto`/`cancelado` ya no cuenta en `v_ventas_pedido`). El dinero devuelto se ve en la columna nueva `reembolsos` de `resumen_periodo`, informativa. Caso borde conocido: un pedido finalizado un mes y devuelto en otro desaparece de las ventas del mes de la finalización (comportamiento ya existente, E11).
9. **Sobrepago:** un cobro que dejaría lo cobrado neto por encima del total se rechaza (`E_SOBREPAGO`); también un cobro en un PV `cancelado` (`E_ESTADO`) y un cambio de totales por debajo de lo cobrado. Los cobros siguen sin op propia (se registran por T-M4-06); el control vive en triggers de `0017`, así que vale para cualquier ruta.
10. **Errores del reembolso:** no se edita ni se borra. Un reembolso equivocado es un caso manual fuera del MVP.
11. **No se construye:** comprobante o documento de reembolso (sin consecutivo), reembolso con transferencia automática, crédito a favor del cliente, devolución parcial de ítems.

## Nota T-M1-18 · reembolsos y control de sobrepago en el servidor (CAM-97, H-06) — 2026-11-18

Migración `0017_reembolsos.sql` (contrato en `PLAN.md` §4.3; pruebas en `tests/db/reembolsos.test.mjs` y `tests/integration/reembolsos.test.mjs`). Cumple lo especificado en T-M1-17; lo que se decidió al implementar, **a revisar**:

1. **Mensajes con el código como prefijo.** `E_SOBREPAGO`, `E_ESTADO`, `E_TOTAL`, `E_PAGO_INMUTABLE`, `DATOS_INVALIDOS` salen como `CODIGO: mensaje (RN-PAG-nn)`; el ID de la regla va dentro del mensaje, porque `aplicar_ops` solo reconoce `^[A-Z][A-Z0-9_]*:`.
2. **Sin función auxiliar de saldo.** El cobrado neto se calcula en línea en cada trigger y en la op (el PLAN fija una lista cerrada de objetos); el bloqueo `for update` del pedido va antes del cálculo.
3. **Cobros en PV `cancelado`:** insertar es `E_ESTADO`; editar o borrar un cobro existente también (cualquier campo, no solo el valor), porque dejaría el cobrado neto fuera de `0 ≤ neto ≤ total`. Borrar un cobro de un PV `recibido`/`confirmado` sigue permitido.
4. **`E_TOTAL`** se evalúa en `trg_pv_totales` solo cuando `total` cambia en un UPDATE; también salta si lo provoca `pv_recalcular` al editar ítems de un PV con cobros.
5. **Reembolso con `fecha` ausente** usa `now()`; con fecha, medianoche de Bogotá. La fecha acepta hasta mañana (`E_FECHA` si pasa).
6. **Orden de validación de la op:** formato (`DATOS_INVALIDOS`), `E_FECHA`, `E_REF` (socio, luego pedido), `E_ESTADO`, `E_SOBREPAGO`. El trigger de `pagos` repite estado, motivo y tope para SQL directo.
7. **`resumen_periodo`** cambió de tipo de retorno (`drop` + `create`); la columna `reembolsos` va al final. Los privilegios del `create` nuevo los cubren los default privileges de 0014.
8. **Pruebas de concurrencia (reales, Supabase local):** dos transacciones sobre el último saldo reembolsable (la segunda espera el bloqueo y recibe `E_SOBREPAGO`), 10 rondas por `aplicar_ops` con dos socios (un `ok`, un `E_SOBREPAGO`) y la misma carrera con dos cobros. `tests/integration/entorno.mjs` exige `pg`: en un checkout sin `node_modules` hay que correr `npm install` antes.

## Nota T-M1-15 · validaciones del servidor (CAM-94, H-05/H-07/H-08) — 2026-11-18

- Migración `0015_validaciones_pedido.sql`, solo triggers (sin grants). Contrato en `PLAN.md` §4.3; reglas en SPEC (RF-VEN-03, RF-VEN-05, RN-DOC-02, RN-COS-04).
- **Lista exacta de lo que la spec exige y ahora el servidor rechaza:** motivo al cancelar y al devolver un pedido (RF-VEN-05); `envio_costo` al finalizar con transportadora (RF-VEN-05); motivo al anular un documento por escritura directa (RN-DOC-02; `anular_documento` ya lo exigía); descuento ≤ subtotal y total ≥ 0 al finalizar (RF-VEN-03; el `crear` ya lo rechazaba desde 0010). **Ya estaba cubierto:** ajuste y merma exigen motivo (0013).
- **Valores por defecto tomados (a revisar por el socio):** (a) «exige `envio_costo`» = **mayor que cero**, porque la columna vale 0 por defecto y no distingue «sin dato»; una transportadora con flete gratis no se puede finalizar (se puede ajustar a entrega propia). (b) Motivo «vacío» incluye solo espacios. (c) La validación de descuento/total corre **al finalizar**, no al confirmar ni al editar ítems (un descuento temporalmente mayor mientras se editan ítems es legítimo).
- **H-08 (flete):** única vía = `envio_costo` del pedido (alimenta la utilidad bruta, RN-COS-03). Un gasto vinculado a un pedido de venta con categoría flete/envío/transporte/transportadora se rechaza (`E_FLETE`). Es un cierre por lista de categorías (el campo es texto libre); un flete cargado sin vínculo al pedido o con otra categoría no se detecta. El flete de compras (gasto vinculado a una OC) se sigue permitiendo.
- **Pruebas previas adaptadas:** las suites de `tests/integration` finalizaban pedidos con entrega por defecto (transportadora) sin `envio_costo`; ahora usan `entrega_tipo = 'recoge'`. Las suites de `tests/db` no cargan 0015, salvo `funciones_sin_anon`, y siguen verdes. La integración real no se corrió aquí (requiere Supabase local).
- **Pendiente (app):** que la app avise antes de enviar (D-015); el servidor ya decide.

## D-017 · Flujo de ramas por release: un solo PR por hito — 2026-11-18

Con H1 se vio que un PR por tarea genera conflictos constantes (todas las tareas tocan `DECISIONS.md`, `TASKS.md`, `PLAN.md`, `package.json` y el lock) y mucho trabajo de fusión manual. Sustituye el primer punto de D-012.

- **`main` solo recibe un PR por release:** de `release/<hito>` (`release/h2`, `release/h3`…). La release se crea desde `main` al empezar el hito, y su PR se abre en borrador al integrar la primera tarea (GitHub no permite abrirlo sin commits propios), para que el CI corra en cada push; se marca listo al cerrar el hito. Lo revisa y fusiona el socio.
- **Una rama por tarea,** `CAM-n-descripcion-corta`, creada **desde la release**. Se integra en la release **sin PR**: fusionar la release en la rama, resolver conflictos, todo en verde, `git merge --no-ff` a la release y push. Las tareas se integran de una en una; si el push se rechaza, se repite desde la fusión.
- **Linear:** *In Progress* al empezar; *In Review* al integrarse en la release; *Done* cuando el PR de la release se fusiona a `main`.
- **Pruebas y TDD:** se mantienen. El rojo primero (commit aparte) sigue siendo obligatorio; una tarea que no lo cumpla lo anota en el PR de la release. CAM-41 y CAM-42 (H2) se integraron sin rojo primero y se aceptaron por defecto, sin repetirlo.
- **`main` protegido** (CAM-10): exige PR y CI verde, sin pushes directos. Las ramas `release/*` y de tarea no se protegen. Un arreglo urgente sobre `main` va en rama desde `main` con su PR, y luego se fusiona `main` en la release.
- **Conflictos habituales:** `package-lock.json` (tomar el de la release y correr `npm install` en Docker), `DECISIONS.md` y `TASKS.md` (conservar las dos partes). Las notas de decisión de tareas se escriben sin número («Nota T-M2-04») para no chocar.
- **Cuándo abrir PR por tarea:** nunca, salvo que el socio lo pida para una tarea concreta (por ejemplo una de mucho riesgo).

## Nota revisión EGM del PLAN, ronda 2 (CAM-100) — 2026-11-18

- **Envío de pendientes de una en una** (RF-SYN-07): el cliente sube las ops por orden y se detiene en la primera que no sea `ok`/`ya_aplicada`. El servidor sigue aceptando lotes (D-013). Cierra H-12.
- **RN-PRE-02 corregida** en la SPEC: el servidor fija el precio con la lista vigente y avisa `PRECIO_CAMBIO`; ya no hay PV offline (D-009).
- **Limpieza del caché local:** se hace al iniciar sesión con un usuario distinto del recordado (T-M2-04), no al cerrar sesión.
- **Reembolsos (0017):** códigos `E_PAGO_INMUTABLE`, `E_TOTAL`, `E_ESTADO`, `E_SOBREPAGO`; el ID de la regla va en el mensaje, no como prefijo; los cobros de un PV `cancelado`/`devuelto` no se editan ni se borran.
- **Diferido a su tarea:** «cobrar y finalizar» atómico (T-M4-05/06) y la subida de fotos (T-M2-08).

## Addendum D-015 · reembolsos (T-M1-17) — 2026-11-18

Los valores por defecto de la nota «T-M1-17» (solo pedidos `cancelado`/`devuelto`, reembolso parcial en varias veces, medio libre, motivo obligatorio, cualquier miembro, sin editar ni borrar, sin comprobantes) y la pregunta **P-008** (sin acción «condonar»; basta el aviso «por reembolsar») **se mantienen** al no haber objeción del socio a 2026-11-18. Si objeta, se ajustan en T-M1-18 (CAM-97) antes de implementar.

## Nota T-M1-13 · cerrar la escritura directa (CAM-89, H-03) — 2026-11-18

- **Diseño (opción a):** triggers que validan y rechazan, en `0013_cerrar_escritura_directa.sql`. No se revocan privilegios de tabla (las ops y los triggers internos siguen escribiendo con normalidad). Todo es trigger INVOKER, así que también vale para superusuario y PGlite.
- Candados: `pedidos_venta` solo nace `recibido` y sin `finalizado_en`; `ordenes_compra` solo nace `borrador`; `consecutivos` no se borra y solo avanza de a uno **dentro de `emitir_documento`**; `articulos.costo_promedio` solo cambia desde un trigger anidado (`pg_trigger_depth() > 1`, o sea el de movimientos); `recepciones` y `recepcion_items` no se borran; un pedido `finalizado` o `devuelto` no se archiva; `ajuste` y `merma` exigen motivo (RF-INV-03).
- `emitir_documento` se redefinió (`create or replace`, copia de 0001 más `search_path` fijo) con una marca transaccional `camino.emitiendo`, que el candado de `consecutivos` comprueba. Límite conocido: la marca es un ajuste de sesión; un miembro que la fije a mano podría subir un consecutivo de a uno. Cerrarlo del todo exigiría revocar `UPDATE` sobre `consecutivos`, que se descartó por KISS.
- Se adaptó `tests/db/sync_pull.test.mjs` (carga 0006 y 0013; el stock y el costo salen de una compra recibida; los pedidos se finalizan por la ruta legítima). En la prueba nueva, el stock tras la remisión es 9 (10 recibidos menos 1 vendido), no 10.
- **H-16 queda pendiente de decisión del socio** (no se decidió aquí): un miembro puede insertar a mano un movimiento `compra`/`venta` y mover el costo promedio. Los candados de 0013 no lo cubren; si se decide restringir los tipos en inserts directos, va en una migración nueva.

## Nota T-M1-16 · movimientos de inventario solo internos (CAM-95, H-16) — 2026-11-18

- **Diseño:** trigger `before insert` en `movimientos_inventario` (`0016_movimientos_solo_internos.sql`) que rechaza todo tipo distinto de `ajuste` y `merma` cuando `pg_trigger_depth() <= 1` (insert directo). Es el mismo mecanismo de 0013 para `costo_promedio`; INVOKER, vale también para superusuario y PGlite. No se revocan privilegios de tabla.
- **Decisión por tipo:** `compra` (la genera el trigger de `recepcion_items`, también para la compra de apertura), `venta` (finalización del pedido) y `devolucion_cliente` (pedido a `devuelto`) quedan **solo internos**. `devolucion_proveedor` **también solo interno**: hoy ningún flujo lo genera (no hay devolución a proveedor en el MVP); si se construye, nacerá de su propio trigger. `ajuste` y `merma` siguen directos, con motivo (0013).
- Límite conocido: la profundidad de trigger no distingue quién dispara el trigger padre; un miembro que provoque a propósito una recepción o finalización legítima sigue generando solo el movimiento que esa operación define (esos triggers ya validan stock, pago y estado).
- **H-16 cerrado.** Pruebas: `tests/db/movimientos_internos.test.mjs`, con controles de recepción, apertura, finalización, devolución, ajuste y merma.
## Nota T-M1-10 · integración real con Supabase local (CAM-40) — 2026-11-18

- `npm run test:integration` corre `tests/integration/*.test.mjs` contra Supabase local (Postgres, Auth y PostgREST reales, `pg` como devDependency). Separado de `test:db`: necesita Docker y no corre en CI por ahora (el CI usa solo PGlite; correrlo en CI requeriría `supabase start`, unos GB de imágenes; queda como decisión de operación).
- Cierra [E6] (doble venta, también por PostgREST con dos JWT), RNF-SEC-02/[E12] (no miembro = 0 filas en todas las tablas y vistas) y la verificación de H-15 (ver Nota T-M1-14). Sin defectos nuevos en las migraciones 0001-0014 reales.
- Corrección de documentación: el parámetro de `aplicar_ops` es `ops` (no `p_ops`); PostgREST llama por nombre, así que el cliente debe enviar `{ "ops": [...] }`. Se corrigió `PLAN.md` §4.3.

## Nota T-M2-01 · login, guardia de rutas y "Sin acceso" (CAM-41) — 2026-11-18

- **Pertenencia a `miembros`:** el cliente consulta `miembros` filtrando por su `user_id`; la RLS solo muestra la fila a un miembro, así que 0 filas = no miembro (pantalla "Sin acceso", RF-AUTH-04). Cualquier error de red, 5xx o permisos da `desconocido`, **nunca** "no miembro".
- **Sin red (RF-AUTH-02):** si el token expiró y no hay red, `getSession` falla con error reintentable; la app conserva la sesión de Supabase y abre con el último usuario recordado (`camino.auth.usuario`) y con el último resultado positivo de pertenencia (`camino.miembro.<id>`, ambos en `localStorage`). Si nunca se comprobó la pertenencia en este dispositivo, muestra "Sin conexión" con **Reintentar**, sin cerrar sesión. Primer arranque sigue exigiendo conexión (PLAN §9).
- **Sesión caducada (`invalid_grant` con servidor alcanzable):** se pasa al login con aviso; no se toca Dexie ni la outbox.
- **Cierre de sesión:** `signOut({ scope: 'local' })`, que no depende de la red. La advertencia por pendientes y la exportación son T-M2-06 (RF-AUTH-03); hoy solo "Sin acceso" ofrece cerrar sesión.
- **Credenciales vs. red en el login:** `AuthApiError` 400/401/422 = "Correo o contraseña incorrectos"; error reintentable o `TypeError` de `fetch` = "No hay conexión"; el resto = mensaje genérico (p. ej. 429).
- Arquitectura: puerto `ServicioAuth` en `domain/auth`, adaptador Supabase en `infra/auth`, `AuthProvider` en `application/auth` (recibe el servicio, por eso las pruebas usan un falso sin red). Se añadió `afterEach(cleanup)` a `test-setup.ts` porque Vitest corre con `globals: false`.
## Nota T-M2-02 · PWA instalable (CAM-42) — 2026-11-18

- `vite-plugin-pwa` 2.0.0 (compatible con Vite 8) + `workbox-build`/`workbox-window` 7.4. Estrategia `generateSW`, `registerType: 'prompt'`: el SW nuevo queda en espera y solo toma el control al tocar "Actualizar" (mensaje `SKIP_WAITING`). Sin `skipWaiting`/`clientsClaim` automáticos. El aviso no recarga solo; el usuario decide cuándo (RF-OPS-03).
- El SW solo precachea el shell y hace `navigateFallback` a `index.html`. **No define `runtimeCaching`**: no intercepta Supabase ni guarda datos (más estricto que el "NetworkOnly" de PLAN §6; equivalente en efecto). Sin Background Sync.
- Íconos: se reutilizan los de la vitrina (`caminocol.com`: montaña y camino en cacao sobre crema, 192, 512 y maskable 512) y `apple-touch-icon` de 180 px derivado del 512. **Pendiente de reemplazo** si los socios quieren íconos específicos del back-office. `theme_color` #5A3A2A, `background_color` #F6EFE2.
- `navigator.storage.persist()` se pide al arrancar y al evento `appinstalled`. Su estado se muestra en `/ajustes` (pantalla mínima creada aquí; irá creciendo con otras tareas). "Cómo instalar" vive en `/instalar`, enlazada desde Home y Ajustes.
- Fuera de esta tarea: `_redirects` y `_headers` (CSP) de Cloudflare Pages (PLAN §6, hosting) y el botón nativo `beforeinstallprompt`.

## Nota T-M2-06 · centro de pendientes (CAM-46) — 2026-11-18

- **Pantalla** `/pendientes` (`ui/pendientes/`, protegida por el login, enlazada desde Home): lista por `created_at` con resumen legible, estado y antigüedad; checkbox; **Subir seleccionados** (único camino de envío, vía `pendientesService.subir`, de una en una; resultado ✔/⚠/✖ por fila); **Descartar** con confirmación; **Decidir** en filas `revision` (candidatos, «Usar existente» / «Crear igual» vía `resolver`; la fila vuelve a `pendiente` y hay que pulsar Subir); **Exportar JSON**. Sin Editar ni Importar (D-009).
- Las filas en `revision` seleccionadas se omiten al subir (detendrían la cola); primero se decide. Tras subir con algún ✔ se pide un pull (`useSync()?.actualizar()`).
- `pendientesService.descartar(opIds)` (nuevo): borra la op, las filas locales con `_pendiente = op_id` (nunca llegaron al servidor) y los `adjuntos_locales` de esa op, en una transacción. No toca el servidor. Si se descarta una op base, las dependientes (p. ej. `adjunto.vincular`) fallarán al subir y también se descartan.
- **Exportación** (`infra/sync/exportar.ts`): formato de PLAN §5.3; el campo `fotos_locales_sin_exportar` cuenta las filas de `adjuntos_locales`. Archivo `camino-pendientes-AAAA-MM-DD.json` (fecha de Bogotá).
- **Cableado:** `ui/pendientes/ServiciosApp` (dentro de `SyncProvider`) instancia `crearPendientesService` y el escritor con `crearOpsApi(obtenerClienteSupabase())` y los expone por `PendientesProvider`; el escritor llama al pull tras cada `aplicada`. Ninguna pantalla usa aún el escritor (llega en H3).
- **Banner** `BannerPendientes` («N sin subir (el más viejo: hace X)») en Home y en la pantalla; solo avisa y enlaza. El indicador global siempre visible es T-M2-07.
- **Cierre de sesión (RF-AUTH-03, E13):** botón «Cerrar sesión» en Ajustes; con pendientes avisa cuántos y ofrece «Exportar JSON», «Cerrar sesión de todos modos» o «Cancelar». Cerrar no borra datos locales. `pwa.test` ahora monta `Ajustes` dentro de `AuthProvider`.
- Fotos (CAM-48): `ServiciosApp` inyecta `crearAdjuntosService` (almacén `crearAlmacenSoportes`) en `pendientesService`; tras «Subir seleccionados» la pantalla muestra el resumen de fotos (subidas / con error / esperando). `descartar` borra los `adjuntos_locales` de la op. Sin botón aparte para reintentar solo fotos: se reintentan en la siguiente subida manual.

## Nota T-M2-05 · escritor y subida de pendientes (CAM-45) — 2026-11-18

- **Capas:** `infra/supabase/opsApi.ts` llama `rpc('aplicar_ops', {ops})` con `.abortSignal` y clasifica en `ok | red | rechazo | no_aplicado` (función pura `clasificarRespuestaRpc`). `infra/sync/` tiene `tiposOp` (Zod + si admite offline), `outboxRepo`, `writer.commit` y `pendientesService.subir/resolver`. Zod 4 es la única dependencia nueva.
- **Clasificación:** red = TypeError/AbortError/timeout/502-504; rechazo = error con SQLSTATE de 5 caracteres (los `PGRSTnnn` no lo son) o `status:error` de la op; 401, 429 y otros 5xx = `no_aplicado` (se encola con aviso; el 401 marca `requiereLogin`). Un 5xx con SQLSTATE sigue siendo `no_aplicado`.
- **Revisión:** en tipos que admiten offline la fila se guarda en outbox como `revision` (con `resultado.candidatos`) y la fila local `_pendiente` se conserva, para no perder lo capturado si se cierra la app; en `pedido_venta.crear` (solo online) se devuelve a la UI sin encolar.
- **Resolución:** `resolver(opId, resolucion)` escribe `resolucion` en `datos.proveedor_nuevo`/`datos.cliente_nuevo` si existen (como exige el contrato de compras y pedidos) y si no en `datos.resolucion` (`tercero.crear`); luego la fila vuelve a `pendiente`.
- **`subir`:** una fila en `error` se puede reenviar (la op no quedó registrada); una fila en `revision` no se envía y detiene la subida hasta resolverla. Fallo de red o `no_aplicado` deja la fila `pendiente` y detiene.
- `'bloqueada'` salió de `EstadoOutbox`; el esquema Dexie no cambia (sigue `version(1)`), no hizo falta `version(2)`.
- Sin cableado a la UI ni al cliente real todavía: `crearEscritor` y `crearPendientesService` reciben `db` y un `OpsApi` (`crearOpsApi(obtenerClienteSupabase())`); el centro de pendientes (CAM-46) los instancia.

## Nota T-M2-04 · puller (CAM-44) — 2026-11-18

- **Quién es el dueño del caché: `kv.cache_usuario` (Dexie), no `camino.auth.usuario`.** El servicio de auth sobrescribe `camino.auth.usuario` en cada inicio de sesión, así que al llegar al puller ya no se sabe quién era el usuario anterior. El puller guarda en `kv` el id del usuario cuyo caché hay en la base y, si al activarse la sesión es otro, llama a `limpiarCacheDeServidor` antes del primer pull. Primera instalación (sin valor): no limpia. `kv` nunca se limpia (regla 10).
- `SyncProvider` (dentro de `AuthProvider`) corre el pull al quedar la sesión en `activo` y en cada `visibilitychange` a visible; un solo pull en vuelo a la vez. El botón «Actualizar datos» vive en Ajustes (`ui/BotonActualizar`); el indicador global «datos al …» es T-M2-07. Falta el pull «tras cada escritura exitosa» de PLAN §5.4: lo agrega el escritor (T-M2-05) llamando a `actualizar()`.
- Red vs rechazo (`ErrorPull`): sin código de error PostgREST, status 0 o 502-504, o timeout (20 s) = `red`; cualquier otro error con código = `rechazo`. En ambos casos no se borra nada, no se mueve el cursor y no se toca la sesión. Una respuesta que no se pueda aplicar (`datos`) revierte la transacción completa.
- LWW: solo se descarta la fila del servidor si su `updated_at` es **estrictamente** más viejo que el local (los pagos cambian sin mover el `updated_at` del padre, así que un igual se aplica). Las filas `_pendiente` nunca se pisan. Los pagos de pedidos se guardan tal cual, sea `cobro` o `reembolso` (0017).

## Nota auditoría H1 · hallazgos pendientes de decisión — 2026-11-18

Del informe de auditoría, los hallazgos H-01 a H-03 ya tienen tarea (T-M1-12, T-M1-11, T-M1-13). H-04 es el trabajo pendiente de CAM-35/36/37 (aún sin iniciar). Los demás **no tienen tarea ni decisión**; se resuelven cuando el socio decida:

| Hallazgo | Tema | Pendiente de decidir |
|---|---|---|
| H-05 | Pedido con total negativo se finaliza sin cobrar | **Decidido (D-015):** validar en servidor y app. Tarea T-M1-15 (CAM-94) |
| H-06 | Sin reembolso en cancelación o devolución con cobro; sin control de sobrepago | **Decidido (D-015):** entra al MVP. Spec hecha (T-M1-17, nota «T-M1-17»); implementación T-M1-18 y T-M4-08 |
| H-07 | Motivos obligatorios, `envio_costo` al finalizar con transportadora y otras reglas de la spec sin exigir | **Decidido (D-015):** van al servidor y a la app. Tarea T-M1-15 (CAM-94) |
| H-08 | Doble conteo del flete (costo de envío del pedido y gasto vinculado) | **Por defecto (D-015):** una sola vía, documentada en T-M1-15 |
| H-09 | Stock negativo por mermas y ajustes | **Decidido (D-015):** solo avisar (alerta en la app, T-M6) |
| H-10 | Reporte por artículo no reparte el descuento global | cómo repartirlo (T-M7-02) |
| H-11 | Conversión libra a gramo no existe en la base ni tiene prueba de paridad | cubrir en T-M5-01 |
| H-12 | La cola no se detiene en el servidor tras una `revision` (PLAN §4.3 lo declara) | confirmar que el cliente (T-M2-05/06) se detiene |
| H-15 | Las funciones creadas después de 0004 son ejecutables por `anon` | tarea T-M1-14 (CAM-92), ya con prueba en rojo |
| H-16 | Un miembro puede insertar a mano movimientos de inventario de tipo `compra`/`venta` (mueve `costo_promedio` sin orden ni recepción) | restringir los tipos permitidos en inserts directos. **Decidido (D-015):** se cierra. Tarea T-M1-16 (CAM-95) |
| H-17 | `costo_unitario` de los ítems es editable en pedidos abiertos (se sobrescribe al finalizar) | sin impacto en resultados; se anota |
| H-13/H-14 | Detalles menores (redondeo a pesos, `anular_documento` inexistente, `v_cuentas_por_cobrar` sin pedidos `recibido`) | revisar al llegar a la UI |

**Aviso de numeración:** el PR #9 (`docs: estado del proyecto…`) usó el número CAM-88 en su rama, pero en Linear CAM-88 es la tarea H-02 (candado de pedidos finalizados). Un `git log --grep CAM-88` mezcla ambos; el commit `919f731` es el de documentación.

## D-016 · Base local Dexie, device_id y UUID v7 (T-M2-03, CAM-43) — 2026-11-18

- **Esquema v1 = PLAN §5.1 sin cambios.** `sync_meta` queda con clave `tabla` pero, por D-009 (cursor único de `sync_pull`), el puller usa una sola fila `tabla = 'global'`. `terceros.roles` no viene del servidor: el puller lo deriva de `es_cliente`/`es_proveedor` (`['cliente','proveedor']`) para poder indexar por rol. `gastos` existe localmente aunque `sync_pull` no los trae (los escribe el cliente).
- **La outbox no se pierde (regla 10).** Las versiones de Dexie solo agregan (`version(n+1).stores().upgrade()`); no se borra la base ni se retoca `version(1)`. Al cerrar sesión o cambiar de usuario solo se usa `limpiarCacheDeServidor`: borra el caché espejo y el cursor, y conserva `outbox`, `adjuntos_locales`, `kv` y las filas `_pendiente`.
- **`device_id`:** UUID v7 en `kv` (`clave = 'device_id'`), creado con una transacción de escritura para que dos pestañas no generen dos. Es etiqueta de diagnóstico; el orden de eventos lo decide el servidor (RF-SYN-11).
- **UUID v7 propio** (~40 líneas, sin dependencia): monótono dentro del milisegundo y si el reloj retrocede.
- **Formato:** `Intl` con `es-CO`; COP redondeado a entero, sin `-$ 0`; agrupación de miles siempre (es-CO no agrupa 4 dígitos por defecto); fechas por `America/Bogota` por nombre. Una fecha de calendario `AAAA-MM-DD` (p. ej. `gastos.fecha`) no se convierte de zona, para que no se corra un día.
- **Sin `navigator.storage.persist()` por ahora.** iOS/Safari puede desalojar IndexedDB de una PWA no instalada; queda como idea para T-M2-06 (centro de pendientes) o la tarea PWA, sin decidir aquí.

## Contexto de negocio

- [docs/negocio/catalogo.md](negocio/catalogo.md): estructura de productos, artículos, precios y costos, cruzando el sitio y el costeo oficial.
- [docs/negocio/costeo-oficial.pdf](negocio/costeo-oficial.pdf): costeo del 17 nov 2026.

## Preguntas abiertas

| ID | Pregunta | Afecta |
|---|---|---|
| P-003 | Supuestos S1–S5 de la spec (flete, deducciones, costo promedio, IVA, pull automático) | SPEC §5 |

**Resueltas:** P-001 → D-002 · P-002 → D-006 · P-004 → D-005 · P-005 → D-008 · P-006 y P-007 → D-007.

## Nota T-M2-08 · fotos locales y subida posterior (CAM-48) — 2026-11-18

- **Capas:** `lib/imagen.ts` (`comprimirImagen`, motor inyectable; real = `createImageBitmap` con orientación EXIF + `OffscreenCanvas`/canvas), `infra/sync/adjuntosService.ts` (`guardar`, `subirListas`), `infra/supabase/soportes.ts` (Storage `soportes`, `upsert: true` para que reintentar sea idempotente). Sin UI de captura ni dependencias nuevas.
- **Compresión:** WebP; prueba calidades 0,8 a 0,4 y, si no alcanza 150 KB, reduce el lado un 15 % (mínimo 320 px). Si `toBlob('image/webp')` devuelve otro tipo (iOS Safari sin codificación WebP) recae en JPEG (`.jpg`). Si aun así pasa de 150 KB al mínimo, se guarda igual (mejor pesada que perdida).
- **`path`:** `<entidad>/<entidad_id>/<uuid del adjunto>.<webp|jpg>`. La política `soportes_solo_miembros` (0004) solo exige ser miembro: el formato es convención nuestra; el servidor tampoco comprueba que el objeto exista al vincular.
- **Estados:** `local`, `subiendo` (si la app muere aquí se trata como `local`), `subida`, `vinculada` (se borra el blob), `error` (+ motivo). Fallo de red al vincular deja `subida` (no vuelve a subir). El `id` del adjunto es también el `op_id` de `adjunto.vincular`, así reenviar es idempotente.
- **Regla 5 y enganche:** `guardar` nunca sube. `pendientesService.subir(opIds)` (acción explícita) llama a `adjuntos.subirListas()` después de las ops, salvo que alguna terminara en `red`/`no_aplicado`; devuelve `ResumenSubida.adjuntos`. Una foto solo se sube si su `op_id` ya no está en outbox (aplicada); una op aplicada online también cuenta, porque nunca estuvo en outbox. Un fallo de foto no altera el resultado de las ops; los `error` se reintentan en la siguiente acción manual. **Para CAM-46:** inyectar `adjuntos` al crear `pendientesService` y mostrar `adjuntos` del resumen; para reintentar solo fotos basta llamar `adjuntos.subirListas()` desde un botón.
- **Límites:** sin tiempo límite en la subida a Storage (supabase-js no lo trae). `crearAdjuntosService` aún no se conecta a la app (no hay pantalla de captura). En pruebas, `fake-indexeddb` no conserva `Blob.size`; el IndexedDB real guarda Blobs nativamente.
- **Verificación de APIs (T-M2-08, regla 7):** contrastado con la documentación vigente (Context7: supabase-js/storage-js y MDN). `storage.from(b).upload(path, blob, {contentType, upsert})` devuelve `{ data, error }` (`error: StorageError`), `upsert` va por defecto en `false` (se envía `x-upsert`), y con un `Blob` el tipo viaja en el propio blob (`contentType` solo importa para otros cuerpos): `soportes.ts` ya es coherente, sin cambios. `toBlob(cb, type, quality)` y `OffscreenCanvas.convertToBlob` exportan **PNG** si el formato no está soportado y `toBlob` puede dar `null`; el respaldo a JPEG se decide por `blob.type !== 'image/webp'`, no por suposición. `createImageBitmap` aplica EXIF por defecto (`imageOrientation: 'from-image'`), que pasamos explícito. Sin cambios de código. Pruebas probadas en rojo rompiendo a propósito (sin tope de lado, sin tope de peso, sin espera a la op, sin reutilizar `subida`): fallaron 9 pruebas; se restauró.
- **Falta verificar en dispositivo real (iPhone y Android):** que `toBlob('image/webp')` en el Safari de iOS usado devuelva WebP o PNG (y que entonces se use JPEG), que `OffscreenCanvas.convertToBlob` exista o caiga al canvas normal, que la foto de cámara salga con la orientación correcta, el peso final (≈ ≤ 150 KB) y el tiempo de compresión, y la subida real al bucket `soportes` con una sesión de miembro (política de 0004). Un `convertToBlob` que rechace (EncodingError) hoy sube como error de compresión, no como `null`.

## Nota T-M2-09 · E2E base con Playwright (CAM-49) — 2026-11-18

- **Qué es.** `apps/web/e2e/e1-sin-red.spec.ts`: con Supabase local real, primera carga con red (login y app shell precacheado), se corta la red (`context.setOffline(true)`), la app abre desde el service worker, se crea un gasto con el escritor real, queda en la outbox con su marca `_pendiente` (el ⏳) y el indicador cuenta «1 pendiente»; al volver la red aparece el banner «1 sin subir», **no sale ninguna petición `aplicar_ops`** (ni siquiera tras 2 s) y el servidor no tiene el dato hasta pulsar «Subir seleccionados»; entonces el pendiente desaparece, hay exactamente una petición y el gasto existe en el servidor (consultado con la clave de servicio). Corre en **Chromium y WebKit** (viewport 360 px).
- **Alcance de [E1].** Cubre la mecánica sin red → ⏳ → banner → subida manual. **No** cubre todavía la compra con proveedor nuevo, recepción, pago y foto, ni el recálculo del costo promedio: faltan las pantallas de H3. El ⏳ se verifica en el dato (`_pendiente` = `op_id`); la etiqueta visible en la fila llega con las pantallas de H3. Cuando existan, este E2E se amplía a la compra completa de [E1].
- **Gancho solo de prueba.** No hay pantalla para crear compras, proveedores ni gastos hasta H3. `src/e2e/GanchoE2E.tsx` expone `window.__camino_e2e.commit(...)` (llama al **mismo** escritor de `ServiciosApp`, sin duplicar lógica) y `fila(tabla, id)`. Solo se importa si `import.meta.env.MODE === 'e2e'` (`vite build --mode e2e`). `src/e2e/bundle.test.ts` construye de verdad en modo `production` y en `e2e`: el primero **no** contiene la marca `__camino_e2e` y el segundo sí (así la comprobación puede fallar). Corre con `npm test`.
- **Cómo corre.** `npm run test:e2e` (host) → `scripts/test-e2e.mjs` lee las claves de `supabase status`, crea el usuario `e2e@e2e.test` y su fila en `miembros` con la API de administración, y lanza el servicio `e2e` de `docker-compose.yml` (perfil `e2e`, imagen oficial `mcr.microsoft.com/playwright:v1.65.1-noble`, versión **igual** a `@playwright/test` exacto en `apps/web/package.json`). Dentro, Playwright construye en modo `e2e` y sirve con `vite preview`; el navegador alcanza el Supabase del PC por `host.docker.internal`. La clave de servicio llega solo por entorno al proceso de prueba (jamás al bundle: a este solo va la anon key). Sin secretos en el repo. Argumentos extra pasan a Playwright (`npm run test:e2e -- --project=chromium`). Requisito: `npm run db:start` y `npm run db:reset`.
- **Ubicación.** Los E2E viven en `apps/web/e2e/` (no en `tests/e2e/` como decía el mapa del repo) para resolver `@playwright/test` desde los `node_modules` del volumen de Docker, y Vitest los excluye. El mapa de AGENTS.md y el README se ajustan.
- **CI.** Desactivado: necesita Supabase local (varios GB de imágenes) y la imagen de Playwright, igual que `test:integration`. Queda anotado en `ci.yml`; el E2E se corre en local antes de cerrar cada hito. Si se quisiera en CI, sería un job manual (`workflow_dispatch`) que levante Supabase con la CLI.
- **Hallazgos para revisar.** (1) Sin red, el arranque queda en «Cargando…» varios segundos (en WebKit ≈ 6 s; en Chromium la comprobación de 5 s del primer intento fue insuficiente): `supabase-js` intenta refrescar/consultar con la red caída antes de caer a la sesión recordada. No pierde datos, pero es lento en finca; conviene medirlo en el teléfono y, si hace falta, acotarlo con un tiempo límite en `cargarSesion`/`esMiembro` (tarea aparte). El E2E espera hasta 20 s. (2) El título «Camino Col» y el aviso «Lista para usarse sin conexión.» también aparecen en el login: el E2E espera la barra «Estado de la app» (solo con sesión) para saber que entró. (3) Con `setOffline` ambos motores emiten el evento `offline`, así que el escritor encola con motivo `sin_conexion` (la rama de fallo por petición ya la cubren las pruebas del escritor).

## Nota T-M3-05 · paridad de precios con vectores compartidos (CAM-54) — 2026-11-18

`apps/web/src/domain/pricing` (`precioPara`, `precioRequerido`, `ErrorSinPrecio`) refleja `precio_para` de `0001_core.sql` (RN-PRE-01). Decisiones: (1) **Paridad por vectores JSON compartidos** (`tests/db/vectores/precio_para.json`): `tests/db/precio_paridad.test.mjs` los ejecuta contra `precio_para` en PGlite (con `npm run test:db`) y `pricing.test.ts` contra el módulo TS (en Docker). No se carga PGlite en Vitest porque vive en el `node_modules` de la raíz y no en el volumen de `apps/web`, y Node 20 del CI no ejecuta `.ts`; así no hay dependencias nuevas fuera de `fast-check` (dev). Si un lado cambia, el otro deja de pasar. (2) Además hay pruebas de propiedad con `fast-check` contra un modelo independiente (listas, escalones y cantidades aleatorias, precios enteros COP). (3) El cliente recibe la `lista_precio_id` del cliente ya resuelta (null si no tiene o no se conoce) y la lista pública; sin precio devuelve null (`precioRequerido` lanza `ErrorSinPrecio`, equivalente a `E_PRECIO`). (4) Sin redondeo: `precio_para` no redondea; con precios enteros COP el resultado es entero. Cantidades de hasta 3 decimales (`numeric(12,3)`). Una lista propia con precio solo en un escalón superior no tapa a la pública cuando la cantidad no lo alcanza (verificado en ambos lados).
