# ADR-0004: Plataforma propia (PWA + Supabase) en lugar de Odoo

- **Estado:** Aceptado (2026-11-17). Los socios confirmaron el cambio de plataforma y la regla de pago (ver [DECISIONS](../DECISIONS.md), D-001 a D-003). Las preguntas abiertas de abajo se siguen en ese documento.
- **Reemplaza:** [ADR-0003](0003-odoo-como-back-office.md) y, de [ADR-0001](0001-infraestructura-vps-docker.md), el VPS, Docker Compose y Cloudflare Tunnel/Access del back-office.
- **Fuente:** `docs/spec/SPEC.md` (con `PLAN.md` y `TASKS.md`) y el esquema `supabase/migrations/0001_core.sql`, probado con 24 pruebas.

## Contexto

El negocio no cambia: compramos a campesinos, traemos el producto, lo vendemos por la web y WhatsApp, y lo despachamos por transportadora o con entrega propia en Zarzal. Lo que cambió es el requisito operativo: la socia registra compras **en finca, sin señal**, y los dos socios necesitan ver stock y analítica desde el celular (iPhone y Android).

Odoo (ADR-0003) exige conexión, vive en un VPS con costo mensual y no resuelve el trabajo offline. La nueva especificación cubre el mismo negocio con una PWA que funciona sin conexión y una infraestructura de costo ≈ $0.

## Decisión

1. **El back-office es una PWA propia** (Vite + React + TypeScript, Dexie) sobre **Supabase** (Postgres, Auth, Realtime, Storage), con hosting estático en Cloudflare Pages. Se abandona Odoo.
2. **El sitio Next.js en Vercel se mantiene** como vitrina, igual que en ADR-0003. El checkout directo a la base queda fuera del MVP.
3. **Escritura online-first con respaldo offline.** Una sola ruta de escritura (`aplicar_ops`, idempotente). Los pendientes solo se suben cuando el usuario lo decide.
4. **El servidor decide:** totales, stock, costos y consecutivos los calcula Postgres. El stock nunca se edita: es la suma de `movimientos_inventario`.
5. **Pedido de venta y orden de compra son entidades separadas** en tablas, estados, documentos y pantallas.
6. **Spec-Driven y TDD se conservan.** La spec vigente es `SPEC.md`, y cada prueba cita el ID del requisito que cubre.

## Qué se conserva de ADR-0003

- El sitio público no se toca.
- Los productores son proveedores (terceros), con vereda y municipio.
- Inventario con stock propio y venta bajo pedido (en la spec: compra `inmediata` y `encargo`, más "necesidades de compra").
- El pedido llega por WhatsApp y se registra a mano; en la spec nace como PV `recibido`, equivalente a la cotización de Odoo.
- Sin facturación electrónica DIAN: documento interno por WhatsApp.
- KISS, y la base local es de ensayo hasta tener producción con backups.

## Consecuencias

- **Positivas:** funciona sin señal; costo de infraestructura ≈ $0; sin servidor que mantener ni parchear; esquema y reglas ya probados.
- **Negativas:** se construye en lugar de configurar, así que el alcance es mayor (9 bloques de tareas) y la fecha de producción se mueve. Se pierde el trabajo hecho en Docker/Odoo (CAM-8 y los addons `camino_*`). El plan gratuito de Supabase no tiene SLA ni backups gestionados (mitigación: backup cifrado nocturno y restauración probada, T-M8-01). Dos plataformas de terceros con términos que cambian (Supabase, Cloudflare Pages): se verifican al iniciar.
- **Riesgo nuevo:** iOS puede purgar el almacenamiento local de una PWA. Se mitiga con instalación, almacenamiento persistente y exportación de pendientes.

## Decisiones de los socios y preguntas abiertas

- **Regla de pago:** el pedido se finaliza y se descuenta del inventario al confirmar el pago (D-002).
- **La web y WhatsApp no cambian:** no hay parser ni integración; los socios registran el pedido a mano (D-003, D-006).
- **Todo es de contado:** no hay crédito a clientes ni a proveedores (D-005).
- **Código en la raíz:** el repositorio se reestructuró; la PWA irá en `apps/web/`.
- **Abiertas:** supuestos S1–S5, costos y catálogo. Ver [DECISIONS](../DECISIONS.md).
