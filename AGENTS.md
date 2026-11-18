# AGENTS.md

Guía para humanos y agentes que trabajan en Camino Col. Principio rector: **KISS**. No se agrega nada que no se necesite hoy.

## Qué es

PWA móvil (iPhone y Android) para los dos socios: pedidos de venta, compras a campesinos (también sin señal), inventario, pagos, gastos, documentos para WhatsApp y analítica. Stack: Vite + React + TypeScript, Dexie (IndexedDB), Supabase (Postgres, Auth, Realtime, Storage), Cloudflare Pages. Costo de infraestructura ≈ $0. Idioma de producto y de comunicación: **español (es-CO)**.

La vitrina pública (`caminocol.com`, Next.js en Vercel, repo aparte `andrei-194/camino`) no se toca. Los clientes piden por la web, el pedido se confirma por WhatsApp y **los socios lo registran en la PWA**. No hay integración automática (ver ADR-0004).

## Lee primero (en este orden)

1. `docs/spec/SPEC.md`: qué construir (requisitos con ID, reglas de negocio, estados, escenarios).
2. `docs/spec/PLAN.md`: cómo (arquitectura, contratos `aplicar_ops` y `sync_pull`, pruebas, operación).
3. `docs/spec/TASKS.md`: en qué orden. **Una tarea por vez, un PR por tarea.**
4. `docs/DECISIONS.md`: decisiones tomadas y preguntas abiertas.
5. `docs/adr/`: decisiones de arquitectura. Leer antes de proponer cambios grandes.
6. `supabase/migrations/` y `tests/`: el esquema ya existe y está probado.

## Mapa del repo

```
docs/spec/       SPEC, PLAN, TASKS (fuente de verdad)
docs/adr/        decisiones de arquitectura
docs/producto/   roadmap
docs/negocio/    material del negocio (costeo, etc.)
supabase/        migraciones SQL, solo hacia adelante
tests/           db/ (PGlite), integration/, e2e/
apps/web/        la PWA (se crea en T-M0-01)
```

## Flujo de trabajo (SDD + TDD)

1. Cada trabajo tiene un issue en Linear (equipo `CAM`, proyecto *Camino PWA*, ID `CAM-n`). Cada tarea de `docs/spec/TASKS.md` ya tiene el suyo; el enlace está junto al código de la tarea.
2. **SDD:** la spec va antes que el código. Si la spec es incorrecta o incompleta, se corrige en el mismo PR y se anota en `docs/DECISIONS.md`. Si spec y código se contradicen, gana la spec. No se improvisan reglas de negocio.
3. **TDD:** escribir la prueba, verla fallar, implementar, verla pasar. El nombre de cada prueba cita el ID que cubre (`[RN-INV-03]`, `[E5]`). Un requisito sin prueba no está terminado.
4. Rama `CAM-n-descripcion-corta`; commits y PR mencionan `CAM-n`.
5. Commits en español, formato `tipo: resumen` (feat, fix, docs, chore, test).
6. Cambios pequeños y revisables; no mezclar refactors con funcionalidad.
7. Para APIs de librerías (Dexie, Supabase JS, vite-plugin-pwa, Workbox, Playwright…) consultar la documentación vigente; no confiar en memoria.

## Entorno

- Windows. **Todo lo pesado va en el disco D:** el repo, el caché de npm, las imágenes y el disco virtual de Docker, y cualquier emulador. El disco C: está casi lleno.
- **La app web corre en Docker** (`docker-compose.yml`, imagen `node:22`): `npm run setup`, `dev`, `test`, `typecheck`, `lint`, `build`. No se instala Node 22 en el PC. El Node del PC (20+) solo sirve para `test:db` y la CLI de Supabase (`db:*`).

## Cómo empezar una tarea

1. Tomar el siguiente issue del ciclo en Linear (respetar las dependencias que indica) y pasarlo a *In Progress*.
2. Crear la rama `CAM-n-descripcion-corta` desde `main`.
3. Releer en `SPEC.md` los IDs que cierra la tarea.
4. Escribir la prueba, verla fallar, implementar, verla pasar. Correr todo: `npm run test:db`.
5. Abrir el PR con la plantilla (`.github/pull_request_template.md`), mencionando `CAM-n`; pasar el issue a *In Review*.
6. Al fusionar: marcar la tarea `[x]` en `TASKS.md` y cerrar el issue.

**Orden:** H1 → H2 → H3 → H4 → H5. No empezar H3 hasta que pase el E2E de H2 (T-M2-09).

## Reglas no negociables

1. **El stock nunca se edita.** Es la suma de `movimientos_inventario` (append-only). Las correcciones son movimientos de ajuste.
2. **Pedido de venta ≠ Orden de compra.** Tablas, estados, documentos y pantallas separados. Nunca una tabla `pedidos` genérica.
3. **El servidor decide.** Totales, stock, costos y consecutivos los calcula Postgres. El cliente solo muestra vistas previas, con pruebas de paridad.
4. **Una sola ruta de escritura:** `aplicar_ops` con `op_id` idempotente, online u offline.
5. **Online-first con respaldo offline.** Nunca se envía un pendiente sin acción explícita del usuario. Prohibido auto-sync o Background Sync de escrituras.
6. **Offline solo para tres cosas** (D-009): compras (con recepción, pago y proveedor nuevo), proveedores y gastos. Pedidos, cobros, estados, clientes, facturar, anular y editar maestros requieren conexión.
7. **Distinguir fallo de red de rechazo del servidor.** Solo el primero se encola.
8. **Documentos inmutables** con consecutivo sin huecos asignado por el servidor; el PDF es una vista regenerable.
9. **Seguridad:** RLS en todo, vistas `security_invoker`, `service_role` jamás en el cliente ni en el repo.
10. **Nunca perder datos locales:** la outbox sobrevive a re-login y actualizaciones.
11. Migraciones **solo hacia adelante**. `0001` solo admite correcciones hasta su primer `db push` a un proyecto real, con nota en `docs/DECISIONS.md`.
12. Dinero en COP sin decimales en UI; zona horaria `America/Bogota`; libra = 500 g.
13. Sin secretos en el repo: van en `.env` (ignorado) y se documentan en `.env.example`.
14. La base local es de ensayo: no cargar datos reales hasta tener producción con backups y restauración probada.

## Definición de hecho

Pruebas verdes (incluidas las previas) · tipos y lint limpios · IDs citados en pruebas · viewport 360 px · sin secretos · contrato documentado si cambió · `TASKS.md` actualizado.

## Qué NO construir (MVP)

Factura electrónica DIAN, API o automatización de WhatsApp, checkout web escribiendo a la base, roles finos, recetas, UI de crédito a proveedores, FEFO por lote, devoluciones parciales, multi-bodega, notificaciones push. El modelo deja la puerta abierta; no se implementan.

## Cuando dudes

Pregunta solo por decisiones de negocio irreversibles. Para el resto, toma el valor por defecto de la tabla de preguntas abiertas de `TASKS.md` y regístralo en `docs/DECISIONS.md`.
