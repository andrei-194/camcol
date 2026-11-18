# PLAN — Arquitectura técnica del MVP de Camino Col

> Versión 1.0 · 2026-11-17 · Implementa `SPEC.md`. Orden de construcción en `TASKS.md`.
> **Regla para el agente:** donde este plan dice "verificar", consulta la documentación vigente de la librería (Context7 o docs oficiales) **antes** de escribir código; no confíes en memoria para APIs ni versiones. Los límites del plan gratuito de Supabase y las políticas de hosting cambian: verifícalos al inicio del proyecto.
> **Revisión 2026-11-17 (D-009, `docs/DECISIONS.md`):** donde este plan describa más de lo siguiente, manda esto. (1) Solo se encolan offline `orden_compra.registrar`, `tercero.crear` (proveedor), `gasto.registrar` y `adjunto.vincular`; `pedido_venta.crear` es solo online pero conserva su `op_id` idempotente. (2) `aplicar_ops` no tiene estado `bloqueada`: si una op falla, el cliente detiene la cola. (3) `sync_pull` usa **un solo cursor** (`updated_at`) y devuelve un snapshot; sin cursores por tabla ni `has_more` mientras quepa en una respuesta. (4) Sin Realtime (§5.4), sin stock estimado (§5.5), y Pendientes sin editar ni importar (§5.3). Al implementar cada tarea, esta nota se reescribe en el cuerpo del plan.

---

## 1. Stack

| Capa | Elección | Por qué |
|---|---|---|
| Cliente | **Vite + React + TypeScript (strict)** SPA | App privada tras login: no necesita SSR; build estático simple y PWA robusta |
| Estilos | Tailwind CSS | Rapidez, mobile-first |
| PWA | `vite-plugin-pwa` (Workbox), `registerType: 'prompt'` | Aviso de actualización controlado (RF-OPS-03) |
| Datos locales | **Dexie** (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) | La UI siempre lee del caché local; funciona offline |
| Backend | **Supabase** (Postgres, Auth, Realtime, Storage) plan gratuito | Costo ≈ $0, Postgres estándar (portable) |
| Cliente Supabase | `@supabase/supabase-js` v2 | |
| Validación | **Zod** (payloads de ops, formularios) | Un esquema compartido cliente/pruebas |
| Enrutado | React Router | |
| PDFs | `@react-pdf/renderer` con **import dinámico** | Maquetación declarativa; carga diferida |
| Gráficos | Recharts (carga diferida) | |
| Pruebas | Vitest, Testing Library, `fake-indexeddb`, **PGlite** (DB rápida), Supabase CLI local (integración), Playwright (e2e, incl. offline y WebKit), fast-check (propiedades) | |
| Hosting | **Cloudflare Pages** (build estático) | Gratis; verificar términos de uso comercial vigentes |
| CI/CD | GitHub Actions | |
| Errores | Registro local en anillo + Sentry (opcional, con scrub de PII) | |

Versiones: **última estable** de cada paquete al iniciar; fijarlas con lockfile.

## 2. Arquitectura

```
┌────────────────────────── Celular (PWA instalada) ──────────────────────────┐
│ ui/            Pantallas React (lee SOLO de Dexie vía useLiveQuery)          │
│ application/   Casos de uso: registrarCompra, crearPedido, cambiarEstado…    │
│ domain/        TS puro: precios, totales, estados, stock estimado           │
│ infra/local/   Dexie: tablas espejo + outbox + adjuntos + kv + sync_meta     │
│ infra/remote/  Supabase: aplicar_ops, sync_pull, realtime, storage, auth     │
│ infra/sync/    Escritor (intenta remoto → outbox) · Puller · Centro Pendientes│
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTPS (solo cuando hay red)
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ Supabase: Postgres = fuente de verdad (reglas en triggers/funciones)         │
│   RPC: aplicar_ops(jsonb) · sync_pull(desde) · emitir_documento · …          │
│   RLS "solo miembros" · Realtime (avisa cambios) · Storage privado           │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Principios**
1. **El servidor decide.** Postgres valida y calcula (totales, stock, costos, consecutivos). El cliente solo propone y muestra vistas previas.
2. **La UI lee del caché local** (stale-while-revalidate): siempre rápida y offline-capable; el puller lo refresca.
3. **Una sola ruta de escritura** (`aplicar_ops`), online u offline: mismo código, misma idempotencia.
4. **Dominio puro y probado** en `domain/`, sin dependencias de React, Dexie ni Supabase.
5. **Aplicación hexagonal ligera:** `application/` depende de **puertos** (interfaces) que implementan `infra/`.

## 3. Estructura del repositorio

```
/
├─ CLAUDE.md
├─ docs/spec/{SPEC,PLAN,TASKS}.md
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/0001_core.sql   (existente, probada)
│  ├─ migrations/0002_sync.sql   (T-M1)
│  └─ seed.sql                   (datos de demo SOLO local)
├─ tests/
│  ├─ db/                        (PGlite: 0001 + 0002; un archivo por área)
│  └─ integration/               (Supabase local: RLS vía JWT, concurrencia, RPC)
├─ apps/web/
│  ├─ src/domain/                pricing · totals · pedidoEstados · ordenEstados · stockEstimado · money · units
│  ├─ src/application/           casos de uso + puertos
│  ├─ src/infra/local/           db.ts (Dexie) · repos · outbox · adjuntos
│  ├─ src/infra/remote/          supabase.ts · opsApi · pullApi · realtime · storage
│  ├─ src/infra/sync/            writer · puller · pendientesService
│  ├─ src/ui/                    routes · screens · components · pdf/
│  ├─ src/lib/                   format (COP, fechas Bogotá) · uuid (v7) · logger
│  └─ e2e/                       Playwright
├─ scripts/                      backup.sh · restore-check.sh · keepalive.sh
└─ .github/workflows/            ci.yml · db-push.yml · backup.yml · keepalive.yml
```

## 4. Base de datos

### 4.1 Estado de la migración 0001
Entregada y probada (24 pruebas). **No editarla** una vez aplicada a un proyecto real; todo cambio va en migraciones nuevas. Antes de su primer `db push` solo se admiten correcciones con nota en `docs/DECISIONS.md`.

### 4.2 Alcance de `0002_sync.sql` (a construir con TDD en T-M1)
1. `updated_at` + trigger `set_updated_at` en: `listas_precio`, `precios`, `unidades`, `pedidos_venta_items`, `ordenes_compra_items`, `recepciones`, `recepcion_items`, `lotes`, `pagos`, `gastos`. **Tocar el padre** (`pedidos_venta`, `ordenes_compra`) cuando cambia un hijo, para que el pull por cabecera sea correcto.
2. `terceros.productos_ofrecidos text`.
3. Tabla `adjuntos(id uuid pk, entidad text, entidad_id uuid, path text, mime text, creado_por, created_at, op_id uuid unique)`.
4. Tabla `configuracion(clave text pk, valor jsonb)`; clave `negocio` = `{razon_social, nit, direccion, telefono, email, ciudad, leyenda_documento, logo_path}`.
5. Funciones: `detectar_duplicados_tercero(telefono, numero_documento, nombre)`, `aplicar_ops(jsonb)`, `sync_pull(desde)`, `ping()` (pública, devuelve 1), `uso_bd()` (tamaño de la BD para la alerta de cuota).
6. **Endurecimiento:** `set search_path = public` en todas las funciones; `REVOKE EXECUTE ON ALL FUNCTIONS … FROM anon, public` y `GRANT` solo a `authenticated` (excepto `ping`); `REVOKE` de tablas a `anon`.
7. Bucket de Storage privado `soportes` + políticas "solo miembros".
8. Publicación Realtime (`supabase_realtime`) para: `pedidos_venta`, `ordenes_compra`, `terceros`, `articulos`, `precios`, `movimientos_inventario`.
9. Índices para `sync_pull` (`updated_at` por tabla) y para duplicados (`terceros(telefono)` normalizado).

### 4.3 Contrato `aplicar_ops(p_ops jsonb) → jsonb`

**Entrada:** `[{ op_id, device_id, tipo, client_created_at, payload, resolucion? }]` (se procesan **en orden**).

**Salida:** `[{ op_id, status, ids?, advertencias?, candidatos?, error? }]` con `status ∈ {ok, ya_aplicada, revision, error, bloqueada}`.

Reglas del servidor:
- Cada op corre en un **sub-bloque con `EXCEPTION`** (savepoint): si falla, no afecta a las demás. Éxito → fila en `sync_ops(op_id, resultado)`. Si `op_id` ya existe → `ya_aplicada` con el resultado guardado.
- `revision` **no** registra la op como aplicada.
- Si una op queda `revision`/`error`, las siguientes que referencien sus ids → `bloqueada`.
- `fecha` de negocio del cliente se acepta si ≤ `now() + 1 day`; si no → `error`.
- Corre como **SECURITY INVOKER** (RLS aplica). Códigos de error estables: `E_VALIDACION`, `E_DUPLICADO`, `E_ESTADO`, `E_STOCK`, `E_REF`, `E_FECHA`.

**Payloads**

`tercero.crear`
```json
{ "id":"uuid", "nombre":"…", "es_cliente":false, "es_proveedor":true,
  "telefono":"…", "tipo_documento":null, "numero_documento":null, "email":null,
  "direccion":null, "municipio":"…", "vereda":"…", "latitud":4.39, "longitud":-76.07,
  "productos_ofrecidos":"café, panela", "notas":null,
  "consentimiento_datos":true, "consentimiento_en":"2026-11-17T10:00:00-05:00" }
```
Dedupe: teléfono normalizado (solo dígitos, sin `57` inicial), documento exacto, o nombre muy similar (`pg_trgm` si está disponible; si no, comparación normalizada). Si hay candidatos y no hay `resolucion` → `revision` con `candidatos:[{id,nombre,telefono,municipio}]`. `resolucion`: `{"tipo":"usar_existente","tercero_id":"…"}` o `{"tipo":"crear_igual"}`.

`pedido_venta.crear`
```json
{ "pedido": { "id","cliente_id","origen","referencia_origen","fecha","entrega_tipo",
              "direccion_entrega","municipio_entrega","envio_cobrado","envio_costo",
              "descuento_valor","fecha_entrega_estimada","notas","stock_visto_en" },
  "cliente_nuevo": { …payload tercero.crear… } | null,
  "items": [ { "id","articulo_id","cantidad","precio_lista","descuento_pct","precio_unitario" } ] }
```
Servidor: crea PV en `recibido`; fija `tasa_impuesto` desde el artículo (autoridad del servidor); valida `precio_unitario ≈ precio_lista·(1−pct/100)` (tolerancia $0,01); **advertencias** (no error): `PRECIO_CAMBIO` (lista actual ≠ snapshot), `STOCK` (requerido > disponible_para_prometer).

`orden_compra.registrar`
```json
{ "orden": { "id","proveedor_id","modalidad","fecha","fecha_esperada","condicion_pago","dias_credito","notas" },
  "proveedor_nuevo": { …payload tercero.crear… } | null,
  "items": [ { "id","articulo_id","cantidad","costo_unitario","unidad_origen","cantidad_origen" } ],
  "recepcion": { "id","fecha","notas","items":[ { "id","orden_item_id","cantidad","lote_codigo","fecha_vencimiento" } ] } | null,
  "pagos": [ { "id","medio","valor","fecha","referencia","pagado_por" } ] }
```
Servidor: OC `borrador` → ítems → `pedida` → (si hay) recepción (los triggers suman stock y costo) → pagos (`direccion='pago'`). **Todo atómico.** Compra inmediata = con `recepcion` y `pagos`.

`gasto.registrar` → `{ id, fecha, categoria, concepto, valor, orden_compra_id?, pedido_venta_id?, pagado_por? }`

`adjunto.vincular` → `{ id, entidad:'tercero'|'pago'|'orden_compra'|'gasto', entidad_id, path, mime }`

### 4.4 Contrato `sync_pull(desde timestamptz default null) → jsonb` (migración 0005, D-009)

Un solo cursor y un snapshot en una respuesta. Sin cursores por tabla, sin `has_more`, sin parámetros de límite o stock. `SECURITY INVOKER` (la RLS aplica: quien no es miembro recibe todo vacío), `search_path` fijo, solo lectura.

Entrada: `desde` = cursor devuelto en la llamada anterior; `null` = sincronización inicial. El cliente puede restarle un margen (p. ej. 2 min): los upserts son idempotentes.

Salida:
```json
{ "server_time":"…",
  "cursor":"2026-11-17T15:04:05.123456Z",
  "catalogo": { "productos":[…], "articulos":[…], "listas_precio":[…], "precios":[…], "unidades":[…] },
  "terceros": [ … ],
  "configuracion": [ { "clave","valor","updated_at" } ],
  "pedidos_venta":  [ { …cabecera…, "items":[…], "pagos":[…cobros…] } ],
  "ordenes_compra": [ { …cabecera…, "items":[…], "recepciones":[ { …, "items":[…] } ], "pagos":[…pagos…] } ],
  "stock": [ { "articulo_id","fisico","comprometido","en_camino","disponible_para_prometer","faltante","costo_promedio" } ] }
```
- **Cursor único:** máximo `updated_at` de lo devuelto; si no hubo cambios, el mismo `desde` recibido. Comparación estricta (`updated_at > desde`), así un cambio aparece una sola vez.
- **Padre e hijos:** los hijos viajan dentro del padre. Un cambio en un ítem, una recepción o un ítem de recepción mueve el `updated_at` del padre (`touch_padre`, 0002). Los pagos no tocan al padre: `sync_pull` también compara `max(pagos.updated_at)` del pedido o la compra.
- **Snapshot inicial (`desde = null`):** catálogo, terceros y configuración completos; `pedidos_venta` en estado `recibido` o `confirmado`, o con `finalizado_en` en los últimos 90 días; `ordenes_compra` en `borrador`, `pedida` o `recibida_parcial`, o con `fecha` en los últimos 90 días. El resto se pide bajo demanda (online).
- **Con cursor:** todo lo que cambió, sin filtro de ventana (si un pedido viejo cambia, llega).
- **Borrado lógico:** las filas con `deleted_at` viajan marcadas. `precios`, `listas_precio` y `unidades` no tienen `deleted_at`: un borrado físico no se propaga (se corrige con el snapshot inicial).
- **Stock:** siempre completo (derivado de `v_stock` + `costo_promedio`), sin cursor; no mueve el cursor. No se replica `movimientos_inventario`; el kardex se consulta online.
- Fuera de esta versión: gastos y adjuntos (los escribe el cliente; se leen online) y Realtime.


### 4.5 Otras RPC
`emitir_documento`, `anular_documento`, `resumen_periodo`, `precio_para` (ya en 0001). Cambios de estado y edición de maestros: `UPDATE` directo (RLS) **o** RPC; en ambos casos los triggers de 0001 son la autoridad. `ping()` público, devuelve `1`.

## 5. Cliente: datos locales y sincronización

### 5.1 Esquema Dexie (v1; migrar con `version(n).upgrade`)
```
terceros:        'id, nombre, telefono, numero_documento, *roles, _pendiente'
productos:       'id, nombre'
articulos:       'id, producto_id, nombre'
unidades:        'codigo'
listas_precio:   'id'
precios:         'id, [lista_id+articulo_id]'
pedidos_venta:   'id, estado, cliente_id, fecha, _pendiente'      // items embebidos
ordenes_compra:  'id, estado, proveedor_id, fecha, _pendiente'    // items/recepciones embebidos
gastos:          'id, fecha, _pendiente'
stock:           'articulo_id'
configuracion:   'clave'
outbox:          'op_id, estado, created_at'       // estado: pendiente|error|revision|bloqueada
adjuntos_locales:'id, op_id, estado'               // blob + estado de subida
sync_meta:       'tabla'                           // cursor por tabla + last_sync
kv:              'clave'                           // dashboard cacheado, device_id, preferencias
```
Los registros creados offline viven en las **mismas tablas** con `_pendiente = op_id`, para que las listas los muestren con ⏳. Al aplicarse la op, la fila del servidor reemplaza a la local (mismo `id`).

### 5.2 Escritor (`infra/sync/writer.ts`)
```
commit(op):
  1. Zod-validar payload.
  2. Si online (heurística) → rpc aplicar_ops([op]) con AbortController (8 s).
       ok|ya_aplicada → pull dirigido de las tablas afectadas → fin.
       revision       → UI de decisión; reenviar con resolucion; (si offline, dejar en outbox estado "revision").
       error          → lanzar error de dominio (mostrar); NO encolar.
       fallo de red/timeout → ir a 3.
  3. Transacción Dexie: guardar filas locales con _pendiente + put en outbox (estado "pendiente") + blobs.
```
- **Fallo de red** = `TypeError`/`AbortError`/estado HTTP 0/502-504 del gateway. **Rechazo del servidor** = error PostgREST con código SQLSTATE o `status:error` en el resultado de la op. No confundirlos.
- `navigator.onLine` es solo una pista; la verdad es el resultado de la petición.
- **Nada** reintenta en segundo plano. `pendientesService.subir(opIds)` solo se invoca desde la UI (botón).

### 5.3 Centro de pendientes (`ui/screens/Pendientes`)
Lista con resumen legible por tipo (p. ej. "Compra a Don Luis · 10 × Café Sierra · $100.000 · hace 2 d"), checkbox, **Editar** (reemplaza payload manteniendo `op_id`), **Descartar** (confirma; borra blobs), **Subir seleccionados**. Resultado por fila (✔/⚠/✖). Banner global: "N sin subir (el más viejo: hace X)". Exportar/Importar JSON.

### 5.4 Puller y Realtime
- Se ejecuta al abrir la app, al volver a primer plano, tras cada escritura exitosa y por botón "Actualizar".
- Suscripción Realtime a las tablas de §4.2(8) solo informa "hubo cambios": **no** aplicar el payload directamente; disparar `pull` con *debounce* de ~1 s.
- Aplicar filas con *last-write-wins* por `updated_at` (ignorar filas más viejas que la local ya sincronizada). **No** pisar filas con `_pendiente`.
- Reconectar Realtime tras volver la red; verificar que respeta RLS con el JWT vigente.

### 5.5 Stock estimado offline
`stockEstimado(articulo) = stock.fisico + Σ cantidades de recepciones en ops pendientes`. Etiquetar "estimado" si hay pendientes; mostrar `fetched_at`. Los PV pendientes **no** modifican el cálculo (RF-VEN-08).

### 5.6 Dashboard
Online: llamar `resumen_periodo`, `v_ventas_diarias`, `v_ventas_por_articulo`, `v_cuentas_por_cobrar` (esperando pago); guardar resultado en `kv` con `fetched_at`. Offline: mostrar lo guardado con la etiqueta.

## 6. PWA

- `manifest.webmanifest` (nombre "Camino Col", `display: standalone`, `lang: es-CO`, íconos 192/512 + *maskable*, `theme_color`); `apple-touch-icon` 180; metas `apple-mobile-web-app-capable`. Pantalla "Cómo instalar" para iOS (Compartir → Añadir a pantalla de inicio) y Android.
- Service worker: **precache del app shell**, `navigateFallback` a `index.html`; **NetworkOnly** para llamadas a Supabase (los datos viven en Dexie, no en la caché del SW).
- `registerType: 'prompt'`: toast "Nueva versión disponible — Actualizar"; no recargar con formularios sucios.
- `navigator.storage.persist()` al primer uso y tras instalar; mostrar estado en Ajustes. Contexto iOS (**verificar**): Safari puede purgar datos de sitios no instalados tras ~7 días sin uso; la PWA instalada tiene tratamiento más favorable; no hay Background Sync.
- Hosting: `_redirects` (`/* /index.html 200`) y `_headers` con CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` (geolocalización/cámara solo propias).

## 7. PDFs y compartir

- Plantillas en `ui/pdf/`: `Confirmacion`, `Remision` (y `FacturaInterna`), `ComprobanteCompra`. Datos desde el **snapshot del documento** (nunca de las tablas vivas) + `configuracion.negocio`.
- Contenido: logo/nombre del negocio, tipo y número, fecha, cliente/proveedor, tabla de líneas (descripción, presentación, cantidad, precio, desc., total), descuento global, envío, total en COP, notas y leyenda "Documento interno — no es factura electrónica" (si `estado_fiscal` es nulo).
- `compartirPdf(blob, nombre)`: `navigator.canShare({files})` → `navigator.share({files, text})` (abre WhatsApp con el adjunto); fallback: descarga. Texto breve sugerido con resumen y total.
- La `confirmacion` offline usa un número provisional local (`BOR-<device>-<n>`) **solo visual**, nunca persistido como consecutivo.

## 8. (Eliminado) Parser de pedidos de WhatsApp

No se construye (D-006). El mensaje que arma la web es texto libre de un solo producto, sin cantidad, cliente ni número de pedido, y los socios registran cada pedido a mano después de confirmarlo por WhatsApp. Se conserva el número de sección para no romper referencias.

## 9. Autenticación y sesión
- Email + contraseña; **signups deshabilitados**; usuarios creados en el panel; ambos registrados en `miembros` por SQL de administrador.
- Sesión persistente; el cliente **no** cierra sesión ante errores de red ni de refresco offline. Si el servidor responde `invalid_grant` estando online → pantalla de re-login que **conserva Dexie y la outbox** (la outbox es del dispositivo, no del token).
- `onAuthStateChange(SIGNED_OUT)` solo limpia la caché de **datos de servidor** si el cierre fue **explícito** del usuario y sin pendientes (RF-AUTH-03).
- Primer arranque requiere conexión para el login inicial y la carga inicial (catálogo, clientes, pedidos abiertos).

## 10. Estrategia de pruebas (TDD)

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Dominio | Vitest + fast-check | precios, escalones, totales, estados, stock estimado |
| **Paridad cliente↔servidor** | Vitest + PGlite | Propiedad: para pedidos aleatorios, `domain/totals` = totales de Postgres (±0,01) |
| Base de datos | PGlite (0001+0002) | Reglas, triggers, `aplicar_ops`, `sync_pull`, RLS con roles simulados |
| Integración real | Supabase CLI local + `pg` | **Concurrencia** (2 conexiones finalizando pedidos sobre el último stock), RLS por JWT real, PostgREST |
| Repos locales | Vitest + `fake-indexeddb` | outbox, escritor (red OK/caída/timeout/rechazo), puller, `_pendiente` |
| Componentes | Testing Library | formularios, Pendientes, banners |
| E2E | Playwright (Chromium + **WebKit**) + `context.setOffline` | E1–E15 de la spec |
| PWA | Lighthouse CI (instalable, offline) | manifest, SW |

**Cobertura mínima:** `domain/` ≥ 90 %, `infra/sync/` ≥ 85 %, SQL: todo requisito RN con ≥ 1 prueba. Las pruebas existentes en `tests/core.test.mjs` pasan a `tests/db/` y deben seguir en verde.

## 11. CI/CD y entornos

- **Local:** `supabase start` (Docker) + `npm run dev`.
- **Producción:** un proyecto Supabase gratuito. (Opcional: segundo proyecto como *staging*; verificar el cupo del plan.)
- `ci.yml` (en cada PR): lint, `tsc --noEmit`, unit, DB (PGlite), integración (Supabase local), build, e2e. **Verde obligatorio para fusionar.**
- Despliegue del front: integración Git de Cloudflare Pages (rama `main`); variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- `db-push.yml`: **manual** (`workflow_dispatch`), requiere CI verde y un backup reciente; usa `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` como secrets.
- Ramas pequeñas, un PR por tarea de `TASKS.md`, mensajes de commit convencionales.

## 12. Operación en el plan gratuito

- **Backup** (`backup.yml`, diario): `pg_dump --format=custom --no-owner` contra la cadena de conexión (secret), **cifrado con `age`** (clave pública en secret `AGE_RECIPIENT`), subido como artefacto con retención 30 días; copia semanal opcional a Google Drive. Los objetos de **Storage** no están en `pg_dump`: script semanal que los descarga vía API.
- `restore-check.sh`: restaura el último dump en un Postgres local (Docker) y corre consultas de humo (conteos, `v_stock`, un `emitir_documento` de prueba en transacción con rollback). **Se ejecuta y se documenta antes de salir a producción** y luego trimestralmente.
- **Keep-alive** (`keepalive.yml`, diario): `POST /rest/v1/rpc/ping` con la anon key. Verificar la política de pausa vigente.
- **Monitoreo de cuota:** pantalla de Ajustes → "Uso" (tamaño de BD vía RPC `uso_bd()` y conteo de adjuntos) con alerta al 70 % de 500 MB.
- Imágenes: comprimir a WebP (≤ ~150 KB, lado largo ≤ 1280 px) **en el cliente** antes de subir.

## 13. Decisiones técnicas que el agente debe verificar con documentación

1. API actual de `vite-plugin-pwa` para el flujo `prompt` y `navigateFallback`.
2. Cómo pasar `AbortSignal` a `supabase.rpc(...)` en la versión vigente.
3. Autorización de Realtime con RLS (`postgres_changes`) y alta de tablas en la publicación.
4. Políticas de Storage para bucket privado y URLs firmadas.
5. Soporte de `navigator.share` con archivos PDF en iOS Safari y Android Chrome actuales.
6. Comportamiento de almacenamiento y `storage.persist()` en iOS para PWA instaladas.
7. Límites y política de pausa del plan gratuito de Supabase y términos de Cloudflare Pages.
8. Disponibilidad de `pg_trgm` en Supabase y en PGlite (si falta en PGlite, probar la normalización sin trigramas y dejar la similitud como prueba de integración).
9. Flujo de `supabase db push` y `supabase start` en CI.

## 14. Seguridad (checklist de implementación)

- [ ] RLS activo en tablas **y** vistas con `security_invoker`.
- [ ] Ninguna función ejecutable por `anon` salvo `ping()`.
- [ ] `service_role` ausente del cliente, del repo y de los logs.
- [ ] CSP probada (sin `unsafe-inline` si es viable; permitir solo el dominio de Supabase).
- [ ] Storage privado; sin URLs públicas.
- [ ] Scrub de PII en Sentry/registro de errores.
- [ ] Sesiones globales revocables (procedimiento escrito en `docs/runbook.md`).
- [ ] Dependencias auditadas (`npm audit`, Dependabot).
