# Roadmap de Camino

Última actualización: 2026-11-15. Decisión de base: [ADR-0003](../../03-arquitectura/adr/0003-odoo-como-back-office.md).

## Qué estamos construyendo

Odoo 20 Community como **oficina interna** de Camino: inventario con stock propio y venta bajo pedido, compras a los productores, pedidos, pagos y entregas. El sitio público (`caminocol.com`, Next.js en Vercel) se mantiene como está.

## Principios

1. **Primero lo visible, en local.** Cada hito termina con algo que se puede enseñar funcionando.
2. **El despliegue y el proveedor del VPS van al final** (M4). Antes se valida todo en local.
3. **SDD y TDD:** spec primero, test primero, código después.
4. **KISS:** lo opcional (M3) solo se hace si M2 demuestra que hace falta.
5. **Datos de ensayo.** La base local no contiene datos reales del negocio hasta tener producción con backups.

## Hitos

| Hito | Objetivo | Fecha objetivo | Issues |
|---|---|---|---|
| **M1** | Odoo operando en local con nuestro negocio | 30 nov 2026 | CAM-15, CAM-16, CAM-10, CAM-17, CAM-18, CAM-19 |
| **M2** | Pedidos por WhatsApp, pagos y entregas | 14 dic 2026 | CAM-20, CAM-21, CAM-22, CAM-23 |
| **M3** | Odoo y el sitio conectados (opcional) | 21 dic 2026 | CAM-24, CAM-25 |
| **M4** | Producción: proveedor, despliegue, backups | 15 ene 2027 (tentativa) | CAM-9, CAM-11, CAM-12, CAM-13 |

Hecho antes de los hitos (CAM-5): entorno local con Docker, tests con TDD y ADR de arquitectura (CAM-6, CAM-7, CAM-8).

## Plan por ciclo (1 semana)

| Ciclo | Fechas | Trabajo |
|---|---|---|
| 1 | 16 – 23 nov | CAM-15 configuración base, CAM-16 flujo local reproducible, CAM-10 CI |
| 2 | 23 – 30 nov | CAM-17 catálogo, CAM-18 compras y stock, CAM-19 demostración. **Cierra M1** |
| 3 | 30 nov – 7 dic | CAM-20 pedido como cotización, CAM-21 entregas |
| 4 | 7 – 14 dic | CAM-22 ventas a cafeterías, CAM-23 usuarios y reportes. **Cierra M2** |
| 5 | 14 – 21 dic | Revisar M2 y decidir si se hace M3 (CAM-24, CAM-25) |
| 6 en adelante | desde 21 dic | M4: CAM-9, CAM-11, CAM-12, CAM-13 |

Es un plan, no una promesa: se ajusta al cerrar cada ciclo según el ritmo real.

## Flujo de un pedido (objetivo de M2)

```
Cliente escribe por WhatsApp desde el sitio
        ▼
Se registra una COTIZACIÓN en Odoo          (no reserva stock, no factura)
        ▼
Se verifica el pago por fuera
        ▼
Se CONFIRMA la cotización                   (reserva stock, crea la entrega)
        ▼
Entrega propia en Zarzal, o envío con guía (Envía / Servientrega)
```

## Fuera de alcance por ahora

Tienda, blog y tema en Odoo, PWA o app móvil, facturación electrónica DIAN, pasarelas de pago e integraciones de logística (Dropi). Cada una entraría con su spec y su ADR.

## Riesgos y cosas a verificar

- **Precios y datos de producto:** la referencia es `lib/site.ts` del sitio. Confirmar que siguen vigentes antes de cargarlos (CAM-17).
- **`l10n_co` en Community:** verificar su disponibilidad (CAM-15).
- **Doble fuente de verdad:** hasta M3, precios y disponibilidad se mantienen en el sitio y en Odoo. Es un costo asumido.
- **Registro manual de pedidos:** limita el volumen. Se reevalúa con M2.
- **Proveedor del VPS:** con Odoo sin tráfico público, 2 GB de RAM puede bastar. Se confirma midiendo (CAM-9).
