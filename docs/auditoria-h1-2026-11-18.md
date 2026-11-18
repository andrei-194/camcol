# Auditoría funcional de H1 (2026-11-18)

Un agente auditor leyó la documentación y puso a prueba lo construido hasta `0007` (rama `CAM-34-op-tercero-crear`), ejecutando escenarios del negocio contra Postgres real (PGlite) con datos de `docs/negocio/catalogo.md`. Este documento resume el informe. Las decisiones que salieron de él están en `docs/DECISIONS.md` (D-014 y la nota «auditoría H1»).

## Veredicto

Con lo construido hoy **no se puede administrar el negocio**: hay una base de datos sólida y sin aplicación encima. `apps/web` es solo una pantalla de arranque y de las operaciones de escritura solo existe `tercero.crear`. `pedido_venta.crear`, `orden_compra.registrar`, `gasto.registrar` y `adjunto.vincular` devuelven `TIPO_DESCONOCIDO` (tareas CAM-35/36/37, pendientes).

Con los datos metidos directamente en la base, el ciclo del negocio **sí cuadra** contra cálculo manual: compra con costo promedio, pedido, confirmación, cobros, finalización con descuento de stock, margen, devolución, documentos con consecutivo sin huecos, IVA, fechas en hora de Bogotá, reportes y `sync_pull`.

## Resultados de ejecución

`npm run test:db`: 6 suites, 98 pruebas, 0 fallas. Escenarios verificados: E2, E4, E5, E7, E8, E9, E10, E11, E12, E14 (parte servidor). Seguridad: RLS en todas las tablas, vistas `security_invoker`, `search_path` fijo, `anon` sin privilegios, un no miembro no ve ni escribe nada.

## Hallazgos

| ID | Severidad | Resumen | Estado |
|---|---|---|---|
| H-01 | Alto | Un ajuste de inventario inicial no fija el costo: las primeras ventas salen con 100 % de margen | **D-014**, tarea T-M1-12 (CAM-90) |
| H-02 | Alto | Un pedido finalizado se puede reescribir (cabecera, costo de ítems, cobros) y falsea ventas y utilidad | Tarea T-M1-11 (CAM-88) |
| H-03 | Alto | Se pueden crear ventas y compras «fantasma» y editar consecutivos y costo promedio a mano | Tarea T-M1-13 (CAM-89) |
| H-04 | Alto | Falta la ruta de escritura de pedido, compra y gasto, y con ella la validación del servidor | Pendiente: T-M1-05/06/07 |
| H-05 | Medio | Un pedido con total negativo se finaliza gratis | Pendiente de decisión |
| H-06 | Medio | Sin reembolso en cancelación o devolución con cobro; sin control de sobrepago | Pendiente de decisión |
| H-07 | Medio | Reglas de la spec sin exigir en la base (motivos, `envio_costo`, fechas, coordenadas) | Pendiente de decisión |
| H-08 | Medio | Doble conteo posible del flete (envío del pedido y gasto vinculado) | Pendiente de decisión |
| H-09 | Medio | Stock negativo por mermas y ajustes | Pendiente de decisión |
| H-10 | Medio | El reporte por artículo no reparte el descuento global y solo agrupa por mes | Pendiente (T-M7-02) |
| H-11 | Medio | La conversión libra a gramo no existe en la base ni tiene prueba de paridad | Pendiente (T-M5-01) |
| H-12 | Bajo | En el servidor la cola no se detiene tras una `revision` (PLAN §4.3 lo declara) | A confirmar en el cliente (T-M2-05/06) |
| H-13 | Bajo | Redondeo a pesos, teléfono con extensión rechazado, falsos positivos de duplicados | A revisar con la UI |
| H-15 | Medio | Las funciones creadas después de 0004 son ejecutables por `anon` (el `EXECUTE` de `PUBLIC` no se revoca a las futuras); RLS protege los datos, pero se viola RNF-SEC-03 | Tarea T-M1-14 (CAM-92) |
| H-16 | Bajo | Insertar a mano movimientos de inventario `compra`/`venta` mueve el costo promedio sin orden ni recepción | Pendiente de decisión |
| H-17 | Bajo | `costo_unitario` de ítems editable en pedidos abiertos | Se anota |
| H-14 | Bajo | `anular_documento` de un id inexistente no falla; `v_cuentas_por_cobrar` omite pedidos `recibido` con anticipo | A revisar con la UI |

La evidencia reproducible (SQL y salida) de H-01 a H-03 y H-15 quedó en los issues y en las pruebas en rojo: `tests/db/compra_apertura.test.mjs`, `tests/db/candado_finalizados.test.mjs`, `tests/db/escritura_directa.test.mjs`, `tests/db/funciones_sin_anon.test.mjs`. Una segunda auditoría (2026-11-18) confirmó que cada prueba en rojo es satisfacible con una migración mínima, que las migraciones 0011 a 0014 no se estorban entre sí ni a las operaciones planeadas, y reprodujo H-01, H-05, H-09 y H-12.

## Lo que no se pudo verificar

- **Concurrencia real (E6):** PGlite tiene una sola conexión; solo se revisó el código (`FOR UPDATE` por artículo en orden estable). Queda para T-M1-10 (CAM-40).
- **RLS contra PostgREST con JWT reales**, **Storage real** (solo un stub de `storage.objects`) y que PostgREST oculte las funciones a `anon`: también T-M1-10.
- **La app:** no existe UI. Tampoco se probó el modo sin conexión en iPhone (T-M2-00), Playwright ni PDF.
- **Cursor de `sync_pull`** con transacciones largas: depende del solape que pondrá el cliente.

## Brechas para operar el negocio

**Planeadas (TASKS):** toda la interfaz (terceros, catálogo y precios, pedidos, compras, inventario, kardex, dashboard), documentos en PDF y compartir, sin conexión y pendientes, backups y despliegue, y las operaciones T-M1-05/06/07.

**No planeadas hasta esta auditoría:** costo del inventario inicial (resuelto: D-014), reembolsos y sobrepago (H-06), candados de edición (T-M1-11 y T-M1-13), stock negativo en ajustes (H-09), conversión libra a gramo con prueba de paridad (H-11), reparto del descuento global por artículo (H-10) y alta de socios (hoy a mano en el panel SQL, documentado en `0001`).
