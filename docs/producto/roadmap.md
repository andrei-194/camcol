# Roadmap de Camino

Última actualización: 2026-11-18. Decisión de base: [ADR-0004](../adr/0004-plataforma-propia-pwa-supabase.md), que reemplaza a [ADR-0003](../adr/0003-odoo-como-back-office.md).

## Qué estamos construyendo

Una **PWA móvil propia** (iPhone y Android) sobre Supabase, con costo de infraestructura ≈ $0. Es la oficina interna de Camino Col: pedidos de venta, compras a productores (también **sin señal**, en finca), inventario, pagos, gastos, documentos para WhatsApp y analítica de dirección. El sitio público (`caminocol.com`, Next.js en Vercel) se mantiene como está.

El negocio no cambia; cambia la herramienta. Fuente de verdad: `docs/spec/` (`SPEC.md`, `PLAN.md`, `TASKS.md`). El detalle de tareas vive en `TASKS.md`; este documento solo organiza los hitos.

**Métrica de éxito (UAT):** la socia registra una compra en finca sin señal y la sube después, de forma consciente; ambos ven stock y dashboard correctos; un pedido de WhatsApp se registra en menos de 60 s y recorre todos sus estados sin errores de inventario.

## Estado actual (2026-11-18)

**H1 Cimientos: cerrado (PR #12 a #20).** La base de datos implementa el flujo `recibido → confirmado → finalizado`, `aplicar_ops` idempotente con todas sus operaciones, `sync_pull`, candados de seguridad (pedidos finalizados, escritura directa, funciones sin acceso de `anon`) y pruebas de integración reales contra Supabase local (RLS por JWT, concurrencia). Las decisiones de la auditoría están en D-015.

| Tarea | Estado |
|---|---|
| T-M0-01 a 05 · app web, pruebas con IDs, Supabase local, CI, runbook | Hecho (CI corriendo; falta la protección de rama, CAM-10) |
| T-M1-00 a 14 · esquema, operaciones, `sync_pull`, endurecimiento, compra de apertura, candados, integración real | Hecho |
| T-M1-15 a 17 · validaciones del servidor, movimientos a mano, spec de reembolsos (D-015) | Pendiente, antes o junto a H3 |
| T-M2-00 · spike en iPhone real | Pendiente; necesita un iPhone físico |
| T-M2-01 a 09 · app base offline (H2) | Siguiente |

## Principios

1. **Primero lo visible.** Cada hito termina con algo que se puede enseñar funcionando. Hasta que cierra H2 lo visible es la app abriendo sin conexión; el valor de negocio llega en H3.
2. **Spec primero, prueba primero.** Cada prueba cita el ID del requisito (`[RN-INV-03]`, `[E5]`). Un requisito sin prueba no está terminado.
3. **Un PR por tarea** de `TASKS.md`.
4. **KISS:** se respeta la lista "fuera del MVP" de la spec (DIAN, API de WhatsApp, roles finos, FEFO, etc.).
5. **Datos de ensayo** hasta tener producción con backups y la restauración probada.
6. **Columna vertebral antes que pantallas:** no se empieza H3 hasta que el E2E de H2 pase (regla de `TASKS.md`).

## Hitos

Los hitos son agrupaciones del roadmap. Los bloques `T-M0…T-M8` son los de `TASKS.md`.

| Hito | Objetivo | Bloques de TASKS | Fecha objetivo (estimada) |
|---|---|---|---|
| **H1 Cimientos** | Repo reproducible con CI y base de datos con `aplicar_ops` y `sync_pull` probados | T-M0, T-M1 | 8 dic 2026 |
| **H2 App base offline** | PWA instalable con login, datos locales, escritor, puller y centro de pendientes | T-M2 | 22 dic 2026 |
| **H3 Operación diaria** | Terceros, catálogo, pedidos de venta y compras de punta a punta | T-M3, T-M4, T-M5 | 2 feb 2027 |
| **H4 Inventario y dirección** | Stock, kardex, lotes y dashboard | T-M6, T-M7 | 23 feb 2027 |
| **H5 Producción y UAT** | Backups, seguridad, rendimiento, despliegue y prueba con ambos socios en dispositivos reales | T-M8 | 15 mar 2027 |

Las fechas son una **estimación inicial** para una sola persona desarrollando, con pausa de fin de año. Se recalibran al cerrar H1, cuando haya ritmo real. El plan anterior (Odoo) llevaba a producción hacia el 15 ene 2027; este alcance es mayor y la salida a producción se mueve unos dos meses.

Hecho antes de los hitos: ADR de arquitectura y entorno local (CAM-6, CAM-7, CAM-8, CAM-5), y el esquema `0001_core.sql` con 24 pruebas, ya entregado en la raíz del repositorio.

## Plan por ciclo (1 semana)

| Ciclo | Fechas | Trabajo |
|---|---|---|
| 1 ✔ | 17 – 23 nov | T-M0-01 a T-M0-05: app web, pruebas de `0001` con IDs, Supabase local, CI y runbook (CAM-26 a 29 y CAM-10) |
| 2 ✔ | 23 – 30 nov | T-M1-00 a T-M1-03, T-M1-08 y T-M1-09 (adelantadas): esquema al flujo `finalizado`, migración 0002, duplicados y `aplicar_ops` (CAM-30 a 33) |
| 3 ✔ | 30 nov – 8 dic | T-M1-04 a T-M1-14: operaciones, `sync_pull`, endurecimiento, compra de apertura, candados e integración real (CAM-34 a 40, 88 a 92). **H1 cerrado** (adelantado) |
| 4 | 8 – 15 dic | T-M2-01…05: login, PWA, Dexie, puller, escritor |
| 5 | 15 – 22 dic | T-M2-06…09: pendientes, Realtime, fotos, E2E base. **Cierra H2** |
| 6 en adelante | desde 22 dic | H3 → H4 → H5, a ritmo de ~1 semana por bloque de TASKS |

Es un plan, no una promesa: se ajusta al cerrar cada ciclo.

## Seguimiento en Linear

Proyecto **Camino PWA (back-office)**, con los hitos H1 a H5 y un issue por tarea de `docs/spec/TASKS.md` (CAM-26 a CAM-83, más CAM-10 como T-M0-04). El código de la tarea va en el título y el enlace a Linear va en `TASKS.md`. Los issues del plan de Odoo (CAM-5, 9, 11 a 13 y 15 a 25) quedaron cancelados con el motivo escrito en cada uno; CAM-6, 7 y 8 quedan como historia.

## Flujo de un pedido (objetivo de H3)

```
Cliente pide en la web (como hoy) y escribe por WhatsApp
        ▼
Los socios confirman datos y pedido por WhatsApp
        ▼
Un socio crea el pedido en la PWA → RECIBIDO          (funciona offline; no reserva nada)
        ▼
CONFIRMADO → reserva el stock mientras espera el pago [solo online]
        ▼
Se confirma el pago ("Registrar cobro y finalizar")
        ▼
FINALIZADO → descuenta el inventario y fija el costo  [solo online]
```

Regla de los socios en [DECISIONS](../DECISIONS.md) (D-002) y en la spec (§9.1). No hay estados de alistamiento, despacho ni entrega: el envío es información del pedido. Antes de construir ventas, la tarea **T-M1-00** adapta `0001_core.sql` a este flujo, con la prueba escrita primero.

## Cómo cambia respecto al roadmap anterior

| Antes (Odoo) | Ahora |
|---|---|
| M1 Odoo en local con nuestro negocio (CAM-15…19) | H1 + H2: base de datos y app base. Las configuraciones de Odoo ya no aplican |
| M2 pedidos, pagos y entregas (CAM-20…23) | H3 (ventas y compras) y H4 (dashboard) |
| M3 Odoo y sitio conectados, opcional (CAM-24, 25) | Fuera del MVP. El sitio sigue separado; la web arma el mensaje de WhatsApp y los socios registran el pedido a mano |
| M4 VPS, despliegue, backups (CAM-9, 11, 12, 13) | H5: Supabase + Cloudflare Pages, sin VPS. Backup cifrado y restauración en T-M8-01 |
| CI (CAM-10) | Se mantiene, adaptado a Node/Vitest/Playwright (T-M0-04) |

Los issues de Odoo ya están cancelados en Linear (borrarlos queda a mano: la herramienta no puede eliminar issues).

## Fuera de alcance por ahora

Factura electrónica DIAN, automatización o API de WhatsApp, checkout del sitio escribiendo a la base, roles finos, recetas/transformación, UI de crédito a proveedores, FEFO por lote, devoluciones parciales, multi-bodega y notificaciones push. El modelo deja la puerta abierta; no se implementan.

## Riesgos y cosas a verificar

- **Esquema SQL:** resuelto en T-M1-00. Queda verificar con Supabase real lo que hoy solo se probó en PGlite o con *stubs* (RLS por JWT, Storage, PostgREST): T-M1-10.
- **Precios en la web:** la crema de cacao sigue en $25.000 en el sitio y debe pasar a $22.000 (repositorio `camino`, fuera de este proyecto). Mientras tanto la PWA usa $22.000 (D-007).
- **Fechas optimistas:** la revisión técnica estima H1 hacia mediados de enero y algo usable en 2 a 3 meses. Se mantienen las fechas y se recalibran al cerrar H1 (D-009).
- **iOS sin verificar:** almacenamiento local y compartir PDF. Se prueba con el spike T-M2-00 antes de seguir con H2.
- **Supuestos S1–S5** (flete, deducciones, costo promedio, IVA, pull automático): confirmar con los socios y el contador.
- **iOS y almacenamiento local:** puede purgarse. PWA instalada, `storage.persist()` y exportar pendientes; se prueba con el iPhone real en el UAT.
- **Plan gratuito de Supabase:** sin SLA ni backups gestionados, con política de pausa por inactividad. Verificar límites vigentes al iniciar (`PLAN.md` §13) y mantener el keep-alive.
- **Términos de Cloudflare Pages** para uso comercial: verificar.
- **Alcance grande para una sola persona:** si H3 se atrasa, el recorte natural es dejar Necesidades de compra (T-M5-03) y la revisión visual del dashboard (T-M7-05) para después del UAT.
- **Precios y datos de producto:** la referencia es el costeo oficial (`docs/negocio/costeo-oficial.pdf`) y, para la vitrina, `lib/site.ts` del sitio. Confirmar que coinciden antes de cargar el catálogo inicial.
