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

## Contexto de negocio

- [docs/negocio/catalogo.md](negocio/catalogo.md): estructura de productos, artículos, precios y costos, cruzando el sitio y el costeo oficial.
- [docs/negocio/costeo-oficial.pdf](negocio/costeo-oficial.pdf): costeo del 17 nov 2026.

## Preguntas abiertas

| ID | Pregunta | Afecta |
|---|---|---|
| P-003 | Supuestos S1–S5 de la spec (flete, deducciones, costo promedio, IVA, pull automático) | SPEC §5 |

**Resueltas:** P-001 → D-002 · P-002 → D-006 · P-004 → D-005 · P-005 → D-008 · P-006 y P-007 → D-007.
