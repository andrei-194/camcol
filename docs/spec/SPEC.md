# SPEC — Plataforma operativa Camino Col (MVP)

> Versión 1.1 · 2026-11-17 · Estado: listo para implementación, **salvo la migración `0001_core.sql`, que aún implementa el flujo anterior** (ver `docs/DECISIONS.md`, D-002 y D-004, y la tarea T-M1-00).
> Cambio 1.1: el pedido de venta termina en `finalizado` cuando se confirma el pago; ahí se descuenta el stock. Desaparecen los estados de alistamiento, despacho y entrega.
> Cambio 1.2 (D-009): el offline se recorta a compra, proveedor y gasto. Pedidos, cobros, estados y clientes requieren conexión. Sin Realtime, sin "stock estimado" y sin editar ni importar pendientes.
> Documentos hermanos: `PLAN.md` (cómo), `TASKS.md` (en qué orden). Esquema SQL de referencia: `supabase/migrations/0001_core.sql` (probado, 24 pruebas en `tests/db/core.test.mjs`).
> Convención: **DEBE** = obligatorio, **DEBERÍA** = recomendado, **PUEDE** = opcional. Cada requisito tiene ID (`RF-…`, `RN-…`, `RNF-…`) y **cada prueba debe citar el ID que cubre**.

---

## 1. Contexto y objetivo

Camino Col (caminocol.com) es un emprendimiento de dos socios que da vitrina virtual a campesinos, pequeños comerciantes y pymes del campo colombiano. Los socios **viajan a las zonas de los proveedores**, les compran producto (a veces sin señal), lo traen y lo despachan a clientes (por transportadora o entrega propia en Zarzal). Los pedidos de clientes nacen en la web y se **confirman por WhatsApp**; luego se registran a mano.

**Problema:** no hay un registro ordenado de inventario, ventas, pedidos, compras, proveedores, clientes, historial y analítica.

**Objetivo del MVP:** una PWA móvil (iPhone y Android) con costo de infraestructura ≈ $0 que permita:
1. Registrar y seguir **pedidos de venta** de punta a punta (recibido → confirmado → finalizado).
2. Registrar **compras a proveedores** (incluso **sin conexión**, en campo) y **proveedores nuevos**.
3. Mantener el **inventario** siempre correcto (movimientos), con reserva, lotes y vencimiento.
4. Generar **documentos** (confirmación, remisión/factura interna, comprobante de compra) y enviarlos por WhatsApp.
5. Ver **analítica de dirección**: qué se vende más, resultado de la semana y el mes, costo, precio de venta, ganancia, unidades vendidas y gastos.
6. Estar **preparado** (sin implementarlo) para facturación electrónica DIAN y crédito de proveedores.

**Métrica de éxito (UAT):** la socia registra una compra en finca sin señal, la sube después de manera consciente, y ambos ven stock y dashboard correctos; un pedido recibido por WhatsApp se registra en < 60 s y recorre todos sus estados sin errores de inventario.

## 2. Usuarios y dispositivos

| Actor | Dispositivo | Notas |
|---|---|---|
| Socio/a 1 (desarrollador) | Android | Admin técnico |
| Socia 2 | iPhone | Trabaja en zona rural, a menudo sin señal |

Solo **2 usuarios** (`miembros`), mismos permisos. Registro público **deshabilitado**. UI en **español (es-CO)**, mobile-first (≥ 360 px), uso a una mano, botones ≥ 44 px.

## 3. Alcance

### 3.1 Dentro del MVP
Autenticación · terceros (clientes/proveedores) · catálogo (productos, artículos, unidades, listas y precios) · pedidos de venta · órdenes de compra y recepciones · inventario (movimientos, lotes, ajustes, kardex) · pagos/cobros · gastos · documentos PDF + compartir · dashboard · centro de pendientes (offline) · PWA instalable · backups y keep-alive.

### 3.2 Fuera del MVP (no construir; solo no cerrar la puerta)
Factura electrónica DIAN · automatización/API de WhatsApp · checkout de caminocol.com escribiendo directo a la base · roles/permisos finos · recetas/transformación · UI de crédito a proveedores (el modelo sí existe) · consumo FEFO por lote · devoluciones parciales · multi-bodega · notificaciones push · conciliación bancaria.

## 4. Glosario

- **Pedido de venta (PV):** pedido que un **cliente** nos hace. Tabla `pedidos_venta`.
- **Orden de compra (OC):** pedido que **nosotros** le hacemos a un **proveedor**. Tabla `ordenes_compra`. **Nunca se mezcla con PV** en tablas, estados, documentos ni pantallas.
- **Artículo:** SKU vendible (marca/calidad/presentación). **Producto:** concepto genérico (p. ej. "Café molido") que agrupa artículos de distintos proveedores.
- **Físico / Comprometido / En camino / Disponible para prometer:** ver RN-INV-02.
- **Finalizado:** estado final de un PV: el pago está confirmado y el stock ya se descontó.
- **Operación (op):** unidad atómica de escritura enviada al servidor con `op_id` (idempotente). **Outbox:** cola local de ops no enviadas.
- **Pendiente:** registro guardado solo en el celular, aún no en Supabase.
- **Sincronizar:** acción **manual y consentida** que sube los pendientes.

## 5. Decisiones cerradas y supuestos

| # | Decisión / supuesto | Estado |
|---|---|---|
| D1 | Los socios **no transforman** producto; compran y venden en la misma presentación (250 g, 1 lb, 2 kg…). El modelo soporta otras unidades (arroba, etc.). | Cerrada |
| D2 | Libra = 500 g; arroba = 12,5 kg. | Cerrada |
| D3 | Pago a proveedores **inmediato** (contado). El modelo ya soporta crédito, **sin UI** en MVP. | Cerrada |
| D4 | Hoy **no hay perecederos**, pero el modelo exige **lote y vencimiento** donde el artículo lo configure (p. ej. crema de cacao). | Cerrada |
| D5 | Pedidos sin stock **siempre se aceptan** (la vitrina nunca muestra "agotado"); no se pueden **finalizar** sin stock físico. | Cerrada |
| D6 | Entrega por **transportadora** (≈ $15.000, depende de la cantidad; se define al crear pedido/factura) o **entrega propia** en Zarzal (sin costo). | Cerrada |
| D7 | Precios de venta = los de la web (lista pública). Debe soportar listas por cliente y **precio escalonado por cantidad** + descuentos. | Cerrada |
| D8 | **No** están obligados a facturar electrónicamente hoy; deben dejar el modelo listo. Documento interno enviado por WhatsApp. | Cerrada |
| D9 | Escritura **online-first**: con conexión todo va directo a Supabase. Sin conexión se guarda local y **solo el usuario decide sincronizar**. | Cerrada |
| D10 | Offline **solo para tres cosas**: registrar una **compra** (con su recepción y pago, y proveedor nuevo si hace falta), crear un **proveedor** y registrar un **gasto**. Todo lo demás (pedidos, cobros, cambios de estado, clientes, facturar, anular y editar maestros) requiere conexión. | Cerrada (revisada 2026-11-17, D-009) |
| D14 | **Catálogo y precios** según `docs/negocio/catalogo.md`: crema de cacao $22.000; pastillas de chocolate se venden y se inventarían; la presentación de 5 lb es un artículo con stock propio; grano o molido se anota en las notas del pedido. | Cerrada (2026-11-17) |
| D12 | **WhatsApp es asunto de la web.** El sitio arma el mensaje y la conversación ocurre fuera de la PWA; la PWA no integra, lee ni automatiza WhatsApp. Solo comparte documentos con la hoja de compartir del sistema (RF-DOC-06). | Cerrada (2026-11-17) |
| D13 | Se **vende y se compra de contado y en su totalidad**. No hay crédito a clientes ni a proveedores. | Cerrada (2026-11-17) |
| D11 | Los clientes piden por la web como hoy; el pedido se confirma por WhatsApp y **los socios lo crean en la PWA**. El pedido se **finaliza y descuenta del inventario cuando se confirma el pago**. Mientras espera el pago, el stock queda **reservado** (comprometido). No se registra despacho ni entrega como estados. | Cerrada (2026-11-17) |
| S1 | **Supuesto (default):** el flete puede cobrarse al cliente (`envio_cobrado`) y/o lo paga la empresa (`envio_costo`); ambos se registran por separado. | Por confirmar con socios |
| S2 | **Supuesto (default):** "deducciones" = descuentos a clientes + costo de mercancía + gastos operativos. | Por confirmar |
| S3 | Costo = **promedio ponderado de compra** por artículo. No incluye empaque, mermas, trabajo ni costo fijo: el empaque se registra como gasto. | Cerrada (2026-11-17, D-008) |
| S4 | **Supuesto:** precios sin IVA, tasa 0 %; el impuesto se calcula por línea y se suma (confirmar tratamiento con contador). | Por confirmar |
| S5 | La lectura de datos del otro socio (pull) puede ser **automática**; solo el **envío** es manual. | Por confirmar |

## 6. Modelo de dominio (resumen)

Fuente de verdad: `0001_core.sql`. Entidades: `terceros` (roles cliente/proveedor), `productos`, `articulos`, `unidades`, `listas_precio`, `precios`, `pedidos_venta`(+`_items`), `ordenes_compra`(+`_items`), `recepciones`(+`_items`), `lotes`, `movimientos_inventario` (libro append-only), `pagos`, `gastos`, `documentos` (+`consecutivos`), `eventos_estado`, `sync_ops`, `miembros`. Vistas: `v_stock`, `v_necesidades_compra`, `v_cuentas_por_cobrar`, `v_cuentas_por_pagar`, `v_ventas_pedido`, `v_ventas_diarias`, `v_ventas_por_articulo`; función `resumen_periodo(desde,hasta)`.

**Regla de oro:** el stock **nunca se edita**; es la suma de `movimientos_inventario`.

## 7. Requisitos funcionales

### 7.1 Autenticación y sesión (AUTH)
- **RF-AUTH-01** Login con email + contraseña (Supabase Auth). Registro público deshabilitado; usuarios creados por el administrador.
- **RF-AUTH-02** La sesión persiste. La app **DEBE abrir y operar sin conexión** aunque el token haya expirado; un fallo de red **nunca** cierra la sesión.
- **RF-AUTH-03** Cerrar sesión con pendientes locales **DEBE** advertir cuántos registros se perderían y ofrecer exportarlos (JSON) o cancelar.
- **RF-AUTH-04** Solo usuarios presentes en `miembros` ven datos (RLS). Un usuario autenticado no miembro ve la pantalla "Sin acceso".

### 7.2 Terceros (TER)
- **RF-TER-01** CRUD de terceros con roles `es_cliente`/`es_proveedor` (un tercero puede ser ambos). Campos: nombre, tipo/número de documento, teléfono, email, dirección, municipio, vereda, coordenadas, notas, consentimiento de datos.
- **RF-TER-02** Búsqueda local instantánea por nombre/teléfono/documento (funciona offline).
- **RF-TER-03** Captura de **proveedor/prospecto en campo** (offline): nombre, teléfono, vereda/municipio, ubicación GPS (con captura manual alternativa), productos que ofrece (texto libre), foto opcional, notas.
- **RF-TER-04** Detección de **posibles duplicados** (mismo teléfono normalizado, mismo documento o nombre muy similar) al crear: online se avisa antes de guardar; offline se resuelve en la revisión al sincronizar.
- **RF-TER-05** Cliente nuevo exige marcar **consentimiento de tratamiento de datos** (Ley 1581) con fecha; sin él no se guarda (salvo clientes anónimos de mostrador, no contemplados en MVP).
- **RF-TER-06** Edición y borrado lógico de terceros: solo online.

### 7.3 Catálogo (CAT)
- **RF-CAT-01** CRUD de productos y artículos (presentación, unidad, proveedor habitual, banderas `controla_lote`, `controla_vencimiento`, `permite_sin_stock`, tasa de impuesto). Online.
- **RF-CAT-02** Lista de precios pública (= web) + listas adicionales; precio por artículo y **cantidad mínima** (escalones).
- **RF-CAT-03** Asignar lista de precios a un cliente.
- **RF-CAT-04** El catálogo, precios y unidades se **cachean localmente** para tomar pedidos offline.

### 7.4 Pedidos de venta (VEN)
- **RF-VEN-01** Crear PV con: cliente (buscar o crear), origen (`web`/`whatsapp`/`manual`), referencia de origen (opcional), ítems, descuentos, tipo de entrega (`transportadora`/`propia`/`recoge`), dirección/municipio de entrega, `envio_cobrado`, `envio_costo`, fecha estimada, notas. **Nace siempre en estado `recibido`.**
- **RF-VEN-02** Al agregar un ítem, el precio de lista se calcula con `precio_para(artículo, cliente, cantidad)` (cache local si no hay conexión) y se guarda como **snapshot** `precio_lista`; el usuario puede aplicar `descuento_pct` y se guarda `precio_unitario` pactado.
- **RF-VEN-03** Descuento global (`descuento_valor`) y envío editables; totales calculados por el servidor (`subtotal`, `impuestos`, `total`); la UI muestra una **vista previa idéntica** calculada con la misma fórmula (`domain/pricing`, con pruebas de paridad). El descuento global no puede superar el subtotal ni dejar el total negativo (el servidor rechaza al crear y al finalizar).
- **RF-VEN-04** *(Eliminado, D-006.)* Los pedidos se registran a mano en el formulario; la PWA no lee ni interpreta mensajes de WhatsApp.
- **RF-VEN-05** Cambios de estado según la máquina de §9.1, con motivo obligatorio para `cancelado` y `devuelto`. **Finalizar** exige pago confirmado (RN-VEN-05) y tipo de entrega; si es transportadora, exige `envio_costo`. Transportadora y guía pueden completarse después de finalizar (online). **Validaciones del servidor (T-M1-15, D-015):** el motivo no puede estar vacío; `envio_costo` exigido significa mayor que cero (0 es el valor por defecto y equivale a "sin dato"); al finalizar, el descuento no supera el subtotal y el total no es negativo (RF-VEN-03).
- **RF-VEN-06** Lista de PV filtrable por estado, cliente, fecha, origen; vista **"Por confirmar"** (recibidos) y **"Esperando pago"** (confirmados).
- **RF-VEN-07** Detalle de PV con historial de estados (`eventos_estado`), pagos, documentos y acciones disponibles según estado.
- **RF-VEN-08** Los pedidos de venta **solo se crean con conexión** (D-009); no hay borradores offline. Un pedido nace `recibido` y no reserva ni mueve stock.
- **RF-VEN-09** *(Eliminado, D-006.)* Los mensajes de la web no traen número de pedido, así que no hay referencia que comparar.
- **RF-VEN-10** Mientras el estado sea `recibido`/`confirmado` los ítems son editables (en `confirmado`, ajustando la reserva); después de finalizar, no.

### 7.5 Compras (COM)
- **RF-COM-01** Crear OC con: proveedor (buscar o crear), modalidad (`inmediata` | `encargo` | `apertura`, esta última solo para el inventario inicial, RN-COM-04), ítems (artículo, cantidad, costo unitario; opcional unidad/cantidad de origen), fecha esperada (encargo), notas.
- **RF-COM-02** **Compra inmediata (flujo de campo):** una sola operación que crea la OC en `pedida`, registra la **recepción total** y el **pago**. Debe poder hacerse **offline**.
- **RF-COM-03** **Encargo:** OC `pedida` con fecha esperada; la recepción (parcial o total) se registra después. Offline permitido.
- **RF-COM-04** Recepción: por ítem, cantidad, **lote** y **fecha de vencimiento** (obligatoria si el artículo la exige). Suma stock y recalcula costo promedio.
- **RF-COM-05** Pagos a proveedor: efectivo/Nequi/Daviplata/transferencia; opcional foto de soporte y qué socio puso el dinero. Contado hoy; el modelo soporta saldo y vencimiento.
- **RF-COM-06** **Necesidades de compra:** vista agrupada por proveedor con el faltante de pedidos confirmados; acción **"Crear OC desde necesidades"** que precarga ítems y cantidades.
- **RF-COM-07** Comprobante de compra (PDF) para el proveedor/campesino; compartible por WhatsApp.
- **RF-COM-08** Cancelar OC solo antes de recibir (`borrador`/`pedida`).

### 7.6 Inventario (INV)
- **RF-INV-01** Pantalla de stock por artículo: físico, comprometido, en camino, disponible para prometer, faltante, costo promedio.
- **RF-INV-02** **Kardex** por artículo: movimientos con tipo, cantidad, costo, referencia (PV/OC), usuario, fecha.
- **RF-INV-03** Ajustes y mermas (online): requieren motivo; generan movimientos `ajuste`/`merma`.
- **RF-INV-04** Lotes: lista con fecha de ingreso y vencimiento; alerta de lotes con vencimiento ≤ 60 días (informativa; ver limitación L2).
- **RF-INV-05** Offline: el stock se muestra desde caché con la etiqueta **"datos al dd/mm hh:mm"**. El "estimado" con compras pendientes queda para después del MVP (D-009).

### 7.7 Pagos, cuentas y gastos (PAG)
- **RF-PAG-01** Registrar **cobros** a clientes (parciales permitidos) y ver saldo por pedido. La acción **"Registrar cobro y finalizar"** hace ambas cosas en una sola operación.
- **RF-PAG-02** Vista **esperando pago**: pedidos confirmados con saldo. No hay cuentas por pagar: las compras son de contado (D13).
- **RF-PAG-03** Registrar **gastos** operativos (combustible, empaques, etc.) con categoría y valor; **permitido offline**; opcionalmente vinculados a un PV/OC. El flete de una venta no se registra aquí sino en `envio_costo` del pedido (RN-COS-04).

### 7.8 Documentos (DOC)
- **RF-DOC-01** Tipos: `confirmacion` (sin consecutivo), `remision`, `factura_interna`, `comprobante_compra` (con consecutivo).
- **RF-DOC-02** El documento es una **fila inmutable con snapshot**; el PDF es una **vista regenerable** (no se guarda el archivo).
- **RF-DOC-03** Emitir remisión/factura solo de PV finalizados; comprobante solo de OC con mercancía recibida; uno vigente por pedido/orden.
- **RF-DOC-04** Anular con motivo y reemitir (nuevo consecutivo). Nunca editar ni borrar.
- **RF-DOC-05** El PDF incluye datos del negocio (configurables), cliente/proveedor, líneas, descuentos, envío, total y la leyenda **"Documento interno — no es factura electrónica"** mientras `estado_fiscal` sea nulo.
- **RF-DOC-06** **Compartir** con la Web Share API (archivo adjunto a WhatsApp); alternativa: descargar. La `confirmacion` puede generarse offline.

### 7.9 Dashboard (DSH)
- **RF-DSH-01** Selector de periodo: **hoy, semana y mes** (zona `America/Bogota`), con comparación contra el periodo anterior.
- **RF-DSH-02** Indicadores del periodo, en este orden: **ventas** (precio al que se vendió), **costo** de la mercancía vendida, **ganancia** (ventas − costo, con envíos según RN-COS-03) y **margen %**; **unidades vendidas**, **pedidos** y **ticket promedio**; **gastos** y **utilidad neta**.
- **RF-DSH-03** **Tabla por artículo** del periodo: unidades, ventas, costo, ganancia y margen %, ordenada por unidades (lo más vendido arriba). **Gráfico de unidades vendidas por semana** (últimas 8 semanas) y total del mes frente al mes anterior.
- **RF-DSH-04** Panel de administración: pedidos **por confirmar**, pedidos **esperando pago** (cantidad y valor), **faltantes**, **capital en inventario** (Σ stock × costo promedio), artículos con **stock en cero** y registros **pendientes de subir**.
- **RF-DSH-05** Con conexión se actualiza al abrir y con "Actualizar"; sin conexión muestra la última copia con la etiqueta **"datos al …"**.

### 7.10 Sincronización y pendientes (SYN)
- **RF-SYN-01** Toda escritura pasa por **una sola ruta**: el servidor recibe **operaciones** (`aplicar_ops`) con `op_id`; es idempotente.
- **RF-SYN-02** Con conexión, la operación se envía **de inmediato** (timeout 8 s). Si hay fallo de **red** y la operación admite offline (D10), se guarda en la outbox como pendiente; las demás muestran "Requiere conexión" y no se encolan. Si el servidor la **rechaza** (validación/permiso), se muestra el error y **no** se encola.
- **RF-SYN-03** **Nunca** hay envío automático de pendientes. Se avisa (banner con conteo y antigüedad del más viejo), pero solo se sube al pulsar **"Subir seleccionados"** en la pantalla **Pendientes**.
- **RF-SYN-04** Pantalla **Pendientes:** lista con resumen legible, estado (`pendiente`, `error`, `revisión`), selección múltiple, descartar y subir. No se editan: se descarta y se rehace. Resultado por registro: ✔ subido · ⚠ requiere decisión · ✖ error (queda pendiente).
- **RF-SYN-05** Un `op_id` ya aplicado se trata como éxito (`ya_aplicada`), p. ej. si la respuesta se perdió.
- **RF-SYN-06** **Revisión de duplicados/conflictos** devuelve candidatos; el usuario elige *usar existente* o *crear igual* y se reenvía la misma op con la resolución.
- **RF-SYN-07** Las ops se aplican **en orden de creación**; si una falla o queda en revisión, **la cola se detiene** y las siguientes esperan a que el usuario la resuelva.
- **RF-SYN-08** Lecturas (pull): automático al abrir y al volver a primer plano, y manual con "Actualizar". Es de solo lectura. Sin Realtime en el MVP (D-009).
- **RF-SYN-09** Fotos: se guardan como blobs locales comprimidos (WebP ≤ ~150 KB) y se suben **después** de aplicada la op, vinculándose con una op `adjunto.vincular`. Si la subida falla, el registro sigue siendo válido.
- **RF-SYN-10** Exportar los pendientes a un archivo JSON (respaldo de emergencia). No hay importación en el MVP (D-009).
- **RF-SYN-11** `device_id` estable por instalación; el ordenamiento de eventos lo define el **servidor**, no el reloj del dispositivo.

### 7.11 PWA y operación (OPS)
- **RF-OPS-01** Instalable (manifest, íconos, `display: standalone`) en iOS y Android; pantalla de ayuda "Cómo instalar".
- **RF-OPS-02** Funciona sin conexión (app shell cacheado + datos en IndexedDB). Solicitar almacenamiento persistente (`navigator.storage.persist()`) y mostrar su estado en Ajustes.
- **RF-OPS-03** Actualización de la app **con aviso** ("Nueva versión — Actualizar"); nunca recarga sola en medio de un formulario.
- **RF-OPS-04** Backup nocturno y keep-alive automatizados (ver PLAN §12).

## 8. Reglas de negocio (RN)

**Inventario**
- **RN-INV-01** El stock físico = Σ `movimientos_inventario.cantidad` del artículo. Append-only; correcciones = movimiento de ajuste.
- **RN-INV-02** `comprometido` = Σ cantidades de PV en `confirmado` (reservado, esperando pago). `en_camino` = Σ (pedido − recibido) de OC `pedida`/`recibida_parcial`. `disponible_para_prometer = físico + en_camino − comprometido`. `faltante = max(comprometido − físico − en_camino, 0)`.
- **RN-INV-03** Finalizar un PV es **todo o nada** y **exige stock físico suficiente** por artículo (con bloqueo de fila para evitar doble venta). Sin stock → error claro; el pedido sigue confirmado y aparece como necesidad de compra. El descuento ocurre solo al finalizar, nunca antes.
- **RN-INV-04** Entradas por recepción de OC (`compra`, +). Salidas por finalización de PV (`venta`, −). Devolución de cliente (`devolucion_cliente`, +). Signos validados por constraint.
- **RN-INV-05** Las entradas son conmutativas (seguras offline); las salidas solo ocurren online.

**Costos y márgenes**
- **RN-COS-01** Costo promedio ponderado: al recibir `q` a costo `c` con stock `s ≥ 0` y promedio `m`: `nuevo = (s·m + q·c)/(s+q)`; si `s ≤ 0` el nuevo costo es `c`.
- **RN-COS-02** Al finalizar se fija `costo_unitario` del ítem = costo promedio vigente (snapshot para márgenes).
- **RN-COS-03** Utilidad bruta de un PV = (subtotal − descuento global) + envío cobrado − envío pagado − costo de mercancía. Utilidad neta del periodo = Σ utilidad bruta − gastos.
- **RN-COS-04** (H-08, D-015) **Una sola vía para el flete de una venta:** su costo se registra solo en `envio_costo` del pedido. Un gasto vinculado a un PV no puede ser de categoría flete/envío/transporte/transportadora (se contaría dos veces); el flete de una compra (gasto vinculado a una OC) o un gasto suelto sí se permiten.

**Precios**
- **RN-PRE-01** Precio aplicable: lista del cliente (o pública) y el escalón de mayor `cantidad_minima` ≤ cantidad; si la lista del cliente no tiene precio, se usa la pública.
- **RN-PRE-02** El precio pactado de un ítem **no cambia** si luego cambia la lista; al sincronizar un PV offline se **advierte** si el precio de lista actual difiere del snapshot, pero se respeta lo pactado.

**Pedidos de venta**
- **RN-VEN-01** Un PV acepta ítems sin stock (D5). `confirmado` exige ≥ 1 ítem.
- **RN-VEN-02** `cancelado` solo antes de finalizar (libera la reserva); después, `devuelto` (devolución total) que repone stock al costo de la finalización.
- **RN-VEN-03** `finalizado_en` se fija en el servidor al finalizar; los reportes agrupan por ese día (zona Bogotá).
- **RN-VEN-04** Entrega propia (`propia`/`recoge`): `envio_cobrado` y `envio_costo` normalmente 0.
- **RN-VEN-05** Un PV solo se finaliza con el **pago confirmado**: saldo = 0 (Σ cobros ≥ total). Los socios no venden a crédito (D-005).

**Compras**
- **RN-COM-01** No se recibe más de lo pedido (sobre-recepción prohibida). Recepción parcial cambia la OC a `recibida_parcial`; completa → `recibida`.
- **RN-COM-02** Artículos con `controla_vencimiento` exigen fecha de vencimiento al recibir; el lote se crea o reutiliza por (`articulo`, `código`). Si no se da código se genera.
- **RN-COM-03** Una OC con ítems recibidos no se edita ni cancela.
- **RN-COM-04** El inventario inicial se carga como **compra de apertura** (`modalidad = 'apertura'`, proveedor genérico «Inventario inicial»), no como ajuste: suma stock y fija el costo promedio como cualquier compra. Exige recepción total, **no admite pagos**, no cuenta en `compras_periodo` ni como gasto del periodo y no genera cuenta por pagar. La modalidad de una orden de apertura ya pedida no se cambia. Un ajuste de inventario nunca fija costo (D-014).

**Documentos**
- **RN-DOC-01** Consecutivos por tipo y **sin huecos** (se asignan en la misma transacción). `numero = prefijo-000000` (RM, FI, CP).
- **RN-DOC-02** Un documento emitido es inmutable salvo anulación; la anulación exige motivo (no vacío, también por escritura directa) y no se puede revertir ni cambiar su motivo.

**Pagos**
- **RN-PAG-01** Un pago es de **cobro** (ligado a PV) o de **pago** (ligado a OC), nunca ambos. Saldo = total − Σ pagos.

**Datos personales**
- **RN-DAT-01** Cliente con consentimiento registrado (bandera + fecha). No exportar ni compartir la base de clientes fuera de los socios.

## 9. Máquinas de estado

### 9.1 Pedido de venta
```
recibido ──► confirmado ──► finalizado ──► devuelto
   │            │
   └────────────┴──► cancelado (antes de finalizar)
```
Transiciones válidas (única fuente: `pv_transicion_valida`): `recibido→{confirmado,cancelado}` · `confirmado→{finalizado,cancelado}` · `finalizado→devuelto`.

| Transición | Efecto |
|---|---|
| → `confirmado` | Datos y pedido confirmados por WhatsApp. Reserva (aumenta `comprometido`). Requiere ≥ 1 ítem. **Solo online.** |
| → `finalizado` | Exige pago confirmado (RN-VEN-05) y stock suficiente; movimientos `venta`; fija costos y `finalizado_en`; libera la reserva. **Solo online.** |
| → `devuelto` | Movimientos `devolucion_cliente` al costo de la finalización. Motivo obligatorio. |
| → `cancelado` | Libera `comprometido`. Motivo obligatorio. |

`recibido` nace de la creación del pedido (también offline) y no reserva nada. El **pago** se deriva de `pagos` (pendiente/parcial/pagado) y es lo que habilita `finalizado`. El envío (transportadora, guía, costo) es información del pedido, no un estado.

### 9.2 Orden de compra
```
borrador ──► pedida ──► recibida_parcial ──► recibida
   │           │
   └───────────┴──► cancelada (solo sin recepciones)
```
`recibida_parcial`/`recibida` los fija **el sistema** al registrar recepciones.

## 10. Offline y sincronización (especificación funcional)

### 10.1 Qué se puede hacer sin conexión
| Acción | Offline | Notas |
|---|---|---|
| Consultar catálogo, precios, clientes, proveedores, pedidos y stock | Sí (caché) | Con sello "datos al …" |
| Crear proveedor | Sí | Pendiente; duplicados se revisan al subir |
| Crear cliente | **No** | Requiere conexión |
| Crear PV | **No** | Requiere conexión (D-009) |
| Crear compra inmediata o encargo (con recepción y pago) | Sí | Pendiente; las entradas suman al sincronizar |
| Registrar gasto | Sí | |
| Confirmar/finalizar/cancelar/devolver PV | **No** | Requiere servidor |
| Emitir remisión/factura/comprobante, anular | **No** | Consecutivo lo asigna el servidor |
| Editar maestros, catálogo, precios, ajustes de inventario | **No** | |
| Generar y compartir PDF de `confirmacion` | Sí | Sin consecutivo |
| Dashboard | Último dato guardado | |

### 10.2 Flujo de escritura
```
Guardar → construir op {op_id, device_id, tipo, payload, client_created_at}
   ├─ intentar aplicar_ops (timeout 8 s)
   │     ├─ ok / ya_aplicada → listo; actualizar caché local
   │     ├─ revision → mostrar decisión (online) o dejar pendiente en estado "revisión"
   │     ├─ error de servidor → mostrar error, NO encolar
   │     └─ fallo de red → encolar como "pendiente"
   └─ sin conexión desde el inicio → encolar
Más tarde: banner "Tienes N sin subir (el más viejo: hace X)" → Pendientes → revisar → Subir seleccionados
```

### 10.3 Operaciones del MVP
`tercero.crear` · `pedido_venta.crear` (incluye cliente nuevo opcional + ítems; solo con conexión, nunca se encola) · `orden_compra.registrar` (incluye proveedor nuevo opcional + ítems + recepción opcional + pagos opcionales) · `gasto.registrar` · `adjunto.vincular`. Contratos JSON en `PLAN.md` §4.3.

### 10.4 Conflictos y casos borde
- **Doble envío por respuesta perdida:** idempotencia por `op_id` (RF-SYN-05).
- **Dos socios venden la última unidad:** el conflicto aparece al **confirmar/finalizar** (online); la reserva y el chequeo usan bloqueo de fila; el segundo recibe aviso, nunca sobreventa (RN-INV-03).
- **Precio cambió:** se respeta el pactado, con advertencia (RN-PRE-02).
- **Cliente/proveedor duplicado:** estado `revision` con candidatos (RF-TER-04, RF-SYN-06).
- **Reloj del celular incorrecto:** `fecha` de negocio puede venir del cliente (acotada a ≤ ahora + 1 día); el orden y `created_at` los pone el servidor.
- **Pérdida de almacenamiento local (iOS):** PWA instalada + almacenamiento persistente + exportación de pendientes + sincronizar pronto (RF-OPS-02, RF-SYN-10).

## 11. Requisitos no funcionales

**Seguridad (RNF-SEC)**
- **RNF-SEC-01** RLS activo en todas las tablas; política única "solo miembros". La `anon key` es pública por diseño: **jamás** poner la `service_role` en el cliente ni en el repo.
- **RNF-SEC-02** Pruebas automáticas de RLS: no miembro = 0 filas en tablas y vistas; no puede insertar.
- **RNF-SEC-03** Vistas con `security_invoker = true`; funciones con `search_path` fijo; `REVOKE EXECUTE … FROM anon`.
- **RNF-SEC-04** Storage privado (`soportes`) con política solo miembros; URLs firmadas de corta duración.
- **RNF-SEC-05** Cabeceras de seguridad (CSP restrictiva, `X-Content-Type-Options`, `Referrer-Policy`) en el hosting.
- **RNF-SEC-06** Sin PII en logs ni en reportes de errores (scrub); secretos solo en variables de entorno/secrets de CI.
- **RNF-SEC-07** Pérdida de dispositivo: procedimiento documentado (cerrar sesiones globales desde Supabase, cambiar contraseña).

**Confiabilidad (RNF-REL)**
- **RNF-REL-01** Backup nocturno cifrado + **prueba de restauración documentada y ejecutada** antes de producción.
- **RNF-REL-02** Keep-alive diario para evitar la pausa por inactividad del plan gratuito (verificar política vigente).
- **RNF-REL-03** Migraciones solo hacia adelante, idempotentes en lo posible, aplicadas con la CLI de Supabase.

**Rendimiento y tamaño (RNF-PERF)**
- **RNF-PERF-01** Listas desde IndexedDB: render < 200 ms con 5.000 registros locales (virtualizar listas largas).
- **RNF-PERF-02** Carga inicial JS ≤ ~300 KB gzip; PDF y gráficos con carga diferida.
- **RNF-PERF-03** Cabe en los límites del plan gratuito (500 MB BD, 1 GB storage, 5 GB egress): imágenes comprimidas, el catálogo público **no** se sirve desde Supabase Storage, sync por deltas.

**UX y localización (RNF-UX)**
- **RNF-UX-01** Español es-CO; moneda COP sin decimales (`Intl.NumberFormat('es-CO')`); cantidades con hasta 3 decimales; zona horaria `America/Bogota`.
- **RNF-UX-02** Indicadores siempre visibles: estado de conexión, N pendientes, "datos al …".
- **RNF-UX-03** Confirmación explícita en acciones irreversibles (finalizar, anular, devolver, descartar pendiente).
- **RNF-UX-04** Accesibilidad básica: contraste AA, etiquetas en inputs, foco visible, tamaños táctiles ≥ 44 px.
- **RNF-UX-05** Registrar un pedido típico (3 ítems, cliente existente) en ≤ 6 toques principales.

## 12. Escenarios de aceptación (Given / When / Then)

**E1 — Compra en finca sin señal (RF-COM-02, RF-SYN-02/03/04)**
Dado que no hay conexión y existe el artículo "Café Sierra 500 g", cuando la socia registra una compra inmediata de 10 und a $10.000 a un proveedor nuevo con foto, entonces queda como pendiente con la etiqueta ⏳, el stock mostrado conserva su etiqueta "datos al …" y **no se envía nada** al servidor. Cuando recupera señal, ve el banner "1 sin subir"; al abrir Pendientes y pulsar "Subir seleccionados", se crean proveedor, OC `recibida`, recepción, movimiento +10 y pago; el stock físico real sube 10 y el costo promedio se recalcula; la foto se vincula después.

**E2 — Idempotencia (RF-SYN-05)**
Dado un envío cuya respuesta se perdió, cuando se reenvía la misma op, entonces el servidor responde `ya_aplicada` y no se duplica ningún registro.

**E3 — Pedido tomado por WhatsApp (RF-VEN-01, RNF-UX-05)**
Dado un cliente que pidió por la web y confirmó por WhatsApp, cuando un socio crea el pedido en la PWA con cliente existente y 3 ítems a precio de lista, entonces se crea un PV `recibido` con totales calculados por el servidor, en ≤ 6 toques principales y en menos de 60 s.

**E4 — Reserva y finalización por pago (RN-INV-02/03, RN-VEN-05, RN-COS-02)**
Dado stock físico 20 (costo promedio 11.000) y un PV de 5 und, cuando se confirma, entonces `comprometido`=5, `disponible`=15 y el físico sigue en 20. Cuando se intenta finalizar sin cobro, falla por pago pendiente. Cuando se registra el cobro por el total y se finaliza con transportadora y `envio_costo`=15.000, entonces físico=15, `comprometido`=0, el ítem queda con costo 11.000 y se registra `finalizado_en`.

**E5 — Pedido sin stock (D5, RN-INV-03)**
Dado stock físico 0, cuando llega un PV de 8 und, entonces se acepta y se confirma; aparece un faltante de 8 en necesidades de compra; el intento de finalizarlo (aun con el pago registrado) falla con "Stock insuficiente".

**E6 — Doble venta (RN-INV-03)**
Dadas dos finalizaciones simultáneas que compiten por la última unidad, entonces uno tiene éxito y el otro falla con "Stock insuficiente"; el stock nunca queda negativo.

**E7 — Encargo a proveedor desde necesidades (RF-COM-06)**
Dado un faltante de 8 und del proveedor X, cuando se pulsa "Crear OC desde necesidades", entonces se precarga una OC `borrador` con 8 und; al marcarla `pedida`, `en_camino`=8 y el faltante baja a 0.

**E8 — Recepción parcial (RN-COM-01)**
Dada una OC de 20 und, cuando se recibe 8, entonces la OC es `recibida_parcial` y `en_camino`=12; cuando se intenta recibir 13, entonces falla por sobre-recepción.

**E9 — Documentos (RN-DOC-01/02)**
Dado un PV finalizado, cuando se emite remisión, entonces recibe `RM-000001`; emitirla otra vez falla; anularla con motivo y reemitir da `RM-000002` sin huecos; intentar modificar el documento falla.

**E10 — Descuento y margen (RF-VEN-02, RN-COS-03)**
Dado un PV de 2 und con lista $20.000 y 10 % de descuento, envío cobrado y pagado $15.000, y costo $11.000, entonces ventas netas = 36.000, descuentos = 4.000 y utilidad bruta = 14.000; con un gasto de 5.000 la utilidad neta del día = 9.000.

**E11 — Devolución (RN-VEN-02)**
Dado un PV finalizado, cuando se marca `devuelto` con motivo, entonces el stock se repone y el pedido deja de contar en ventas.

**E12 — Seguridad (RNF-SEC-02)**
Dado un usuario autenticado que no es miembro, entonces ve 0 filas en todas las tablas y vistas y no puede insertar.

**E13 — Cierre de sesión con pendientes (RF-AUTH-03)**
Dados 3 pendientes locales, cuando se intenta cerrar sesión, entonces se advierte y se ofrece exportar o cancelar.

**E14 — Duplicado de proveedor (RF-TER-04, RF-SYN-06)**
Dado un proveedor capturado offline con un teléfono que ya existe, cuando se sincroniza, entonces la op queda en `revision` con el candidato; si el usuario elige "usar existente", la compra se asocia al proveedor existente sin crear otro.

**E15 — Dashboard offline (RF-DSH-05)**
Dada la app sin conexión, entonces el dashboard muestra la última copia con "datos al hh:mm" y no falla.

## 13. Limitaciones conocidas del MVP (aceptadas)

- **L1** Sin Background Sync en iOS: la subida es con la app abierta (coherente con D9).
- **L2** El consumo por lote (FEFO) no está implementado: las ventas no descuentan de un lote específico; las alertas de vencimiento son **informativas** sobre lotes ingresados.
- **L3** Devoluciones solo totales.
- **L4** Un PV se finaliza completo o no se finaliza.
- **L8** No se rastrea la entrega: `finalizado` significa pago confirmado y stock descontado, no que el cliente ya recibió el producto.
- **L5** Impuestos simplificados (tasa por artículo, sobre el neto).
- **L6** Sin roles diferenciados; ambos socios pueden todo.
- **L7** El plan gratuito de Supabase no ofrece SLA ni backups gestionados (se mitiga con RNF-REL-01).

## 14. Trazabilidad

Cada prueba (DB, unitaria, componente, e2e) incluye en su nombre el ID de requisito o escenario que cubre (`[RN-INV-03]`, `[E5]`). `TASKS.md` lista, por tarea, los IDs que cierra. Un requisito sin prueba **no está terminado**.
