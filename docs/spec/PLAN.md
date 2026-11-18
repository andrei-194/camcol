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
5. Funciones: `detectar_duplicados_tercero(telefono, numero_documento, nombre)`, `aplicar_ops(jsonb)`, `sync_pull(desde)`, `ping()` (devuelve 1; solo `authenticated`, ver 0014), `uso_bd()` (tamaño de la BD para la alerta de cuota).
6. **Endurecimiento:** `set search_path = public` en todas las funciones; `REVOKE EXECUTE ON ALL FUNCTIONS … FROM anon, public` y `GRANT` solo a `authenticated` y `service_role`, sin excepción (0014 corrige además los privilegios por defecto de `PUBLIC`, que alcanzaban a toda función nueva: `anon` no ejecuta ninguna, incluida `ping()`); `REVOKE` de tablas a `anon`.
7. Bucket de Storage privado `soportes` + políticas "solo miembros".
8. Publicación Realtime (`supabase_realtime`) para: `pedidos_venta`, `ordenes_compra`, `terceros`, `articulos`, `precios`, `movimientos_inventario`.
9. Índices para `sync_pull` (`updated_at` por tabla) y para duplicados (`terceros(telefono)` normalizado).

### 4.3 Contrato `aplicar_ops(ops jsonb) → jsonb`

**Implementado en `0003_aplicar_ops.sql` (T-M1-03, CAM-33).** Esta es la forma vigente del núcleo; los payloads de más abajo los implementan T-M1-04..07.

**Entrada:** `[{ op_id, tipo, datos }]` (se procesan **en orden** del arreglo). `datos` es un objeto: el payload del tipo (en las ops que traen `resolucion`, va dentro de `datos`).

**Salida:** `{ detener_cola, resultados: [{ op_id, status, resultado?, error?: {codigo, mensaje} }] }` con `status ∈ {ok, ya_aplicada, revision, error}`. **Sin `bloqueada`** (D-009). `detener_cola` es `true` si alguna op quedó en `revision` o `error`: el cliente deja de enviar su cola hasta que el usuario resuelva. `ya_aplicada` cuenta como éxito.

Reglas del servidor:
- Cada op corre en un **sub-bloque con `EXCEPTION`** (savepoint): si falla, se deshace solo ella y **las demás del lote se aplican**. Éxito → fila en `sync_ops(op_id, tipo, estado='ok', resultado, aplicado_en)`. Si `op_id` ya existe → `ya_aplicada` con el resultado guardado (incluso repetido en el mismo lote).
- `revision` y `error` **no** registran la op: se puede reenviar.
- Solo miembros (`es_miembro()`); si no, cada op devuelve `NO_AUTORIZADO`.
- **Registro de tipos:** tabla `tipos_op(tipo, funcion)`. Cada tarea añade su tipo con un `INSERT` en su migración y una función `f(datos jsonb) returns jsonb` en `public`, sin tocar el núcleo. La función devuelve el resultado (p. ej. ids); devuelve un objeto con `"_revision": true` para pedir revisión (la clave se quita de la salida); rechaza con `RAISE EXCEPTION 'CODIGO: mensaje'` (CODIGO en mayúsculas y guion bajo, se devuelve tal cual).
- Códigos del núcleo: `TIPO_DESCONOCIDO`, `DATOS_INVALIDOS` (op mal formada, o errores de tipo/not null/check/FK de Postgres, clases 22 y 23), `NO_AUTORIZADO` (también RLS, 42501), `E_DUPLICADO` (unicidad inesperada), `ERROR_INTERNO`. Los manejadores añaden los suyos: `E_ESTADO`, `E_STOCK`, `E_REF`, `E_FECHA`, etc. Una entrada que no sea arreglo lanza `DATOS_INVALIDOS` (error de la llamada completa).
- `fecha` de negocio del cliente se acepta si ≤ `now() + 1 day`; si no → `E_FECHA` (lo valida cada manejador).
- Corre como **SECURITY INVOKER** (RLS aplica), `search_path = public`.

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

**Implementado en `0007_op_tercero.sql` (T-M1-04, CAM-34).** `resolucion` va dentro de `datos`. Salida: `{id}` (creado), `{id, existente:true}` (`usar_existente`) o, en revisión, `resultado.candidatos:[{id,nombre,telefono,municipio,motivo}]` (`motivo`: `telefono`, `documento`, `nombre`). `id` es opcional (el servidor lo genera). Validaciones: nombre no vacío, al menos un rol, teléfono (si viene) de 7 a 15 dígitos sin letras → `DATOS_INVALIDOS`; cliente sin `consentimiento_datos` → `E_CONSENTIMIENTO` (RF-TER-05; sin `consentimiento_en` se usa la hora del servidor); `usar_existente` con tercero inexistente o borrado → `E_REF`; resolución de otro tipo → `DATOS_INVALIDOS`. `usar_existente` suma al existente el rol que pedía el payload (cliente/proveedor) y no cambia nada más. Un documento repetido con `crear_igual` choca con el índice único → `E_DUPLICADO`. Reutilizable: `crear_tercero_desde_payload(jsonb)` es la misma lógica para `cliente_nuevo` y `proveedor_nuevo` de T-M1-05/06; allí un `_revision` detiene la op completa.

`pedido_venta.crear`
```json
{ "pedido": { "id","cliente_id","origen","referencia_origen","fecha","entrega_tipo",
              "direccion_entrega","municipio_entrega","envio_cobrado","envio_costo",
              "descuento_valor","fecha_entrega_estimada","notas","stock_visto_en" },
  "cliente_nuevo": { …payload tercero.crear… } | null,
  "items": [ { "id","articulo_id","cantidad","precio_lista","descuento_pct","precio_unitario" } ] }
```
Servidor: crea PV en `recibido`; fija `tasa_impuesto` desde el artículo (autoridad del servidor); valida `precio_unitario ≈ precio_lista·(1−pct/100)` (tolerancia $0,01); **advertencias** (no error): `PRECIO_CAMBIO` (lista actual ≠ snapshot), `STOCK` (requerido > disponible_para_prometer).

**Implementado en `0010_op_pedido_venta.sql` (T-M1-05, CAM-35).** Solo con conexión (D-009): el servidor no lo distingue, la PWA no lo encola. Todo `id` es opcional (el servidor lo genera). Reglas:
- `pedido.cliente_id` **o** `cliente_nuevo` (uno solo; ninguno o ambos → `DATOS_INVALIDOS`). `cliente_nuevo` usa `crear_tercero_desde_payload` (0007) forzando `es_cliente`; sin `consentimiento_datos` → `E_CONSENTIMIENTO`; con candidatos y sin `resolucion` la op devuelve `revision` (`resultado.candidatos`) y **no escribe nada**; con `resolucion` (dentro de `cliente_nuevo`) continúa. Cliente inexistente → `E_REF`; un tercero sin rol cliente → `DATOS_INVALIDOS`.
- `pedido`: `origen` (`web`/`whatsapp`/`manual`, por defecto `manual`), `entrega_tipo` (por defecto `transportadora`) y otros valores → `DATOS_INVALIDOS`. `fecha` hasta mañana (`E_FECHA`; por defecto ahora). `envio_cobrado`, `envio_costo`, `descuento_valor` ≥ 0; el descuento global no puede superar el subtotal. `subtotal`, `impuestos` y `total` que envíe el cliente se ignoran: los calculan los triggers.
- `items` no vacío; `cantidad > 0`, `descuento_pct` entre 0 y 100, artículo existente (`E_REF`). **Precios del servidor:** `precio_lista = precio_para(artículo, cliente, cantidad)` (lista del cliente con respaldo en la pública; escalón por cantidad, «Llévate 2», D-007); `precio_unitario = round(precio_lista·(1−descuento_pct/100), 2)`; sin precio en ninguna lista → `E_PRECIO`. `tasa_impuesto` sale del artículo (lo del cliente se ignora).
- **Advertencias** (no error), en `resultado.advertencias`: `{codigo:'PRECIO_CAMBIO', item, articulo_id, campo:'precio_lista'|'precio_unitario', precio_enviado, precio_actual}` cuando el cliente envió un precio distinto (> $0,01) del que calculó el servidor (se guarda el del servidor); `{codigo:'STOCK', item, articulo_id, requerido, disponible}` cuando la suma pedida del artículo supera `v_stock.disponible_para_prometer` ([E5]: el pedido se acepta igual).
- Atomicidad: cualquier fallo deshace cliente nuevo, pedido e ítems. Idempotencia por `op_id` (`ya_aplicada`, sin duplicar cliente). No reserva ni mueve stock (RF-VEN-08).
- Salida: `{pedido_id, cliente_id, estado:'recibido', subtotal, impuestos, total, item_ids, advertencias}`. Como en 0008/0009, `pedidos_venta.op_id` queda nulo.

`orden_compra.registrar`
```json
{ "orden": { "id","proveedor_id","modalidad":"inmediata|encargo|apertura","fecha","fecha_esperada","condicion_pago","dias_credito","notas" },
  "proveedor_nuevo": { …payload tercero.crear… } | null,
  "items": [ { "id","articulo_id","cantidad","costo_unitario","unidad_origen","cantidad_origen" } ],
  "recepcion": { "id","fecha","notas","items":[ { "id","orden_item_id","cantidad","lote_codigo","fecha_vencimiento" } ] } | null,
  "pagos": [ { "id","medio","valor","fecha","referencia","pagado_por" } ] }
```
Servidor: OC `borrador` → ítems → `pedida` → (si hay) recepción (los triggers suman stock y costo) → pagos (`direccion='pago'`). **Todo atómico.** Compra inmediata = con `recepcion` y `pagos`.

**Implementado en `0008_op_compra.sql` (T-M1-06, CAM-36).** Funciona offline (D-009). Todo `id` es opcional (el servidor lo genera); sin señal, el cliente manda los suyos. Reglas:
- `orden.proveedor_id` **o** `proveedor_nuevo` (uno solo; ninguno o ambos → `DATOS_INVALIDOS`). `proveedor_nuevo` usa `crear_tercero_desde_payload` (0007) forzando `es_proveedor`; con candidatos y sin `resolucion` la op devuelve `revision` (`resultado.candidatos`) y **no escribe nada**; con `resolucion` (`usar_existente` / `crear_igual`, dentro de `proveedor_nuevo`) continúa. Proveedor inexistente → `E_REF`.
- `modalidad`: `inmediata` (por defecto), `encargo` o `apertura` (ver abajo); otra → `DATOS_INVALIDOS`. `condicion_pago` solo `contado` (D-005); crédito → `DATOS_INVALIDOS`.
- `items` no vacío; `cantidad > 0`, `costo_unitario >= 0`, artículo existente (`E_REF`). El total lo calcula el servidor.
- `recepcion.items[]` apunta al ítem por `orden_item_id` o por su posición `item` (base 0, para ids generados por el servidor). Ítem ajeno → `E_REF`; recibir más de lo pedido (sumando filas) → `E_SOBRE_RECEPCION` ([E8], RN-COM-01); artículo con `controla_vencimiento` sin `fecha_vencimiento` → `E_VENCIMIENTO` (RN-COM-02). Lotes, stock y costo promedio los fijan los triggers de 0001.
- `inmediata`: exige recepción **total** (`E_RECEPCION`) y pagos que sumen **exactamente** el total (`E_PAGO`). `encargo`: recepción opcional (parcial o total) y pagos opcionales, sin superar el total (`E_PAGO`).
- Pagos: `valor > 0`, `medio` válido (si no, `DATOS_INVALIDOS`), `pagado_por` debe ser socio (`E_REF`). Fechas de orden, recepción y pagos: hasta mañana (`E_FECHA`); por defecto la de la orden.
- Atomicidad: cualquier fallo deshace proveedor nuevo, orden, recepción, movimientos y pagos ([E1]); la op fallida no se registra y se puede reenviar. Idempotencia por `op_id` (`ya_aplicada`, sin duplicar proveedor).
- Salida: `{orden_id, proveedor_id, estado, total, item_ids, recepcion_id, pago_ids}`. Como en 0009, `ordenes_compra.op_id` queda nulo (el manejador no recibe el `op_id`).
- **`modalidad: "apertura"` (CAM-90, `0012_compra_apertura.sql`, RN-COM-04):** la `0012` reemplaza la función con `create or replace` (la `0008` no se edita) y añade `apertura` a `v_modalidades`. Exige recepción **total** (`E_RECEPCION`) y **no admite `pagos`** (`E_PAGO`; un trigger también rechaza cualquier pago directo). Proveedor: el genérico «Inventario inicial», existente (`proveedor_id`) o creado con `proveedor_nuevo`. No cuenta en `compras_periodo` ni genera cuenta por pagar. El resto del contrato no cambia.

`gasto.registrar` → `{ id?, fecha?, categoria, concepto?, valor, orden_compra_id?, pedido_venta_id?, pagado_por? }`

**Implementado en `0009_op_gasto_adjunto.sql` (T-M1-07, CAM-37).** Ambas ops funcionan offline (D-009). Salida de `gasto.registrar`: el gasto creado `{id, fecha, categoria, concepto, valor, orden_compra_id, pedido_venta_id, pagado_por}`. `id` es opcional (el servidor lo genera). Validaciones: `categoria` no vacía; `valor` numérico, mayor que cero y entero (COP sin decimales) → `DATOS_INVALIDOS`; `fecha` `AAAA-MM-DD` (por defecto hoy en `America/Bogota`; formato inválido → `DATOS_INVALIDOS`; posterior a mañana → `E_FECHA`); `orden_compra_id`, `pedido_venta_id` o `pagado_por` inexistentes (o borrados) → `E_REF`. El gasto entra a `resumen_periodo` por su `fecha`. La idempotencia la da `sync_ops`; el manejador no recibe el `op_id`, así que `gastos.op_id` y `adjuntos.op_id` quedan nulos, y un `id` repetido con otro `op_id` responde `E_DUPLICADO` (PK).

`adjunto.vincular` → `{ id?, entidad:'pago'|'gasto'|'recepcion'|'orden_compra'|'tercero', entidad_id, path, mime? }`

Salida: `{id, entidad, entidad_id, path}`. La entidad debe existir y no estar borrada → `E_REF`; `entidad` desconocida, `entidad_id` o `path` ausentes → `DATOS_INVALIDOS`. El archivo ya está en Storage (`soportes`); la op solo lo vincula, y no valida que el objeto exista en el bucket. Un fallo de subida no invalida el registro principal (RF-SYN-09).

**Validaciones del servidor (migración 0015, T-M1-15, H-05/H-07/H-08, D-015).** Triggers INVOKER que valen para cualquier ruta de escritura; el error lleva el ID de la regla. (1) Al pasar a `finalizado`: descuento ≤ subtotal y total ≥ 0 (RF-VEN-03; `pedido_venta.crear` ya lo rechaza con `DATOS_INVALIDOS` desde 0010); con `entrega_tipo = 'transportadora'`, `envio_costo > 0` (RF-VEN-05). (2) Pasar a `cancelado` o `devuelto` exige `motivo_estado` no vacío (RF-VEN-05). (3) `documentos`: poner `anulado_en` exige `motivo_anulacion` no vacío, y ese motivo no cambia después (RN-DOC-02). (4) Flete, una sola vía (RN-COS-04): `pedidos_venta.envio_costo`; insertar un gasto con `pedido_venta_id` y categoría flete/envío/transporte/transportadora falla con `E_FLETE` (`gasto.registrar` lo devuelve como código de error de la op). Ajuste y merma ya exigían motivo desde 0013 (RF-INV-03). Pruebas: `tests/db/validaciones_pedido.test.mjs`.

**Candado de pedidos finalizados (migración 0011, H-02).** No es una op, sino triggers que valen para cualquier ruta de escritura (op, RPC o SQL directo). En un pedido de venta `finalizado` o `devuelto`: (1) `pv_candado` rechaza (`RN-VEN-03`) cualquier cambio de `subtotal`, `descuento_valor`, `impuestos`, `total`, `envio_cobrado` o `envio_costo` en la cabecera; (2) `pvi_candado` rechaza (`RN-COS-02`) cambiar `costo_unitario` de sus ítems; (3) `pagos_candado` rechaza (`RN-PAG-01`) insertar, editar o borrar sus cobros (solo filas con `direccion = 'cobro'`). Siguen permitidos: la transición `finalizado → devuelto` con su reposición de stock, las notas y los demás campos no monetarios. Al finalizar el padre aún está `confirmado`, así que `trg_pv_estado` fija el costo sin chocar; `pv_candado` se dispara antes de `pv_totales` (orden alfabético de triggers).

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
`emitir_documento`, `anular_documento`, `resumen_periodo`, `precio_para` (ya en 0001). Cambios de estado y edición de maestros: `UPDATE` directo (RLS) **o** RPC; en ambos casos los triggers de 0001 son la autoridad. Desde `0013` (T-M1-13, H-03) los triggers también rechazan lo que se salta `aplicar_ops`: inserts de pedidos u órdenes en estado distinto del inicial, edición de `consecutivos` (solo avanza `emitir_documento`) y de `costo_promedio`, borrado de recepciones, archivado de pedidos finalizados y ajustes o mermas sin motivo. Desde `0016` (T-M1-16, H-16) un insert directo en `movimientos_inventario` solo admite `ajuste` y `merma`; `compra`, `venta` y las devoluciones nacen únicamente de recepciones, finalizaciones y devoluciones de pedido. Contrato de las RPC sin cambios. `ping()` devuelve `1` (solo `authenticated`).

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
| Integración real | Supabase CLI local + `pg` (`npm run test:integration`) | **Concurrencia** (2 conexiones finalizando pedidos sobre el último stock), RLS por JWT real, PostgREST |
| Repos locales | Vitest + `fake-indexeddb` | outbox, escritor (red OK/caída/timeout/rechazo), puller, `_pendiente` |
| Componentes | Testing Library | formularios, Pendientes, banners |
| E2E | Playwright (Chromium + **WebKit**) + `context.setOffline` | E1–E15 de la spec |
| PWA | Lighthouse CI (instalable, offline) | manifest, SW |

**Integración real (T-M1-10, CAM-40).** `tests/integration/*.test.mjs`, corridas por `scripts/test-integration.mjs`; **no** entran en `npm run test:db` (que usa PGlite y corre en CI sin Docker). Requisito: `npm run db:start` y `npm run db:reset` (la CLI aplica 0001-0014 al Postgres real). Las claves de desarrollo se leen de `supabase status -o json` en tiempo de ejecución; los usuarios (`socio-a@integracion.test`, `socio-b@integracion.test`, `no-miembro@integracion.test`) se crean con la API de administración de Auth y se reutilizan entre corridas. Las suites son repetibles sin reiniciar la base. Cada nombre de prueba cita su ID.

| Suite | Cubre |
|---|---|
| `concurrencia.test.mjs` | [E6] / RN-INV-03: dos conexiones `pg` reales finalizan pedidos sobre la última unidad (con bloqueo observado en `pg_stat_activity`, en 10 rondas simultáneas, con 3 pedidos y por PostgREST con dos JWT): uno gana, el otro recibe «Stock insuficiente», stock nunca negativo; con stock para ambos, ninguno se bloquea de más |
| `rls.test.mjs` | RNF-SEC-02 / [E12]: miembro ve las mismas filas que el administrador en todas las tablas; no miembro autenticado ve 0 filas en todas las tablas y vistas, no inserta/edita/borra, `aplicar_ops` responde `NO_AUTORIZADO`; sin sesión (anon) recibe 401/403 |
| `privilegios.test.mjs` | RNF-SEC-03 / H-15 en Supabase real: privilegios por defecto del rol `postgres`, función nueva sin `EXECUTE` para `anon`, `ping()` y todas las funciones de `public` rechazadas para `anon` por PostgREST |
| `ops_extremo_a_extremo.test.mjs` | Ops 0007-0012 con JWT de miembro: `tercero.crear`, compra apertura e inmediata, gasto, adjunto, pedido, cobro, finalización, remisión, idempotencia, rechazo vs. revisión, `sync_pull` |

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
- **Keep-alive** (`keepalive.yml`, diario): `POST /rest/v1/rpc/ping` con el JWT de un usuario de servicio (la anon key ya no puede ejecutar `ping()`, 0014; se define en T-M8-02). Verificar la política de pausa vigente.
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
- [ ] Ninguna función ejecutable por `anon` (sin excepciones; la prueba `funciones_sin_anon` recorre todas las migraciones).
- [ ] `service_role` ausente del cliente, del repo y de los logs.
- [ ] CSP probada (sin `unsafe-inline` si es viable; permitir solo el dominio de Supabase).
- [ ] Storage privado; sin URLs públicas.
- [ ] Scrub de PII en Sentry/registro de errores.
- [ ] Sesiones globales revocables (procedimiento escrito en `docs/runbook.md`).
- [ ] Dependencias auditadas (`npm audit`, Dependabot).
