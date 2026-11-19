# PLAN — Arquitectura técnica del MVP de Camino Col

> Versión 1.1 · 2026-11-18 · Implementa `SPEC.md`. Orden de construcción en `TASKS.md`. Historial: 1.0 (2026-11-17) plan inicial; 1.1 lo alinea con lo construido (H1 cerrado; H2 en curso) y con D-009 a D-017.
> **Regla para el agente:** donde este plan dice "verificar", consulta la documentación vigente de la librería (§13) antes de escribir código; no confíes en memoria para APIs ni versiones. Los límites del plan gratuito de Supabase y las políticas de hosting cambian: verifícalos al inicio del proyecto.
> **D-009 (ya aplicado en el cuerpo):** solo se encolan offline `orden_compra.registrar`, `tercero.crear` (proveedor), `gasto.registrar` y `adjunto.vincular`; `pedido_venta.crear` es solo online. Sin estado `bloqueada`, sin Realtime, sin stock estimado, `sync_pull` con un solo cursor, y Pendientes sin editar ni importar.

---

## 1. Stack

| Capa | Elección | Por qué |
|---|---|---|
| Cliente | **Vite + React + TypeScript (strict)** SPA | App privada tras login: no necesita SSR; build estático simple y PWA robusta |
| Estilos | Tailwind CSS | Rapidez, mobile-first |
| PWA | `vite-plugin-pwa` (Workbox), `registerType: 'prompt'` | Aviso de actualización controlado (RF-OPS-03) |
| Datos locales | **Dexie** (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) | La UI siempre lee del caché local; funciona offline |
| Backend | **Supabase** (Postgres, Auth, Storage) plan gratuito; sin Realtime (D-009) | Costo ≈ $0, Postgres estándar (portable) |
| Cliente Supabase | `@supabase/supabase-js` v2 | |
| Validación | **Zod** (payloads de ops, formularios) | Un esquema compartido cliente/pruebas |
| Enrutado | React Router | |
| PDFs | `@react-pdf/renderer` con **import dinámico** | Maquetación declarativa; carga diferida |
| Gráficos | Recharts (carga diferida) | |
| Pruebas | Vitest, Testing Library, `fake-indexeddb`, **PGlite** (DB rápida), Supabase CLI local (integración), Playwright (e2e, incl. offline y WebKit), fast-check (propiedades) | |
| Hosting | **Cloudflare Pages** (build estático) | Gratis; verificar términos de uso comercial vigentes |
| CI/CD | GitHub Actions | |
| Errores | Registro local en anillo + Sentry (opcional, con scrub de PII) | |

Versiones: las fijadas en `apps/web/package.json` y su lockfile (p. ej. Vite 8, `vite-plugin-pwa` 2.0, Dexie 4). Al actualizar, verificar la documentación (§13).

## 2. Arquitectura

```
┌────────────────────────── Celular (PWA instalada) ──────────────────────────┐
│ ui/            Pantallas React (lee SOLO de Dexie vía useLiveQuery)          │
│ application/   Casos de uso (registrarCompra, crearPedido…) y puertos        │
│ domain/        TS puro: precios, totales, estados                            │
│ infra/db/      Dexie: tablas espejo + outbox + adjuntos + kv + sync_meta     │
│ infra/supabase/ Cliente Supabase: aplicar_ops, sync_pull, storage            │
│ infra/auth/    Servicio de sesión (implementa el puerto de domain/auth)      │
│ infra/sync/    Escritor (intenta remoto → outbox) · Puller · Pendientes      │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTPS (solo cuando hay red)
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ Supabase: Postgres = fuente de verdad (reglas en triggers/funciones)         │
│   RPC: aplicar_ops(jsonb) · sync_pull(desde) · emitir_documento · …          │
│   RLS "solo miembros" · Storage privado                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Principios**
1. **El servidor decide.** Postgres valida y calcula (totales, stock, costos, consecutivos). El cliente solo propone y muestra vistas previas.
2. **La UI lee del caché local** (stale-while-revalidate): lee de Dexie sin necesitar red; el puller lo refresca.
3. **Una sola ruta de escritura para lo que admite offline** (`aplicar_ops`, online u offline: mismo código, misma idempotencia). Los cobros, los cambios de estado y la edición de maestros son **solo online**, por `UPDATE` o RPC, con los triggers como autoridad (§4.5). El contrato de «cobrar y finalizar» atómico se define al iniciar T-M4-05/06.
4. **Dominio puro y probado** en `domain/`, sin dependencias de React, Dexie ni Supabase.
5. **Puertos e implementaciones:** `application/` depende de interfaces (puertos) que implementa `infra/`; así se prueba sin red ni IndexedDB reales.

## 3. Estructura del repositorio

Estado a 2026-11-18. «Pendiente (T-…)» marca lo que aún no existe y la tarea que lo crea.

```
/
├─ CLAUDE.md · AGENTS.md                      existen
├─ docs/spec/{SPEC,PLAN,TASKS}.md             existen
├─ supabase/
│  ├─ config.toml                             existe
│  ├─ migrations/0001 … 0016                  existen (0017: T-M1-18, reembolsos)
│  └─ seed.sql                                pendiente: datos de demo SOLO local
├─ scripts/
│  ├─ test-db.mjs · test-integration.mjs      existen
│  └─ backup.sh · restore-check.sh · keepalive.sh   pendientes (T-M8)
├─ tests/
│  ├─ db/                                     existe: PGlite, un archivo por área, descubiertos solos
│  ├─ integration/                            existe: Supabase local (RLS por JWT, concurrencia, RPC); `entorno.mjs` es el arnés común
│  └─ e2e/                                    pendiente (T-M2-09): Playwright
├─ apps/web/src/
│  ├─ domain/auth                             existe (puerto de sesión)
│  ├─ domain/ (pricing, totals, pedidoEstados, ordenEstados, money, units)   pendiente (T-M3, T-M4)
│  ├─ application/auth                        existe (AuthProvider); casos de uso y puertos pendientes
│  ├─ infra/db/                               existe: db.ts (Dexie) · deviceId.ts
│  ├─ infra/supabase/client.ts                existe; llamadas a aplicar_ops, sync_pull y storage pendientes (T-M2-04/05)
│  ├─ infra/auth/servicioAuth.ts              existe
│  ├─ infra/sync/                             pendiente (T-M2-04 a 06): writer · puller · pendientesService
│  ├─ pwa/                                    existe: config.ts · almacenamiento.ts · AvisoActualizacion.tsx
│  ├─ ui/                                     existen: Home · Ajustes · ComoInstalar · auth/; pantallas y pdf/ pendientes
│  ├─ lib/                                    existen: formato.ts · uuid.ts; logger pendiente
│  ├─ test/                                   existe: servicioAuthFalso.ts (utilidades de prueba)
│  └─ main.tsx · routes.tsx                   existen
└─ .github/workflows/                         ci.yml existe; db-push · backup · keepalive pendientes (T-M8)
```

## 4. Base de datos

### 4.1 Estado de la migración 0001
Entregada y probada (24 pruebas). **No editarla** una vez aplicada a un proyecto real; todo cambio va en migraciones nuevas. Antes de su primer `db push` solo se admiten correcciones con nota en `docs/DECISIONS.md`.

### 4.2 Migraciones (estado a 2026-11-18)
Todas solo hacia adelante. Los nombres de los CHECK de 0001 son anónimos.

| Migración | Contenido | Estado |
|---|---|---|
| `0001_core` | Esquema núcleo, triggers de negocio, vistas, `emitir_documento`, `resumen_periodo`, `precio_para` | Hecha |
| `0002_sync` | `updated_at` + `set_updated_at` y `touch_padre` (el padre se actualiza cuando cambia un hijo); `terceros.productos_ofrecidos`; tablas `adjuntos` y `configuracion` (clave `negocio`); `ping()`, `uso_bd()`; `detectar_duplicados_tercero`; índices para el pull y los duplicados | Hecha |
| `0003_aplicar_ops` | Núcleo de `aplicar_ops`, `sync_ops`, `tipos_op` (§4.3) | Hecha |
| `0004_hardening` | `pg_trgm` en `extensions`; `search_path` fijo; `REVOKE` a `anon`; bucket privado `soportes` y sus políticas; **ninguna tabla en `supabase_realtime`** (D-009) | Hecha |
| `0005_sync_pull` | `sync_pull(desde)` (§4.4) | Hecha |
| `0006_fix_touch_padre` | Corrige `touch_padre` al finalizar un pedido (CAM-86) | Hecha |
| `0007` a `0010` | Ops `tercero.crear`, `orden_compra.registrar`, `gasto.registrar` + `adjunto.vincular`, `pedido_venta.crear` | Hechas |
| `0011_candado_finalizados` | Candado de pedidos finalizados (H-02) | Hecha |
| `0012_compra_apertura` | Modalidad `apertura` (H-01, D-014) | Hecha |
| `0013_cerrar_escritura_directa` | Triggers contra la escritura que se salta `aplicar_ops` (H-03) | Hecha |
| `0014_funciones_sin_anon` | `anon` no ejecuta ninguna función, ni las futuras (H-15) | Hecha |
| `0015_validaciones_pedido` | Validaciones del servidor (H-05, H-07, H-08) | Hecha |
| `0016_movimientos_solo_internos` | Insert directo de movimientos solo `ajuste` y `merma` (H-16) | Hecha |
| `0017_reembolsos` | Reembolsos y control de sobrepago (T-M1-18, CAM-97) | Hecha |

Endurecimiento vigente (0004 y 0014): `set search_path` fijo en todas las funciones (`detectar_duplicados_tercero` usa `public, extensions` porque `pg_trgm` vive en `extensions`); ninguna función ejecutable por `anon`, sin excepciones; `REVOKE` de tablas a `anon`.

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

**Implementado en `0007_op_tercero.sql` (T-M1-04, CAM-34).** `resolucion` va dentro de `datos`; `id` es opcional (el servidor lo genera).
- **Salida:** `{id}` (creado), `{id, existente:true}` (`usar_existente`) o, en revisión, `resultado.candidatos:[{id,nombre,telefono,municipio,motivo}]` (`motivo`: `telefono`, `documento` o `nombre`; el umbral de similitud de nombre está en la migración).
- **Validaciones:** nombre no vacío, al menos un rol, teléfono (si viene) de 7 a 15 dígitos sin letras → `DATOS_INVALIDOS`; cliente sin `consentimiento_datos` → `E_CONSENTIMIENTO` (RF-TER-05; sin `consentimiento_en` se usa la hora del servidor); `usar_existente` con tercero inexistente o borrado → `E_REF`; resolución de otro tipo → `DATOS_INVALIDOS`.
- **`usar_existente`** suma al existente el rol que pedía el payload (cliente/proveedor) y no cambia nada más. Un documento repetido con `crear_igual` choca con el índice único → `E_DUPLICADO`.
- **Reutilizable:** `crear_tercero_desde_payload(jsonb)` es la misma lógica para `cliente_nuevo` y `proveedor_nuevo` (T-M1-05/06); allí un `_revision` detiene la op completa.

`pedido_venta.crear`
```json
{ "pedido": { "id","cliente_id","origen","referencia_origen","fecha","entrega_tipo",
              "direccion_entrega","municipio_entrega","envio_cobrado","envio_costo",
              "descuento_valor","fecha_entrega_estimada","notas" },
  "cliente_nuevo": { …payload tercero.crear… } | null,
  "items": [ { "id","articulo_id","cantidad","precio_lista","descuento_pct","precio_unitario" } ] }
```
Servidor: crea PV en `recibido`; fija `tasa_impuesto` desde el artículo (autoridad del servidor) y calcula los precios con `precio_para` (el precio que envíe el cliente se ignora; ver el detalle de 0010 abajo); **advertencias** (no error): `PRECIO_CAMBIO` (el cliente envió un precio distinto del vigente), `STOCK` (requerido > disponible_para_prometer). `stock_visto_en` no se acepta.

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

**Implementado en `0009_op_gasto_adjunto.sql` (T-M1-07, CAM-37).** Ambas ops funcionan offline (D-009). `id` es opcional (el servidor lo genera).
- **Salida de `gasto.registrar`:** `{id, fecha, categoria, concepto, valor, orden_compra_id, pedido_venta_id, pagado_por}`.
- **Validaciones:** `categoria` no vacía; `valor` numérico, mayor que cero y entero (COP sin decimales) → `DATOS_INVALIDOS`; `fecha` `AAAA-MM-DD` (por defecto hoy en `America/Bogota`; formato inválido → `DATOS_INVALIDOS`; posterior a mañana → `E_FECHA`); `orden_compra_id`, `pedido_venta_id` o `pagado_por` inexistentes o borrados → `E_REF`.
- **Efecto:** el gasto entra a `resumen_periodo` por su `fecha`. Un gasto con `pedido_venta_id` y categoría de flete se rechaza (0015, RN-COS-04).
- **`op_id`:** la idempotencia la da `sync_ops`; el manejador no recibe el `op_id` (en 0003), así que `op_id` queda nulo en `gastos`, `adjuntos`, `ordenes_compra`, `pedidos_venta` y `pagos`, y un `id` repetido con otro `op_id` responde `E_DUPLICADO` (PK; si la fila no tiene registro previo en `sync_ops`, la op queda en `error` y detiene la cola).

`adjunto.vincular` → `{ id?, entidad:'pago'|'gasto'|'recepcion'|'orden_compra'|'tercero', entidad_id, path, mime? }`

Salida: `{id, entidad, entidad_id, path}`. La entidad debe existir y no estar borrada → `E_REF`; `entidad` desconocida, `entidad_id` o `path` ausentes → `DATOS_INVALIDOS`. El archivo ya está en Storage (`soportes`); la op solo lo vincula, y no valida que el objeto exista en el bucket. Un fallo de subida no invalida el registro principal (RF-SYN-09).

`pago.reembolsar` · **Implementada en `0017_reembolsos.sql` (T-M1-18, spec T-M1-17, CAM-97).** Solo con conexión (D-009): la PWA no lo encola. Devuelve al cliente dinero ya cobrado de un PV `cancelado` o `devuelto` (SPEC RF-PAG-04..06, RN-PAG-02..07). Lo que sigue es el contrato que 0017 cumple.
```json
{ "id?":"uuid", "pedido_id":"uuid", "valor":40000, "medio":"efectivo|nequi|daviplata|transferencia|tarjeta|otro",
  "motivo":"texto obligatorio", "fecha?":"2026-11-18", "referencia?":"…", "pagado_por?":"uuid de socio" }
```
Firma: `op_pago_reembolsar(p jsonb) returns jsonb`, `SECURITY INVOKER`, `search_path` fijo; se registra con `insert into tipos_op values ('pago.reembolsar','op_pago_reembolsar')`; la cubre el `REVOKE` por defecto de 0014 (sin `grant` masivo).

El servidor bloquea el pedido (`for update`), calcula `cobrado_neto = Σ cobros − Σ reembolsos` e inserta **una fila en `pagos`** con `direccion = 'reembolso'`, `pedido_venta_id`, `valor` positivo, `medio`, `motivo`, `referencia` y `pagado_por`. No cambia el estado del pedido ni toca `movimientos_inventario`.

| Regla | Error |
|---|---|
| `valor` numérico, > 0 y entero; `medio` válido; `motivo` no vacío; formato o tipo inválido | `DATOS_INVALIDOS` |
| `fecha` (fecha sin hora, por defecto hoy en `America/Bogota`; hasta mañana). Se guarda en `pagos.fecha` (timestamptz) como `((p->>'fecha')::date)::timestamp at time zone 'America/Bogota'`, para no correr el día | `E_FECHA` |
| Pedido inexistente o borrado; `pagado_por` que no es socio | `E_REF` |
| Estado distinto de `cancelado` o `devuelto` | `E_ESTADO` |
| `valor` > `cobrado_neto` (incluye `cobrado_neto = 0`); no se inserta nada | `E_SOBREPAGO` |

Salida: `{pago_id, pedido_id, valor, cobrado_neto_restante, por_reembolsar}` (`por_reembolsar = cobrado_neto_restante > 0`). Idempotencia por `op_id` en `sync_ops` (`ya_aplicada` con el mismo resultado); `pagos.op_id` queda nulo como en 0008 a 0010.

**Esquema de 0017 (solo hacia adelante, sin editar 0001).**
1. **CHECK de `pagos`.** Los de `direccion` y de ligadura son anónimos en 0001. La migración los busca en `pg_constraint` por definición (`contype = 'c'` y que mencione `direccion`), los borra y crea tres con nombre: `pagos_direccion_chk` (`direccion in ('cobro','pago','reembolso')`), `pagos_ligadura_chk` (`cobro` y `reembolso` exigen `pedido_venta_id` y no `orden_compra_id`; `pago` al revés) y `pagos_motivo_chk` (`motivo` no vacío si `direccion = 'reembolso'`). `valor > 0` se conserva: el reembolso es una fila positiva con su propia dirección, no un cobro negativo.
2. **Columna** `pagos.motivo text`.
3. **Objetos nuevos o reemplazados** (lista cerrada): `op_pago_reembolsar`, la fila de `tipos_op`, los triggers de abajo, la vista `v_por_reembolsar`, y las funciones `resumen_periodo`, `sync_pull` y `pv_totales` (reemplazadas por completo con `create or replace` o `drop` + `create`; `pv_totales` solo añade la regla `E_TOTAL`). No se toca ninguna otra función.

**Triggers de `pagos` y su orden.** Postgres dispara los `BEFORE` por orden alfabético de nombre, así que el candado de 0011 gana a los nuevos. Valen para cualquier ruta (op, RPC o SQL directo).

| Orden | Trigger | Evento | Regla | Código |
|---|---|---|---|---|
| 1 | `pagos_candado` (0011) | insert, update, delete de cobros | PV `finalizado`/`devuelto` no admite cobros (RN-PAG-01); no mira reembolsos | el de 0011 |
| 2 | `pagos_reembolso_candado` (nuevo) | update y delete de reembolsos | No se editan ni se borran (RN-PAG-05) | `E_PAGO_INMUTABLE` |
| 2 | ídem | insert de reembolsos | Orden de validación: (a) estado `cancelado`/`devuelto` (RN-PAG-03); (b) `motivo` no vacío; (c) `valor ≤ cobrado_neto` (RN-PAG-04) | `E_ESTADO`; `DATOS_INVALIDOS`; `E_SOBREPAGO` |
| 3 | `pagos_sobrepago` (nuevo) | insert y update del `valor` de cobros | PV `cancelado` → rechazar (RN-PAG-02); PV `recibido`/`confirmado` con `cobrado_neto` + valor por encima del `total` | `E_ESTADO`; `E_SOBREPAGO` |
| 3 | ídem | update y delete de cobros en PV `cancelado`/`devuelto` | Los cobros no se editan ni se borran: dejarían `cobrado_neto` fuera de `0 ≤ cobrado_neto ≤ total` | `E_ESTADO` |

El ID de la regla (RN-PAG-nn) va **dentro del mensaje**, no como prefijo: `aplicar_ops` solo reconoce como código lo que cumple `^[A-Z][A-Z0-9_]*:` y un prefijo con guion saldría como `ERROR_INTERNO`.

Los triggers 2 y 3 toman primero `select … from pedidos_venta where id = new.pedido_venta_id for update`, para que dos cobros o reembolsos simultáneos no se sumen por encima del tope. Además `pv_totales` rechaza con `E_TOTAL` dejar `total < cobrado_neto` (solo cuando `total` cambia). Desde SQL directo el error sale como excepción con el prefijo del código. Casos de prueba (`tests/db/reembolsos.test.mjs`): uno por RN-PAG-02 a 07 y por E16, E17 y E18, cada uno con su error esperado, además de la regresión de 0011 (un cobro en un PV finalizado sigue rechazado). El bloqueo `for update` no se puede probar en PGlite (una sola conexión): T-M1-18 exige además `tests/integration/reembolsos.test.mjs` (dos conexiones sobre el último saldo) y un caso de `pago.reembolsar` en `ops_extremo_a_extremo.test.mjs`.

**Lecturas.**
- `v_ventas_pedido` y `v_cuentas_por_cobrar` no cambian (RN-PAG-06).
- Vista nueva `v_por_reembolsar` (`security_invoker`): `pedido_id`, `cliente_id`, `cliente`, `estado`, `total`, `cobrado`, `reembolsado`, `por_reembolsar` (todas numéricas salvo `estado`, `cliente`) para PV `cancelado`/`devuelto` con `cobrado − reembolsado > 0`. Se lee **online**, no se espeja en Dexie.
- `resumen_periodo` agrega la columna `reembolsos` (cambia el tipo de retorno, por eso `drop` + `create`; se parte de la versión de 0012); la utilidad neta no cambia.
- `sync_pull` (0005): 0017 la reemplaza. El filtro del arreglo `pagos` de cada pedido pasa de `direccion = 'cobro'` a `direccion in ('cobro','reembolso')` (el `greatest(updated_at…)` de 0005 no filtra por dirección y no cambia); el campo `direccion` los distingue y el cliente suma `cobrado_neto` separando ambos. Un reembolso mueve el cursor del pedido. Los PV `cancelado`/`devuelto` sin `finalizado_en` reciente no entran al snapshot inicial: su detalle y sus reembolsos se piden online.

**Validaciones del servidor (migración 0015, T-M1-15, H-05/H-07/H-08, D-015).** Triggers INVOKER que valen para cualquier ruta de escritura; el error lleva el ID de la regla. Pruebas: `tests/db/validaciones_pedido.test.mjs`.
- Al pasar a `finalizado`: descuento ≤ subtotal y total ≥ 0 (RF-VEN-03; `pedido_venta.crear` ya lo rechaza con `DATOS_INVALIDOS` desde 0010); con `entrega_tipo = 'transportadora'`, `envio_costo > 0` (RF-VEN-05).
- Pasar a `cancelado` o `devuelto` exige `motivo_estado` no vacío (RF-VEN-05).
- `documentos`: poner `anulado_en` exige `motivo_anulacion` no vacío, y ese motivo no cambia después (RN-DOC-02).
- Flete, una sola vía (RN-COS-04): `pedidos_venta.envio_costo`; insertar un gasto con `pedido_venta_id` y categoría flete, envío, transporte o transportadora falla con `E_FLETE` (`gasto.registrar` lo devuelve como código de error de la op).
- Ajuste y merma ya exigían motivo desde 0013 (RF-INV-03).

**Candado de pedidos finalizados (migración 0011, H-02).** No es una op, sino triggers que valen para cualquier ruta de escritura. En un PV `finalizado` o `devuelto`:
- `pv_candado` rechaza (`RN-VEN-03`) cualquier cambio de `subtotal`, `descuento_valor`, `impuestos`, `total`, `envio_cobrado` o `envio_costo` en la cabecera.
- `pvi_candado` rechaza (`RN-COS-02`) cambiar `costo_unitario` de sus ítems.
- `pagos_candado` rechaza (`RN-PAG-01`) insertar, editar o borrar sus cobros (solo filas con `direccion = 'cobro'`).
- Siguen permitidos: la transición `finalizado → devuelto` con su reposición de stock, las notas y los demás campos no monetarios. Al finalizar el padre aún está `confirmado`, así que `trg_pv_estado` fija el costo sin chocar; `pv_candado` se dispara antes de `pv_totales` (orden alfabético de triggers).

### 4.4 Contrato `sync_pull(desde timestamptz default null) → jsonb` (migración 0005, D-009)

Un solo cursor y un snapshot en una respuesta. Sin cursores por tabla, sin `has_more`, sin parámetros de límite o stock. `SECURITY INVOKER` (la RLS aplica: quien no es miembro recibe todo vacío), `search_path` fijo, solo lectura.

Entrada: `desde` = cursor devuelto en la llamada anterior; `null` = sincronización inicial. El cliente le resta **2 minutos** (constante) antes de enviarlo: los upserts son idempotentes.

Salida:
```json
{ "server_time":"…",
  "cursor":"2026-11-17T15:04:05.123456Z",
  "catalogo": { "productos":[…], "articulos":[…], "listas_precio":[…], "precios":[…], "unidades":[…] },
  "terceros": [ … ],
  "configuracion": [ { "clave","valor","updated_at" } ],
  "pedidos_venta":  [ { …cabecera…, "items":[…], "pagos":[…cobros (y reembolsos desde 0017)…] } ],
  "ordenes_compra": [ { …cabecera…, "items":[…], "recepciones":[ { …, "items":[…] } ], "pagos":[…pagos…] } ],
  "stock": [ { "articulo_id","fisico","comprometido","en_camino","disponible_para_prometer","faltante","costo_promedio" } ] }
```
- **Cursor único:** máximo `updated_at` de lo devuelto; si no hubo cambios, el mismo `desde` recibido. Con base vacía y `desde = null` el `cursor` es `null`: el cliente conserva el que tenía. Comparación estricta (`updated_at > desde`), así un cambio aparece una sola vez. El cursor **no** incluye `stock`.
- **Padre e hijos:** los hijos viajan dentro del padre. Un cambio en un ítem, una recepción o un ítem de recepción mueve el `updated_at` del padre (`touch_padre`, 0002; versión vigente en 0006, que no toca al padre cuando en un ítem de pedido solo cambió `costo_unitario`). Los pagos no tocan al padre: `sync_pull` también compara `max(pagos.updated_at)` del pedido o la compra.
- **Snapshot inicial (`desde = null`):** catálogo, terceros y configuración completos; `pedidos_venta` en estado `recibido` o `confirmado`, o con `finalizado_en` en los últimos 90 días; `ordenes_compra` en `borrador`, `pedida` o `recibida_parcial`, o con `fecha` en los últimos 90 días. El resto se pide bajo demanda (online).
- **Con cursor:** todo lo que cambió, sin filtro de ventana (si un pedido viejo cambia, llega).
- **Borrado lógico:** las filas con `deleted_at` viajan marcadas. `precios`, `listas_precio` y `unidades` no tienen `deleted_at`: un borrado físico no se propaga; se corrige repitiendo la sincronización inicial (limpiar el cache y volver a llamar con `desde = null`).
- **Stock:** siempre completo (derivado de `v_stock` + `costo_promedio`), sin cursor; no mueve el cursor. No se replica `movimientos_inventario`; el kardex se consulta online.
- Fuera de esta versión: gastos y adjuntos (los escribe el cliente; se leen online).


### 4.5 Otras RPC
`emitir_documento`, `anular_documento`, `resumen_periodo`, `precio_para` (ya en 0001). Cambios de estado y edición de maestros: `UPDATE` directo (RLS) **o** RPC; en ambos casos los triggers de 0001 son la autoridad. Contrato de las RPC sin cambios. `ping()` devuelve `1` (solo `authenticated`, 0014); es la única definición de `ping()`.

Triggers que cierran lo que se salta `aplicar_ops`, por migración:
- **0011:** pedidos finalizados no se reescriben (arriba).
- **0013 (H-03):** inserts de pedidos u órdenes en estado distinto del inicial; edición de `consecutivos` (solo avanza `emitir_documento`) y de `costo_promedio`; borrado de recepciones; archivado de pedidos finalizados; ajustes o mermas sin motivo.
- **0016 (H-16):** un insert directo en `movimientos_inventario` solo admite `ajuste` y `merma`; `compra`, `venta` y las devoluciones nacen únicamente de recepciones, finalizaciones y devoluciones de pedido.

## 5. Cliente: datos locales y sincronización

### 5.1 Esquema Dexie (v1, `infra/db/db.ts`)
Las versiones solo agregan (`version(n).upgrade`); nunca se borra la base (regla 10).
```
terceros:        'id, nombre, telefono, numero_documento, *roles, _pendiente'
productos:       'id, nombre'
articulos:       'id, producto_id, nombre'
unidades:        'codigo'
listas_precio:   'id'
precios:         'id, [lista_id+articulo_id]'
pedidos_venta:   'id, estado, cliente_id, fecha, _pendiente'      // items y pagos embebidos
ordenes_compra:  'id, estado, proveedor_id, fecha, _pendiente'    // items, recepciones y pagos embebidos
gastos:          'id, fecha, _pendiente'
stock:           'articulo_id'
configuracion:   'clave'
outbox:          'op_id, estado, created_at'       // estado: pendiente|error|revision
adjuntos_locales:'id, op_id, estado'               // blob, mime y estado de subida en la misma fila
sync_meta:       'tabla'                           // una sola fila, tabla='global': {cursor, last_sync} (D-009)
kv:              'clave'                           // dashboard cacheado, device_id, preferencias
```
De dónde sale cada tabla:

| Tabla | Origen |
|---|---|
| `productos`, `articulos`, `unidades`, `listas_precio`, `precios`, `stock`, `configuracion` | `sync_pull`, tal cual |
| `terceros` | `sync_pull`; el puller deriva `roles` de `es_cliente` y `es_proveedor` (D-016) |
| `pedidos_venta`, `ordenes_compra` | `sync_pull`, con hijos y pagos embebidos (en pedidos, cobros y, desde 0017, reembolsos) |
| `gastos` | **No** vienen por `sync_pull`: solo existen los creados en este dispositivo, con `_pendiente = op_id`; tras subir, la fila se conserva con el mismo `id`. Los gastos de otros dispositivos se leen online |
| `outbox`, `adjuntos_locales`, `kv` | Solo locales; nunca se limpian al cerrar sesión |

- **Registros creados offline** viven en las mismas tablas con `_pendiente = op_id`, para que las listas los muestren con ⏳. Al aplicarse la op, el siguiente pull trae la fila del servidor y reemplaza a la local (mismo `id`).
- **Ciclo de vida de la outbox:** nace `pendiente`; `ok` o `ya_aplicada` borran la fila y quitan `_pendiente`; `error` la marca `error` con el código y el mensaje; `revision` la marca `revision`. **No existe `bloqueada`** (D-009) (eliminada de `EstadoOutbox` en T-M2-05).
- **Fotos (T-M2-08):** `lib/imagen.ts` comprime a WebP (lado largo ≤ 1280 px, ≈ ≤ 150 KB; JPEG si el navegador no codifica WebP). `adjuntosService.guardar` las deja en `adjuntos_locales` (`id` uuid, `op_id` de la op principal, `entidad`, `entidad_id`, `path`, `mime`, `blob`). `path` en el bucket `soportes`: `<entidad>/<entidad_id>/<id>.<webp|jpg>`. Estados: `local` → `subiendo` → `subida` → `vinculada` (borra el blob) o `error` (con `error`). Solo se sube cuando la op principal ya no está en outbox; el vínculo es `adjunto.vincular` con `op_id` = `id` del adjunto (idempotente). Reintento manual: `pendientesService.subir` invoca `adjuntos.subirListas()` tras las ops.
- **Se leen online, sin espejo local:** `v_por_reembolsar`, los pagos de pedidos fuera del snapshot, el kardex y los gastos de otros dispositivos.

### 5.2 Escritor (`infra/sync/writer.ts`)
```
commit(op):
  1. Zod-validar payload.
  2. Intentar rpc aplicar_ops({ ops: [op] }) con AbortController (8 s).
       ok|ya_aplicada → quitar _pendiente y borrar la fila de outbox si existe → fin.
       revision       → UI de decisión; reenviar con resolucion; (si no hay red, dejar en outbox "revision").
       error          → lanzar error de dominio (mostrar); NO encolar.
       fallo de red/timeout → paso 3 solo si el tipo admite offline; si no, "Requiere conexión".
  3. Transacción Dexie: filas locales con _pendiente + put en outbox (estado "pendiente") + blobs.
```
- **Fallo de red** = `TypeError`, `AbortError`, timeout o 502-504 del gateway. **Rechazo del servidor** = error PostgREST con código SQLSTATE o `status:error` en el resultado de la op. No confundirlos. Todo lo demás (401, 429, otros 5xx) significa «no se aplicó»: se encola con aviso (la op no queda registrada y se puede reenviar), y un 401 pide volver a entrar conservando los datos.
- **Online:** `navigator.onLine` es solo una pista (si es `false`, se salta el intento y se encola); la verdad es el resultado de la petición.
- **Nada** reintenta en segundo plano. `pendientesService.subir(opIds)` solo se invoca desde la UI (botón).
- **Subida de varias ops:** el cliente las envía **de una en una**, por orden de `created_at`, y se detiene en la primera cuyo resultado no sea `ok` ni `ya_aplicada` (RF-SYN-07; cierra H-12). Las siguientes siguen `pendiente` hasta que el usuario resuelva la que falló, así una dependiente (`adjunto.vincular` tras `gasto.registrar`) nunca se envía antes que su base. El servidor sigue aceptando lotes (D-013), pero el cliente no los usa. Estado de la fila según `status`: `ok` y `ya_aplicada` → se borra; `error` → `error` (con `error: {codigo, mensaje}`); `revision` → `revision` (con `resultado: {candidatos}`).
- **Resolución de una `revision`:** la UI de decisión escribe la `resolucion` elegida dentro de `datos` de la misma fila y la devuelve a `pendiente` (no es edición del usuario). La fila local `_pendiente` se conserva hasta resolver; con `usar_existente`, el siguiente pull trae el registro real y reemplaza la fila provisional.

### 5.3 Centro de pendientes (`ui/screens/Pendientes`)
Lista con resumen legible por tipo (p. ej. "Compra a Don Luis · 10 × Café Sierra · $100.000 · hace 2 d"), checkbox, **Descartar** (confirma; borra blobs) y **Subir seleccionados**. Resultado por fila (✔/⚠/✖). Banner global: "N sin subir (el más viejo: hace X)". **Exportar JSON** (D-009); sin Editar ni Importar.

Formato del JSON exportado: `{ "version": 1, "device_id": "…", "exportado_en": "ISO UTC", "ops": [ { "op_id", "tipo", "datos", "estado", "created_at" } ] }`. No incluye los blobs de fotos (el archivo avisa cuántas fotos locales quedan sin exportar).

### 5.4 Puller
- Se ejecuta al abrir la app, al volver a primer plano, tras cada escritura exitosa y por botón "Actualizar". Hace un solo `sync_pull(cursor)` y guarda el cursor en `sync_meta` (`tabla = 'global'`). Sin Realtime (D-009).
- Aplica filas con *last-write-wins* por `updated_at` (ignora filas más viejas que la local ya sincronizada). **No** pisa filas con `_pendiente`.
- Deriva `terceros.roles`; reemplaza `stock` completo en cada llamada.

### 5.5 (Eliminado) Stock estimado offline
Eliminado por D-009. La app muestra el stock del último pull con la etiqueta "datos al …"; los PV pendientes no lo modifican (RF-VEN-08). Se conserva el número de sección.

### 5.6 Dashboard
Online: llamar `resumen_periodo`, `v_ventas_diarias`, `v_ventas_por_articulo`, `v_cuentas_por_cobrar` (esperando pago); guardar el resultado en `kv` con `fetched_at`. Offline: mostrar lo guardado con la etiqueta. **La fuente exacta de cada indicador y la forma del JSON en `kv` se definen al iniciar T-M7 (H4)**, junto con los hallazgos abiertos H-10, H-13 y H-14; la lista de indicadores es la de D-008.

## 6. PWA

- `manifest.webmanifest` (nombre "Camino Col", `display: standalone`, `lang: es-CO`, íconos 192/512 + *maskable*, `theme_color`); `apple-touch-icon` 180; metas `apple-mobile-web-app-capable`. Pantalla "Cómo instalar" (`/instalar`, pública) para iOS (Compartir → Añadir a pantalla de inicio) y Android. Hecho en T-M2-02.
- Service worker: **precache del app shell** y `navigateFallback` a `index.html`. Sin `runtimeCaching`: las llamadas a Supabase no pasan por la caché del SW (equivale a NetworkOnly; los datos viven en Dexie).
- `registerType: 'prompt'`: aviso "Nueva versión disponible — Actualizar"; no recargar con formularios sucios.
- `navigator.storage.persist()` se pide al arrancar y al evento `appinstalled`; el estado se muestra en Ajustes. Contexto iOS (**verificar**): Safari puede purgar datos de sitios no instalados tras ~7 días sin uso; la PWA instalada tiene mejor trato; no hay Background Sync.
- Hosting: `_redirects` (`/* /index.html 200`) y `_headers` (CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`). **Los valores exactos se fijan en T-M8-04**, porque el CSP necesita el dominio del proyecto Supabase de producción.

## 7. PDFs y compartir

**Las plantillas, las columnas y el texto sugerido para compartir se definen al iniciar T-M4-07 (documentos de venta) y T-M5-04 (comprobante de compra).** Lo que sigue es el contrato que no cambia:

- Plantillas en `ui/pdf/`: `Confirmacion`, `Remision` (y `FacturaInterna`), `ComprobanteCompra`. Datos desde el **snapshot del documento** (nunca de las tablas vivas) + `configuracion.negocio`.
- Contenido: logo/nombre del negocio, tipo y número, fecha, cliente/proveedor, tabla de líneas (descripción, presentación, cantidad, precio, desc., total), descuento global, envío, total en COP, notas y leyenda "Documento interno — no es factura electrónica" (si `estado_fiscal` es nulo).
- `compartirPdf(blob, nombre)`: `navigator.canShare({files})` → `navigator.share({files, text})` (abre WhatsApp con el adjunto); fallback: descarga. Texto breve sugerido con resumen y total.
- La `confirmacion` va **sin consecutivo** (RF-DOC-01) y puede generarse offline; no lleva número.

## 8. (Eliminado) Parser de pedidos de WhatsApp

No se construye (D-006). El mensaje que arma la web es texto libre de un solo producto, sin cantidad, cliente ni número de pedido, y los socios registran cada pedido a mano después de confirmarlo por WhatsApp. Se conserva el número de sección para no romper referencias.

## 9. Autenticación y sesión (T-M2-01, nota «T-M2-01» de `DECISIONS.md`)
- Email + contraseña; **signups deshabilitados**; usuarios creados en el panel; ambos registrados en `miembros` por SQL de administrador. La pertenencia se comprueba por `miembros.user_id`.
- Sesión persistente. El cliente **no** cierra sesión ante errores de red ni de refresco offline, y un error de red, un 5xx o un fallo de permisos al consultar `miembros` nunca se trata como «no es miembro» (solo cero filas confirmadas lo es). Sin red, la app abre con el último usuario y la última pertenencia positiva recordados en `localStorage` (`camino.auth.usuario`, `camino.miembro.<id>`).
- `invalid_grant` estando online → pantalla de re-login que **conserva Dexie y la outbox** (la outbox es del dispositivo, no del token).
- Cerrar sesión usa `signOut({ scope: 'local' })` y **no** borra datos locales. El caché del servidor se limpia **al iniciar sesión con un usuario distinto** del recordado en `camino.auth.usuario`, antes del primer pull, con `limpiarCacheDeServidor` (T-M2-04): borra el caché y el cursor pero **conserva** la outbox, `adjuntos_locales`, `kv` y las filas `_pendiente` (regla 10). La advertencia por pendientes y la exportación al cerrar sesión (RF-AUTH-03) viven en `ui/pendientes/BotonCerrarSesion` (T-M2-06).
- Primer arranque requiere conexión para el login inicial y la carga inicial (catálogo, clientes, pedidos abiertos).

## 10. Estrategia de pruebas (TDD)

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Dominio | Vitest + fast-check | precios, escalones, totales, estados |
| **Paridad cliente↔servidor** | Vitest + PGlite | Propiedad: para pedidos aleatorios, `domain/totals` = totales de Postgres (±0: mismo redondeo; `apps/web/src/domain/paridad.test.ts`) |
| Base de datos | PGlite (`tests/db/`, una suite por área) | Reglas, triggers, `aplicar_ops`, `sync_pull`, RLS con roles simulados; cada suite carga las migraciones que necesita |
| Integración real | Supabase CLI local + `pg` (`npm run test:integration`) | **Concurrencia** (2 conexiones finalizando pedidos sobre el último stock), RLS por JWT real, PostgREST |
| Repos locales | Vitest + `fake-indexeddb` | outbox, escritor (red OK/caída/timeout/rechazo), puller, `_pendiente` |
| Componentes | Testing Library | formularios, Pendientes, banners |
| E2E | Playwright (Chromium + **WebKit**) + `context.setOffline` | E1–E15 de la spec |
| PWA | Lighthouse CI (instalable, offline) | manifest, SW |

**Integración real (T-M1-10, CAM-40).** `tests/integration/*.test.mjs`, corridas por `scripts/test-integration.mjs`; **no** entran en `npm run test:db` (que usa PGlite y corre en CI sin Docker) ni en el CI (necesitan Supabase local y varios GB de imágenes; nota T-M1-10 de `DECISIONS.md`). Requisito: `npm run db:start` y `npm run db:reset` (la CLI aplica todas las migraciones de `supabase/migrations/` al Postgres real). `tests/integration/entorno.mjs` es el arnés común (claves, usuarios y datos base). Las claves de desarrollo se leen de `supabase status -o json` en tiempo de ejecución; los usuarios (`socio-a@integracion.test`, `socio-b@integracion.test`, `no-miembro@integracion.test`) se crean con la API de administración de Auth y se reutilizan entre corridas. Las suites son repetibles sin reiniciar la base. Cada nombre de prueba cita su ID.

| Suite | Cubre |
|---|---|
| `concurrencia.test.mjs` | [E6] / RN-INV-03: dos conexiones `pg` reales finalizan pedidos sobre la última unidad. Escenarios: bloqueo observado en `pg_stat_activity`, 10 rondas simultáneas, 3 pedidos y PostgREST con dos JWT. Uno gana y el otro recibe «Stock insuficiente»; el stock nunca queda negativo; con stock para ambos, ninguno se bloquea de más |
| `rls.test.mjs` | RNF-SEC-02 / [E12]: miembro ve las mismas filas que el administrador en todas las tablas; no miembro autenticado ve 0 filas en todas las tablas y vistas, no inserta/edita/borra, `aplicar_ops` responde `NO_AUTORIZADO`; sin sesión (anon) recibe 401/403 |
| `privilegios.test.mjs` | RNF-SEC-03 / H-15 en Supabase real: privilegios por defecto del rol `postgres`, función nueva sin `EXECUTE` para `anon`, `ping()` y todas las funciones de `public` rechazadas para `anon` por PostgREST |
| `ops_extremo_a_extremo.test.mjs` | Ops 0007-0012 con JWT de miembro: `tercero.crear`, compra apertura e inmediata, gasto, adjunto, pedido, cobro, finalización, remisión, idempotencia, rechazo vs. revisión, `sync_pull` |

**E2E (T-M2-09, CAM-49).** `apps/web/e2e/*.spec.ts`, `npm run test:e2e` (nota T-M2-09 de `DECISIONS.md`). Playwright corre en la imagen oficial `mcr.microsoft.com/playwright` (servicio `e2e` de `docker-compose.yml`, versión igual a `@playwright/test`) contra Supabase local real, con la app construida en modo `e2e` y servida con `vite preview`; Chromium y WebKit a 360 px. No entra en `test:db` ni en CI. Hasta H3 no hay pantallas de captura: un gancho solo de prueba (`window.__camino_e2e`, existe solo en el build `e2e`; `bundle.test.ts` lo vigila) llama al escritor real.

| Suite | Cubre |
|---|---|
| `e1-sin-red.spec.ts` | Parte de [E1]: la app abre sin red desde el service worker; un gasto creado sin red queda en la outbox con `_pendiente` (⏳) y el indicador cuenta «1 pendiente»; al volver la red aparece el banner «1 sin subir» y no se envía nada solo (cero `aplicar_ops`); «Subir seleccionados» sube una vez, el pendiente desaparece y el gasto existe en el servidor. Falta, con las pantallas de H3, la compra completa con proveedor nuevo, recepción, pago y foto |

**Cobertura mínima:** `domain/` ≥ 90 %, `infra/sync/` ≥ 85 %, SQL: todo requisito RN con ≥ 1 prueba. Las pruebas de `tests/db/` deben pasar siempre, incluidas las previas.

## 11. CI/CD y entornos

- **Local:** `supabase start` (Docker) + `npm run dev`.
- **Producción:** un proyecto Supabase gratuito. (Opcional: segundo proyecto como *staging*; verificar el cupo del plan.)
- `ci.yml` (en cada PR y en cada push a `main` y `release/**`, D-017): `npm run test:db`, y en `apps/web` pruebas, `tsc --noEmit`, lint y build. La integración real y los E2E (T-M2-09) se corren en local (§10), no en CI. **Verde obligatorio para fusionar a `main`.**
- Despliegue del front: integración Git de Cloudflare Pages (rama `main`); variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- `db-push.yml`: **manual** (`workflow_dispatch`), requiere CI verde y un backup reciente; usa `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` como secrets.
- Flujo de ramas: una rama por tarea, que se integra en `release/<hito>` sin PR; un solo PR por release (D-017). Mensajes de commit convencionales.

## 12. Operación en el plan gratuito

- **Backup** (`backup.yml`, diario): `pg_dump --format=custom --no-owner` contra la cadena de conexión (secret), **cifrado con `age`** (clave pública en secret `AGE_RECIPIENT`), subido como artefacto con retención 30 días; copia semanal opcional a Google Drive. Los objetos de **Storage** no están en `pg_dump`: script semanal que los descarga vía API.
- `restore-check.sh`: restaura el último dump en un Postgres local (Docker) y corre consultas de humo (conteos, `v_stock`, un `emitir_documento` de prueba en transacción con rollback). **Se ejecuta y se documenta antes de salir a producción** y luego trimestralmente.
- **Keep-alive** (`keepalive.yml`, diario): `POST /rest/v1/rpc/ping` con el JWT de un usuario de servicio (la anon key ya no puede ejecutar `ping()`, 0014; se define en T-M8-02). Verificar la política de pausa vigente.
- **Monitoreo de cuota:** pantalla de Ajustes → "Uso" (tamaño de BD vía RPC `uso_bd()` y conteo de adjuntos) con alerta al 70 % de 500 MB.
- Imágenes: comprimir a WebP (≤ ~150 KB, lado largo ≤ 1280 px) **en el cliente** antes de subir.

## 13. Decisiones técnicas que el agente debe verificar con documentación

Esta es la lista única de verificaciones (las menciones sueltas en otras secciones remiten aquí).

1. API actual de `vite-plugin-pwa` para el flujo `prompt` y `navigateFallback`.
2. Cómo pasar `AbortSignal` a `supabase.rpc(...)` en la versión vigente.
3. Políticas de Storage para bucket privado y URLs firmadas.
4. Soporte de `navigator.share` con archivos PDF en iOS Safari y Android Chrome actuales.
5. Comportamiento de almacenamiento y `storage.persist()` en iOS para PWA instaladas.
6. Límites y política de pausa del plan gratuito de Supabase y términos de Cloudflare Pages.
7. Disponibilidad de `pg_trgm` en Supabase y en PGlite (si falta en PGlite, probar la normalización sin trigramas y dejar la similitud como prueba de integración).
8. Flujo de `supabase db push` y `supabase start` en CI.

## 14. Seguridad (checklist de implementación)

- [ ] RLS activo en tablas **y** vistas con `security_invoker`.
- [ ] Ninguna función ejecutable por `anon` (sin excepciones; la prueba `funciones_sin_anon` recorre todas las migraciones).
- [ ] `service_role` ausente del cliente, del repo y de los logs.
- [ ] CSP probada (sin `unsafe-inline` si es viable; permitir solo el dominio de Supabase).
- [ ] Storage privado; sin URLs públicas.
- [ ] Scrub de PII en Sentry/registro de errores.
- [ ] Sesiones globales revocables (procedimiento escrito en `docs/runbook.md`).
- [ ] Dependencias auditadas (`npm audit`, Dependabot).
