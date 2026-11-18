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

- Cada tarea tiene su issue en Linear y su rama `CAM-n-descripcion-corta` creada desde `main` actualizado; un PR por tarea. **Excepción única:** H1 (cimientos) se entregó en un solo PR (#2) porque eran la reestructuración del repo y el arranque.
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

## D-014 · El inventario inicial se carga como compra de apertura — 2026-11-18

La auditoría funcional (`docs/auditoria-h1-2026-11-18.md`, H-01) mostró que un ajuste de inventario no fija el costo: solo las compras actualizan `costo_promedio`. Cargar así el stock existente deja el costo en 0, infla el margen de las primeras ventas y deja el capital en bodega en $0.

**Decisión (socio, 2026-11-18):** el inventario existente se carga como una **compra de apertura**: nueva modalidad `apertura` de `ordenes_compra`, con un proveedor genérico («Inventario inicial»). Se recibe como cualquier compra (suma stock y fija costo), **no** cuenta en `compras_periodo`, **no** genera cuenta por pagar y no admite pagos. Los ajustes siguen siendo solo para corregir diferencias y no fijan costo. Tarea: T-M1-12 (CAM-90, migración 0012). En ese PR se añade RN-COM-04 a `SPEC.md` y se actualizan RF-COM-01, T-M5-01 y el payload de `orden_compra.registrar` en `PLAN.md` §4.3 (`modalidad` admite `apertura`).

## Nota auditoría H1 · hallazgos pendientes de decisión — 2026-11-18

Del informe de auditoría, los hallazgos H-01 a H-03 ya tienen tarea (T-M1-12, T-M1-11, T-M1-13). H-04 es el trabajo pendiente de CAM-35/36/37 (aún sin iniciar). Los demás **no tienen tarea ni decisión**; se resuelven cuando el socio decida:

| Hallazgo | Tema | Pendiente de decidir |
|---|---|---|
| H-05 | Pedido con total negativo se finaliza sin cobrar | validar total ≥ 0 y descuento ≤ subtotal (probablemente en `pedido_venta.crear` y al finalizar) |
| H-06 | Sin reembolso en cancelación o devolución con cobro; sin control de sobrepago | ¿entra al MVP o se maneja fuera de la app? |
| H-07 | Motivos obligatorios, `envio_costo` al finalizar con transportadora y otras reglas de la spec sin exigir | ¿van al servidor? |
| H-08 | Doble conteo del flete (costo de envío del pedido y gasto vinculado) | una sola vía documentada |
| H-09 | Stock negativo por mermas y ajustes | validar o solo avisar |
| H-10 | Reporte por artículo no reparte el descuento global | cómo repartirlo (T-M7-02) |
| H-11 | Conversión libra a gramo no existe en la base ni tiene prueba de paridad | cubrir en T-M5-01 |
| H-12 | La cola no se detiene en el servidor tras una `revision` (PLAN §4.3 lo declara) | confirmar que el cliente (T-M2-05/06) se detiene |
| H-15 | Las funciones creadas después de 0004 son ejecutables por `anon` | tarea T-M1-14 (CAM-92), ya con prueba en rojo |
| H-16 | Un miembro puede insertar a mano movimientos de inventario de tipo `compra`/`venta` (mueve `costo_promedio` sin orden ni recepción) | restringir los tipos permitidos en inserts directos; encaja en T-M1-13 si se decide |
| H-17 | `costo_unitario` de los ítems es editable en pedidos abiertos (se sobrescribe al finalizar) | sin impacto en resultados; se anota |
| H-13/H-14 | Detalles menores (redondeo a pesos, `anular_documento` inexistente, `v_cuentas_por_cobrar` sin pedidos `recibido`) | revisar al llegar a la UI |

**Aviso de numeración:** el PR #9 (`docs: estado del proyecto…`) usó el número CAM-88 en su rama, pero en Linear CAM-88 es la tarea H-02 (candado de pedidos finalizados). Un `git log --grep CAM-88` mezcla ambos; el commit `919f731` es el de documentación.

## Contexto de negocio

- [docs/negocio/catalogo.md](negocio/catalogo.md): estructura de productos, artículos, precios y costos, cruzando el sitio y el costeo oficial.
- [docs/negocio/costeo-oficial.pdf](negocio/costeo-oficial.pdf): costeo del 17 nov 2026.

## Preguntas abiertas

| ID | Pregunta | Afecta |
|---|---|---|
| P-003 | Supuestos S1–S5 de la spec (flete, deducciones, costo promedio, IVA, pull automático) | SPEC §5 |

**Resueltas:** P-001 → D-002 · P-002 → D-006 · P-004 → D-005 · P-005 → D-008 · P-006 y P-007 → D-007.
