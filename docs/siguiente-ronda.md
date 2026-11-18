# Siguiente ronda: H3 (operación diaria)

Estado a 2026-11-18. **H2 completo** en `release/h2` (PR #29 listo para fusionar a `main`). Línea base: `npm run test:db` 16 suites; app web 194 pruebas; `npm run test:integration` 5 suites (con reembolsos); `npm run test:e2e` (Chromium y WebKit, contra Supabase local).

Lee primero `AGENTS.md` (flujo D-017), `docs/DECISIONS.md` (D-009, D-015, D-016, D-017 y las notas T-M2-xx) y `docs/spec/TASKS.md` (M3, M4, M5).

## Paso 0

1. El socio fusiona el PR #29 (`release/h2` → `main`). Los issues de H2 pasan a *Done*.
2. Crear `release/h3` desde `main` actualizado y subirla (`git checkout -B release/h3 origin/main && git push -u origin release/h3`). El PR en borrador se abre con la primera tarea integrada.

## Tareas (bloques de TASKS.md)

- **M3 · Terceros y catálogo:** T-M3-01 a T-M3-05 (CAM-50 a CAM-54). Terceros con búsqueda local y formulario; duplicados; edición online; catálogo; `domain/pricing` con paridad contra `precio_para`.
- **M4 · Pedidos de venta:** T-M4-01 a T-M4-08 (CAM-55 a CAM-60, y CAM-98 para reembolsos). Dominio de totales y estados con paridad contra los triggers; formulario «Nuevo pedido»; cobros y estados; documentos; reembolsos.
- **M5 · Compras:** T-M5-01 a T-M5-04. Formulario de compra offline, recepción, pagos, comprobante.
- El E2E de H2 se amplía con estas pantallas (compra con proveedor nuevo, recepción, pago, foto y costo promedio: [E1] completo).

Empieza por M3 (T-M3-01 y T-M3-04 son independientes), y T-M4-01 y T-M3-05 (dominio puro con pruebas de paridad) se pueden hacer en paralelo. Las pantallas dependen de ellos.

## Pendientes y huecos conocidos de H2

- **Arranque sin red lento:** sin conexión, la app queda en «Cargando…» varios segundos (≈ 6 s en WebKit) por la comprobación de sesión y de socio. Medirlo en el teléfono y, si hace falta, ponerle tiempo límite (tarea aparte).
- **⏳ en las filas:** el dato local lo marca (`_pendiente`), pero ninguna lista lo muestra todavía; se hace con las listas de H3.
- **Cableado:** el escritor ya está instanciado pero ninguna pantalla lo usa; las pantallas de H3 deben usar `commit()`.
- **Pantalla «Cómo instalar» y pantallas a 360 px:** sin revisión visual en navegador.
- La fusión pendiente con `main` de las decisiones del `PLAN.md` §9: el puller guarda el dueño del caché en `kv.cache_usuario`.
- El `PLAN.md` y la SPEC pasaron 2 rondas de revisión EGM (informes en `docs/revisiones/`); falta revisar `SPEC.md` y una ronda 3 del plan. Se hace por bloque, antes de empezar cada uno.

## Pendiente del socio (no lo hace un agente)

- **CAM-10:** proteger `main` en GitHub (exigir PR y CI verde, sin pushes directos; `release/*` sin protección). Requiere permisos de administrador.
- **T-M2-00 (CAM-84):** spike en iPhone real.
- **Verificación manual de la PWA y de las fotos** en iPhone y Android: instalar, abrir en modo avión tras la primera carga, actualizar solo al tocar «Actualizar», compresión y respaldo a JPEG de las fotos, subida real al bucket `soportes`, y revisar a 360 px.
- Reemplazar los íconos provisionales de la vitrina si se quiere identidad propia.
