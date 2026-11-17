-- =====================================================================
-- Camino Col — migración 0001: esquema núcleo
-- =====================================================================
-- Principios
--  * Postgres es la autoridad de las reglas de negocio (el cliente solo propone).
--  * Inventario = suma de movimientos (libro append-only). El stock nunca se edita.
--  * PEDIDO DE VENTA (cliente -> nosotros) y ORDEN DE COMPRA (nosotros -> proveedor)
--    son agregados separados: distinto ciclo de vida, documento y signo en el stock.
--    Comparten terceros, artículos y el libro de movimientos.
--  * IDs generados en el cliente (offline) con default en el servidor.
--  * Borrado lógico (deleted_at). updated_at lo pone el servidor.
--  * Moneda COP. Los precios son netos; el impuesto se suma encima (hoy 0 %).
--  * Libra colombiana = 500 g. Arroba = 25 libras = 12,5 kg.
-- =====================================================================

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- Acceso: solo los miembros (los 2 socios) pueden leer/escribir
-- ---------------------------------------------------------------------
create table miembros (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nombre    text not null,
  creado_en timestamptz not null default now()
);

create or replace function es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Unidades de medida (preparadas para arrobas, bultos, etc.)
-- ---------------------------------------------------------------------
create table unidades (
  codigo      text primary key,
  nombre      text not null,
  dimension   text not null check (dimension in ('masa','volumen','conteo')),
  factor_base numeric(18,6) not null check (factor_base > 0)  -- a g, ml o und
);
insert into unidades (codigo, nombre, dimension, factor_base) values
  ('g',      'gramo',              'masa',    1),
  ('kg',     'kilogramo',          'masa',    1000),
  ('lb',     'libra (500 g)',      'masa',    500),
  ('arroba', 'arroba (12,5 kg)',   'masa',    12500),
  ('ml',     'mililitro',          'volumen', 1),
  ('l',      'litro',              'volumen', 1000),
  ('und',    'unidad',             'conteo',  1),
  ('docena', 'docena',             'conteo',  12);

-- ---------------------------------------------------------------------
-- Listas de precio (público, mayorista, comercio estratégico...)
-- ---------------------------------------------------------------------
create table listas_precio (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  descripcion text,
  es_publica  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index listas_precio_una_publica on listas_precio ((true)) where es_publica;
insert into listas_precio (nombre, descripcion, es_publica)
  values ('Público', 'Precios de caminocol.com', true);

-- ---------------------------------------------------------------------
-- Terceros: clientes y proveedores en una sola tabla con roles
-- ---------------------------------------------------------------------
create table terceros (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  tipo_documento       text check (tipo_documento in ('CC','NIT','CE','PP','TI')),
  numero_documento     text,
  telefono             text,
  email                text,
  direccion            text,
  municipio            text,
  vereda               text,
  latitud              numeric(9,6),
  longitud             numeric(9,6),
  es_cliente           boolean not null default false,
  es_proveedor         boolean not null default false,
  lista_precio_id      uuid references listas_precio(id),
  consentimiento_datos boolean not null default false,   -- Ley 1581
  consentimiento_en    timestamptz,
  notas                text,
  device_id            text,
  client_created_at    timestamptz,
  op_id                uuid unique,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  check (es_cliente or es_proveedor)
);
create unique index terceros_documento_uq
  on terceros (tipo_documento, numero_documento)
  where numero_documento is not null and deleted_at is null;
create index terceros_telefono_idx on terceros (telefono);

-- ---------------------------------------------------------------------
-- Catálogo: producto genérico (Café) -> artículos (SKU: marca/calidad/presentación)
-- ---------------------------------------------------------------------
create table productos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  categoria  text,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table articulos (
  id                    uuid primary key default gen_random_uuid(),
  producto_id           uuid not null references productos(id),
  proveedor_id          uuid references terceros(id),          -- proveedor habitual
  codigo                text unique,
  nombre                text not null,                          -- "Café Sierra 500 g"
  marca                 text,
  variante              text,                                   -- calidad, sabor...
  presentacion_cantidad numeric(12,3) not null check (presentacion_cantidad > 0),
  presentacion_unidad   text not null references unidades(codigo),
  unidad_inventario     text not null default 'und' references unidades(codigo),
  controla_lote         boolean not null default false,
  controla_vencimiento  boolean not null default false,
  permite_sin_stock     boolean not null default true,          -- se acepta el pedido sin stock (por encargo)
  costo_promedio        numeric(14,4) not null default 0,       -- costo promedio ponderado
  tasa_impuesto         numeric(5,2) not null default 0,
  activo                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index articulos_producto_idx on articulos (producto_id);

create table precios (
  id              uuid primary key default gen_random_uuid(),
  lista_id        uuid not null references listas_precio(id),
  articulo_id     uuid not null references articulos(id),
  precio          numeric(14,2) not null check (precio >= 0),
  cantidad_minima numeric(12,3) not null default 1 check (cantidad_minima > 0),  -- precio escalonado
  vigente_desde   date not null default current_date,
  unique (lista_id, articulo_id, cantidad_minima)
);

alter table terceros
  add constraint terceros_lista_fk foreign key (lista_precio_id) references listas_precio(id);

-- Precio aplicable: lista del cliente (o la pública) y escalón por cantidad
create or replace function precio_para(p_articulo uuid, p_cliente uuid, p_cantidad numeric)
returns numeric language plpgsql stable as $$
declare v_publica uuid; v_lista uuid; v_precio numeric;
begin
  select id into v_publica from listas_precio where es_publica;
  select coalesce(lista_precio_id, v_publica) into v_lista from terceros where id = p_cliente;
  v_lista := coalesce(v_lista, v_publica);

  select precio into v_precio from precios
   where lista_id = v_lista and articulo_id = p_articulo and cantidad_minima <= p_cantidad
   order by cantidad_minima desc limit 1;
  if v_precio is null and v_lista <> v_publica then
    select precio into v_precio from precios
     where lista_id = v_publica and articulo_id = p_articulo and cantidad_minima <= p_cantidad
     order by cantidad_minima desc limit 1;
  end if;
  return v_precio;
end $$;

-- ---------------------------------------------------------------------
-- Auditoría de estados y sincronización
-- ---------------------------------------------------------------------
create table eventos_estado (
  id              bigint generated always as identity primary key,
  entidad         text not null check (entidad in ('pedido_venta','orden_compra')),
  entidad_id      uuid not null,
  estado_anterior text,
  estado_nuevo    text not null,
  motivo          text,
  creado_por      uuid default auth.uid(),
  creado_en       timestamptz not null default now()
);
create index eventos_estado_entidad_idx on eventos_estado (entidad, entidad_id);

create table sync_ops (          -- idempotencia de operaciones enviadas desde los celulares
  op_id       uuid primary key,
  device_id   text,
  tipo        text not null,
  aplicado_en timestamptz not null default now(),
  resultado   jsonb
);

-- ---------------------------------------------------------------------
-- PEDIDOS DE VENTA (cliente -> nosotros)
-- ---------------------------------------------------------------------
create table pedidos_venta (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null references terceros(id),
  origen                 text not null default 'manual' check (origen in ('web','whatsapp','manual')),
  referencia_origen      text,                                   -- p. ej. CC-20261117-03
  estado                 text not null default 'recibido' check (estado in
                           ('recibido','confirmado','finalizado','cancelado','devuelto')),
  motivo_estado          text,                                   -- el cliente lo llena al cambiar estado
  fecha                  timestamptz not null default now(),
  finalizado_en          timestamptz,                            -- se fija al confirmar el pago (SPEC §9.1)
  fecha_entrega_estimada date,
  entrega_tipo           text not null default 'transportadora' check (entrega_tipo in ('transportadora','propia','recoge')),
  transportadora         text,
  guia                   text,
  direccion_entrega      text,
  municipio_entrega      text,
  envio_cobrado          numeric(14,2) not null default 0 check (envio_cobrado >= 0),  -- lo que paga el cliente
  envio_costo            numeric(14,2) not null default 0 check (envio_costo   >= 0),  -- lo que pagamos a la transportadora
  descuento_valor        numeric(14,2) not null default 0 check (descuento_valor >= 0),
  subtotal               numeric(14,2) not null default 0,
  impuestos              numeric(14,2) not null default 0,
  total                  numeric(14,2) not null default 0,
  notas                  text,
  stock_visto_en         timestamptz,                            -- offline: fecha del stock que vio quien tomó el pedido
  device_id              text,
  client_created_at      timestamptz,
  op_id                  uuid unique,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index pedidos_venta_estado_idx on pedidos_venta (estado);
create index pedidos_venta_cliente_idx on pedidos_venta (cliente_id);

create table pedidos_venta_items (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references pedidos_venta(id) on delete cascade,
  articulo_id     uuid not null references articulos(id),
  cantidad        numeric(12,3) not null check (cantidad > 0),
  precio_lista    numeric(14,2) not null check (precio_lista >= 0),   -- snapshot del precio de lista
  descuento_pct   numeric(5,2)  not null default 0 check (descuento_pct between 0 and 100),
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0), -- precio pactado, ya con descuento
  tasa_impuesto   numeric(5,2)  not null default 0,
  costo_unitario  numeric(14,4)                                        -- se fija al finalizar
);
create index pedidos_venta_items_pedido_idx on pedidos_venta_items (pedido_id);

-- ---------------------------------------------------------------------
-- ÓRDENES DE COMPRA (nosotros -> proveedor)
-- ---------------------------------------------------------------------
create table ordenes_compra (
  id                  uuid primary key default gen_random_uuid(),
  proveedor_id        uuid not null references terceros(id),
  modalidad           text not null default 'inmediata' check (modalidad in ('inmediata','encargo')),
  estado              text not null default 'borrador' check (estado in
                        ('borrador','pedida','recibida_parcial','recibida','cancelada')),
  motivo_estado       text,
  fecha               timestamptz not null default now(),
  fecha_esperada      date,
  condicion_pago      text not null default 'contado' check (condicion_pago in ('contado','credito')),
  dias_credito        int check (dias_credito is null or dias_credito >= 0),
  fecha_vencimiento_pago date,
  subtotal            numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  notas               text,
  device_id           text,
  client_created_at   timestamptz,
  op_id               uuid unique,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index ordenes_compra_estado_idx on ordenes_compra (estado);

create table ordenes_compra_items (
  id                uuid primary key default gen_random_uuid(),
  orden_id          uuid not null references ordenes_compra(id) on delete cascade,
  articulo_id       uuid not null references articulos(id),
  cantidad          numeric(12,3) not null check (cantidad > 0),   -- en unidad de inventario
  costo_unitario    numeric(14,4) not null check (costo_unitario >= 0),
  cantidad_recibida numeric(12,3) not null default 0 check (cantidad_recibida >= 0),
  unidad_origen     text references unidades(codigo),               -- auditoría: cómo lo cotizó el proveedor
  cantidad_origen   numeric(12,3)
);
create index ordenes_compra_items_orden_idx on ordenes_compra_items (orden_id);

create table recepciones (
  id                uuid primary key default gen_random_uuid(),
  orden_id          uuid not null references ordenes_compra(id),
  fecha             timestamptz not null default now(),
  notas             text,
  device_id         text,
  client_created_at timestamptz,
  op_id             uuid unique,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);

create table recepcion_items (
  id                uuid primary key default gen_random_uuid(),
  recepcion_id      uuid not null references recepciones(id) on delete cascade,
  orden_item_id     uuid not null references ordenes_compra_items(id),
  cantidad          numeric(12,3) not null check (cantidad > 0),
  lote_codigo       text,
  fecha_vencimiento date
);

-- ---------------------------------------------------------------------
-- Lotes y libro de movimientos de inventario
-- ---------------------------------------------------------------------
create table lotes (
  id                uuid primary key default gen_random_uuid(),
  articulo_id       uuid not null references articulos(id),
  codigo            text not null,
  fecha_ingreso     date not null default current_date,
  fecha_vencimiento date,
  orden_item_id     uuid references ordenes_compra_items(id),
  costo_unitario    numeric(14,4),
  unique (articulo_id, codigo)
);

create table movimientos_inventario (
  id                   bigint generated always as identity primary key,
  articulo_id          uuid not null references articulos(id),
  lote_id              uuid references lotes(id),
  tipo                 text not null check (tipo in
                         ('compra','venta','devolucion_cliente','devolucion_proveedor','merma','ajuste')),
  cantidad             numeric(14,3) not null check (cantidad <> 0),
  costo_unitario       numeric(14,4),
  pedido_venta_item_id uuid references pedidos_venta_items(id),
  orden_compra_item_id uuid references ordenes_compra_items(id),
  motivo               text,
  creado_por           uuid default auth.uid(),
  creado_en            timestamptz not null default now(),
  check (
    (tipo in ('compra','devolucion_cliente') and cantidad > 0) or
    (tipo in ('venta','devolucion_proveedor','merma') and cantidad < 0) or
    tipo = 'ajuste'
  )
);
create index movimientos_articulo_idx on movimientos_inventario (articulo_id);

create or replace function trg_mov_append_only() returns trigger language plpgsql as $$
begin raise exception 'El libro de movimientos es append-only: use un movimiento de ajuste'; end $$;
create trigger movimientos_no_update before update or delete on movimientos_inventario
  for each row execute function trg_mov_append_only();

-- Costo promedio ponderado en cada compra
create or replace function trg_mov_costo() returns trigger language plpgsql as $$
declare v_stock numeric; v_avg numeric;
begin
  if new.tipo = 'compra' then
    if new.costo_unitario is null then raise exception 'La compra requiere costo_unitario'; end if;
    select costo_promedio into v_avg from articulos where id = new.articulo_id for update;
    select coalesce(sum(cantidad),0) into v_stock from movimientos_inventario where articulo_id = new.articulo_id;
    update articulos set costo_promedio = case
        when greatest(v_stock,0) + new.cantidad <= 0 then new.costo_unitario
        else (greatest(v_stock,0) * v_avg + new.cantidad * new.costo_unitario) / (greatest(v_stock,0) + new.cantidad)
      end
     where id = new.articulo_id;
  end if;
  return new;
end $$;
create trigger movimientos_costo before insert on movimientos_inventario
  for each row execute function trg_mov_costo();

-- ---------------------------------------------------------------------
-- Pagos (cobros a clientes y pagos a proveedores; base para crédito futuro)
-- ---------------------------------------------------------------------
create table pagos (
  id                uuid primary key default gen_random_uuid(),
  direccion         text not null check (direccion in ('cobro','pago')),
  pedido_venta_id   uuid references pedidos_venta(id),
  orden_compra_id   uuid references ordenes_compra(id),
  medio             text not null check (medio in ('efectivo','nequi','daviplata','transferencia','tarjeta','otro')),
  valor             numeric(14,2) not null check (valor > 0),
  fecha             timestamptz not null default now(),
  referencia        text,
  soporte_path      text,                                        -- foto del comprobante en Storage
  pagado_por        uuid references miembros(user_id),           -- qué socio puso el dinero
  device_id         text,
  client_created_at timestamptz,
  op_id             uuid unique,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  check (
    (direccion = 'cobro' and pedido_venta_id is not null and orden_compra_id is null) or
    (direccion = 'pago'  and orden_compra_id is not null and pedido_venta_id is null)
  )
);

create table gastos (                                             -- gastos operativos (combustible, empaques...)
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default current_date,
  categoria       text not null,
  concepto        text,
  valor           numeric(14,2) not null check (valor > 0),
  orden_compra_id uuid references ordenes_compra(id),
  pedido_venta_id uuid references pedidos_venta(id),
  pagado_por      uuid references miembros(user_id),
  device_id       text,
  op_id           uuid unique,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- =====================================================================
-- REGLAS: pedidos de venta
-- =====================================================================
create or replace function pv_transicion_valida(a text, b text) returns boolean
language sql immutable as $$
  select (a, b) in (
    ('recibido','confirmado'),  ('recibido','cancelado'),
    ('confirmado','finalizado'), ('confirmado','cancelado'),
    ('finalizado','devuelto')
  );
$$;

create or replace function trg_pv_totales() returns trigger language plpgsql as $$
begin
  new.total := new.subtotal - new.descuento_valor + new.impuestos + new.envio_cobrado;
  return new;
end $$;
create trigger pv_totales before insert or update on pedidos_venta
  for each row execute function trg_pv_totales();

create or replace function pv_recalcular(p_id uuid) returns void language plpgsql as $$
begin
  update pedidos_venta p set
    subtotal  = coalesce((select sum(round(i.cantidad * i.precio_unitario, 2))
                            from pedidos_venta_items i where i.pedido_id = p.id), 0),
    impuestos = coalesce((select sum(round(i.cantidad * i.precio_unitario * i.tasa_impuesto / 100, 2))
                            from pedidos_venta_items i where i.pedido_id = p.id), 0)
   where p.id = p_id;
end $$;

-- Los ítems solo se editan mientras el pedido está recibido/confirmado
create or replace function trg_pvi_guard() returns trigger language plpgsql as $$
declare v_estado text; v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  if tg_op = 'UPDATE' and
     (new.pedido_id, new.articulo_id, new.cantidad, new.precio_lista, new.descuento_pct, new.precio_unitario, new.tasa_impuesto)
     is not distinct from
     (old.pedido_id, old.articulo_id, old.cantidad, old.precio_lista, old.descuento_pct, old.precio_unitario, old.tasa_impuesto)
  then return new;   -- solo cambió costo_unitario (lo fija la finalización)
  end if;
  select estado into v_estado from pedidos_venta where id = v_pedido;
  if v_estado not in ('recibido','confirmado') then
    raise exception 'No se pueden editar ítems de un pedido en estado %', v_estado;
  end if;
  return coalesce(new, old);
end $$;
create trigger pvi_guard before insert or update or delete on pedidos_venta_items
  for each row execute function trg_pvi_guard();

create or replace function trg_pvi_recalc() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and
     (new.pedido_id, new.articulo_id, new.cantidad, new.precio_unitario, new.tasa_impuesto)
     is not distinct from
     (old.pedido_id, old.articulo_id, old.cantidad, old.precio_unitario, old.tasa_impuesto)
  then return null; end if;
  perform pv_recalcular(coalesce(new.pedido_id, old.pedido_id));
  return null;
end $$;
create trigger pvi_recalc after insert or update or delete on pedidos_venta_items
  for each row execute function trg_pvi_recalc();

-- Cambios de estado: valida, mueve inventario y deja evento
create or replace function trg_pv_estado() returns trigger language plpgsql as $$
declare r record; v_stock numeric; n int; v_total numeric; v_pagado numeric;
begin
  if new.estado = old.estado then return new; end if;
  if not pv_transicion_valida(old.estado, new.estado) then
    raise exception 'Transición no permitida: % -> %', old.estado, new.estado;
  end if;

  select count(*) into n from pedidos_venta_items where pedido_id = new.id;
  if new.estado = 'confirmado' and n = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;

  if new.estado = 'finalizado' then
    -- Pago completo (RN-VEN-05). El total se calcula con los valores nuevos porque
    -- el trigger de totales corre después de este.
    v_total := new.subtotal - new.descuento_valor + new.impuestos + new.envio_cobrado;
    select coalesce(sum(valor), 0) into v_pagado from pagos
     where pedido_venta_id = new.id and direccion = 'cobro';
    if v_pagado < v_total then
      raise exception 'El pedido no está pagado por completo: pagado %, total %', v_pagado, v_total;
    end if;
    -- Bloqueo por artículo (orden estable) y verificación de stock físico
    for r in select articulo_id, sum(cantidad) as q from pedidos_venta_items
              where pedido_id = new.id group by articulo_id order by articulo_id loop
      perform 1 from articulos where id = r.articulo_id for update;
      select coalesce(sum(cantidad),0) into v_stock from movimientos_inventario where articulo_id = r.articulo_id;
      if v_stock < r.q then
        raise exception 'Stock insuficiente para finalizar (articulo %): hay %, se requieren %',
          r.articulo_id, v_stock, r.q;
      end if;
    end loop;
    update pedidos_venta_items i set costo_unitario = a.costo_promedio
      from articulos a where i.pedido_id = new.id and a.id = i.articulo_id;
    insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario, pedido_venta_item_id)
      select i.articulo_id, 'venta', -i.cantidad, i.costo_unitario, i.id
        from pedidos_venta_items i where i.pedido_id = new.id;
    new.finalizado_en := now();

  elsif new.estado = 'devuelto' then
    insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario, pedido_venta_item_id, motivo)
      select i.articulo_id, 'devolucion_cliente', i.cantidad, i.costo_unitario, i.id, new.motivo_estado
        from pedidos_venta_items i where i.pedido_id = new.id;
  end if;

  insert into eventos_estado (entidad, entidad_id, estado_anterior, estado_nuevo, motivo)
    values ('pedido_venta', new.id, old.estado, new.estado, new.motivo_estado);
  new.motivo_estado := null;
  return new;
end $$;
create trigger pv_estado before update of estado on pedidos_venta
  for each row execute function trg_pv_estado();

-- =====================================================================
-- REGLAS: órdenes de compra
-- =====================================================================
create or replace function oc_transicion_valida(a text, b text) returns boolean
language sql immutable as $$
  select (a, b) in (
    ('borrador','pedida'), ('borrador','cancelada'), ('pedida','cancelada'),
    ('pedida','recibida_parcial'), ('pedida','recibida'), ('recibida_parcial','recibida')
  );
$$;

create or replace function oc_recalcular(p_id uuid) returns void language plpgsql as $$
begin
  update ordenes_compra o set
    subtotal = coalesce((select sum(round(i.cantidad * i.costo_unitario, 2))
                           from ordenes_compra_items i where i.orden_id = o.id), 0),
    total    = coalesce((select sum(round(i.cantidad * i.costo_unitario, 2))
                           from ordenes_compra_items i where i.orden_id = o.id), 0)
   where o.id = p_id;
end $$;

create or replace function trg_oci_guard() returns trigger language plpgsql as $$
declare v_estado text; v_orden uuid := coalesce(new.orden_id, old.orden_id);
begin
  if tg_op = 'UPDATE' and
     (new.orden_id, new.articulo_id, new.cantidad, new.costo_unitario)
     is not distinct from (old.orden_id, old.articulo_id, old.cantidad, old.costo_unitario)
  then return new;   -- solo cambió cantidad_recibida (lo fija la recepción)
  end if;
  select estado into v_estado from ordenes_compra where id = v_orden;
  if v_estado not in ('borrador','pedida') then
    raise exception 'No se pueden editar ítems de una orden en estado %', v_estado;
  end if;
  return coalesce(new, old);
end $$;
create trigger oci_guard before insert or update or delete on ordenes_compra_items
  for each row execute function trg_oci_guard();

create or replace function trg_oci_recalc() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and
     (new.orden_id, new.cantidad, new.costo_unitario) is not distinct from (old.orden_id, old.cantidad, old.costo_unitario)
  then return null; end if;
  perform oc_recalcular(coalesce(new.orden_id, old.orden_id));
  return null;
end $$;
create trigger oci_recalc after insert or update or delete on ordenes_compra_items
  for each row execute function trg_oci_recalc();

create or replace function trg_oc_estado() returns trigger language plpgsql as $$
begin
  if new.estado = old.estado then return new; end if;
  if not oc_transicion_valida(old.estado, new.estado) then
    raise exception 'Transición no permitida en la orden de compra: % -> %', old.estado, new.estado;
  end if;
  if new.estado = 'pedida' and not exists (select 1 from ordenes_compra_items where orden_id = new.id) then
    raise exception 'La orden no tiene ítems';
  end if;
  if new.condicion_pago = 'credito' and new.fecha_vencimiento_pago is null and new.dias_credito is not null then
    new.fecha_vencimiento_pago := (new.fecha::date) + new.dias_credito;
  end if;
  insert into eventos_estado (entidad, entidad_id, estado_anterior, estado_nuevo, motivo)
    values ('orden_compra', new.id, old.estado, new.estado, new.motivo_estado);
  new.motivo_estado := null;
  return new;
end $$;
create trigger oc_estado before update of estado on ordenes_compra
  for each row execute function trg_oc_estado();

-- Recepción de mercancía: crea lote (si aplica), suma stock y actualiza estado
create or replace function trg_recepcion_item() returns trigger language plpgsql as $$
declare it ordenes_compra_items; oc ordenes_compra; a articulos;
        v_lote uuid; v_codigo text; v_pendiente int;
begin
  select * into it from ordenes_compra_items where id = new.orden_item_id for update;
  select * into oc from ordenes_compra where id = it.orden_id for update;
  if oc.estado not in ('pedida','recibida_parcial') then
    raise exception 'No se puede recibir una orden en estado %', oc.estado;
  end if;
  if (select orden_id from recepciones where id = new.recepcion_id) <> it.orden_id then
    raise exception 'El ítem no pertenece a la orden de la recepción';
  end if;
  if it.cantidad_recibida + new.cantidad > it.cantidad then
    raise exception 'Sobre-recepción: pedido %, ya recibido %, nuevo %', it.cantidad, it.cantidad_recibida, new.cantidad;
  end if;

  select * into a from articulos where id = it.articulo_id;
  if a.controla_vencimiento and new.fecha_vencimiento is null then
    raise exception 'El artículo % exige fecha de vencimiento', a.nombre;
  end if;

  if a.controla_lote or a.controla_vencimiento or new.lote_codigo is not null or new.fecha_vencimiento is not null then
    v_codigo := coalesce(new.lote_codigo, 'L' || to_char(now(), 'YYMMDD') || '-' || substr(new.id::text, 1, 4));
    select id into v_lote from lotes where articulo_id = a.id and codigo = v_codigo;
    if v_lote is null then
      insert into lotes (articulo_id, codigo, fecha_vencimiento, orden_item_id, costo_unitario)
        values (a.id, v_codigo, new.fecha_vencimiento, it.id, it.costo_unitario)
        returning id into v_lote;
    end if;
  end if;

  insert into movimientos_inventario (articulo_id, lote_id, tipo, cantidad, costo_unitario, orden_compra_item_id)
    values (a.id, v_lote, 'compra', new.cantidad, it.costo_unitario, it.id);

  update ordenes_compra_items set cantidad_recibida = cantidad_recibida + new.cantidad where id = it.id;

  select count(*) into v_pendiente from ordenes_compra_items where orden_id = oc.id and cantidad_recibida < cantidad;
  update ordenes_compra set estado = case when v_pendiente = 0 then 'recibida' else 'recibida_parcial' end
   where id = oc.id and estado <> case when v_pendiente = 0 then 'recibida' else 'recibida_parcial' end;
  return new;
end $$;
create trigger recepcion_item_aplica after insert on recepcion_items
  for each row execute function trg_recepcion_item();

-- =====================================================================
-- DOCUMENTOS (remisión / factura interna / comprobante de compra) — inmutables
-- =====================================================================
create table consecutivos (
  tipo    text primary key,
  prefijo text not null,
  ultimo  bigint not null default 0
);
insert into consecutivos (tipo, prefijo) values
  ('remision','RM'), ('factura_interna','FI'), ('comprobante_compra','CP');

create table documentos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('confirmacion','remision','factura_interna','comprobante_compra')),
  prefijo         text,
  consecutivo     bigint,
  numero          text generated always as (
                    case when consecutivo is null then null
                         else prefijo || '-' || lpad(consecutivo::text, 6, '0') end) stored,
  pedido_venta_id uuid references pedidos_venta(id),
  orden_compra_id uuid references ordenes_compra(id),
  tercero         jsonb not null,           -- snapshot del cliente/proveedor
  lineas          jsonb not null,           -- snapshot de las líneas
  totales         jsonb not null,
  emitido_en      timestamptz not null default now(),
  emitido_por     uuid default auth.uid(),
  anulado_en      timestamptz,
  motivo_anulacion text,
  estado_fiscal   text,                      -- futuro: DIAN (nulo hoy)
  payload_fiscal  jsonb,
  check (tipo = 'confirmacion' or consecutivo is not null),
  check ((pedido_venta_id is not null) <> (orden_compra_id is not null)),
  unique (prefijo, consecutivo)
);
create unique index documentos_unico_pedido on documentos (tipo, pedido_venta_id)
  where tipo <> 'confirmacion' and anulado_en is null and pedido_venta_id is not null;
create unique index documentos_unico_orden on documentos (tipo, orden_compra_id)
  where anulado_en is null and orden_compra_id is not null;

create or replace function trg_doc_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Los documentos no se eliminan: anúlelos'; end if;
  if (new.tipo, new.prefijo, new.consecutivo, new.pedido_venta_id, new.orden_compra_id,
      new.tercero, new.lineas, new.totales, new.emitido_en, new.emitido_por)
     is distinct from
     (old.tipo, old.prefijo, old.consecutivo, old.pedido_venta_id, old.orden_compra_id,
      old.tercero, old.lineas, old.totales, old.emitido_en, old.emitido_por)
  then raise exception 'Documento emitido: no se puede modificar (anúlelo y emita otro)'; end if;
  if old.anulado_en is not null and new.anulado_en is distinct from old.anulado_en then
    raise exception 'El documento ya está anulado';
  end if;
  return new;
end $$;
create trigger documentos_inmutable before update or delete on documentos
  for each row execute function trg_doc_inmutable();

-- Emite un documento con consecutivo atómico y sin huecos (mismo commit)
create or replace function emitir_documento(p_tipo text, p_pedido uuid default null, p_orden uuid default null)
returns documentos language plpgsql as $$
declare d documentos; pv pedidos_venta; oc ordenes_compra;
        v_pref text; v_cons bigint; v_tercero jsonb; v_lineas jsonb; v_tot jsonb;
begin
  if p_tipo in ('confirmacion','remision','factura_interna') then
    if p_pedido is null then raise exception 'Falta el pedido'; end if;
    select * into pv from pedidos_venta where id = p_pedido;
    if not found then raise exception 'El pedido no existe'; end if;
    if p_tipo in ('remision','factura_interna') then
      if pv.estado <> 'finalizado' then
        raise exception 'Solo se emite % de pedidos finalizados', p_tipo;
      end if;
      if exists (select 1 from documentos where tipo = p_tipo and pedido_venta_id = p_pedido and anulado_en is null) then
        raise exception 'Ya existe un % vigente para este pedido', p_tipo;
      end if;
    end if;
    select jsonb_build_object('id', t.id, 'nombre', t.nombre, 'tipo_documento', t.tipo_documento,
             'numero_documento', t.numero_documento, 'telefono', t.telefono,
             'direccion', coalesce(pv.direccion_entrega, t.direccion),
             'municipio', coalesce(pv.municipio_entrega, t.municipio))
      into v_tercero from terceros t where t.id = pv.cliente_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'articulo_id', a.id, 'descripcion', a.nombre,
             'presentacion', a.presentacion_cantidad::text || ' ' || a.presentacion_unidad,
             'cantidad', i.cantidad, 'precio_lista', i.precio_lista, 'descuento_pct', i.descuento_pct,
             'precio_unitario', i.precio_unitario, 'tasa_impuesto', i.tasa_impuesto,
             'total_linea', round(i.cantidad * i.precio_unitario, 2)) order by a.nombre), '[]'::jsonb)
      into v_lineas
      from pedidos_venta_items i join articulos a on a.id = i.articulo_id where i.pedido_id = pv.id;
    v_tot := jsonb_build_object('subtotal', pv.subtotal, 'descuento', pv.descuento_valor,
                'impuestos', pv.impuestos, 'envio', pv.envio_cobrado, 'total', pv.total, 'moneda', 'COP');

  elsif p_tipo = 'comprobante_compra' then
    if p_orden is null then raise exception 'Falta la orden de compra'; end if;
    select * into oc from ordenes_compra where id = p_orden;
    if not found then raise exception 'La orden no existe'; end if;
    if oc.estado not in ('recibida_parcial','recibida') then
      raise exception 'Solo se emite comprobante de órdenes con mercancía recibida';
    end if;
    if exists (select 1 from documentos where tipo = p_tipo and orden_compra_id = p_orden and anulado_en is null) then
      raise exception 'Ya existe un comprobante vigente para esta orden';
    end if;
    select jsonb_build_object('id', t.id, 'nombre', t.nombre, 'tipo_documento', t.tipo_documento,
             'numero_documento', t.numero_documento, 'telefono', t.telefono,
             'municipio', t.municipio, 'vereda', t.vereda)
      into v_tercero from terceros t where t.id = oc.proveedor_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'articulo_id', a.id, 'descripcion', a.nombre,
             'presentacion', a.presentacion_cantidad::text || ' ' || a.presentacion_unidad,
             'cantidad', i.cantidad_recibida, 'costo_unitario', i.costo_unitario,
             'total_linea', round(i.cantidad_recibida * i.costo_unitario, 2)) order by a.nombre), '[]'::jsonb)
      into v_lineas
      from ordenes_compra_items i join articulos a on a.id = i.articulo_id
     where i.orden_id = oc.id and i.cantidad_recibida > 0;
    v_tot := jsonb_build_object('total',
               (select coalesce(sum(round(cantidad_recibida * costo_unitario, 2)), 0)
                  from ordenes_compra_items where orden_id = oc.id), 'moneda', 'COP');
  else
    raise exception 'Tipo de documento desconocido: %', p_tipo;
  end if;

  if p_tipo <> 'confirmacion' then
    update consecutivos set ultimo = ultimo + 1 where tipo = p_tipo returning prefijo, ultimo into v_pref, v_cons;
  end if;

  insert into documentos (tipo, prefijo, consecutivo, pedido_venta_id, orden_compra_id, tercero, lineas, totales)
    values (p_tipo, v_pref, v_cons, p_pedido, p_orden, v_tercero, v_lineas, v_tot)
    returning * into d;
  return d;
end $$;

create or replace function anular_documento(p_id uuid, p_motivo text) returns documentos
language plpgsql as $$
declare d documentos;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indique el motivo de la anulación'; end if;
  update documentos set anulado_en = now(), motivo_anulacion = p_motivo
   where id = p_id returning * into d;
  return d;
end $$;

-- =====================================================================
-- VISTAS: inventario, cuentas y dashboard  (security_invoker => respetan RLS)
-- =====================================================================
create view v_stock with (security_invoker = true) as
select a.id as articulo_id, a.nombre,
       coalesce(f.fisico, 0)        as fisico,
       coalesce(c.comprometido, 0)  as comprometido,
       coalesce(e.en_camino, 0)     as en_camino,
       coalesce(f.fisico, 0) + coalesce(e.en_camino, 0) - coalesce(c.comprometido, 0) as disponible_para_prometer,
       greatest(coalesce(c.comprometido, 0) - coalesce(f.fisico, 0) - coalesce(e.en_camino, 0), 0) as faltante
  from articulos a
  left join (select articulo_id, sum(cantidad) as fisico
               from movimientos_inventario group by articulo_id) f on f.articulo_id = a.id
  left join (select i.articulo_id, sum(i.cantidad) as comprometido
               from pedidos_venta_items i join pedidos_venta p on p.id = i.pedido_id
              where p.estado = 'confirmado' and p.deleted_at is null
              group by i.articulo_id) c on c.articulo_id = a.id
  left join (select i.articulo_id, sum(i.cantidad - i.cantidad_recibida) as en_camino
               from ordenes_compra_items i join ordenes_compra o on o.id = i.orden_id
              where o.estado in ('pedida','recibida_parcial') and o.deleted_at is null
              group by i.articulo_id) e on e.articulo_id = a.id
 where a.deleted_at is null;

create view v_necesidades_compra with (security_invoker = true) as
select s.articulo_id, s.nombre, s.faltante, a.proveedor_id, t.nombre as proveedor
  from v_stock s
  join articulos a on a.id = s.articulo_id
  left join terceros t on t.id = a.proveedor_id
 where s.faltante > 0;

-- Pedidos confirmados que esperan el pago (todo es de contado, D13). Al finalizar salen de aquí.
create view v_cuentas_por_cobrar with (security_invoker = true) as
select p.id as pedido_id, p.cliente_id, t.nombre as cliente, p.total,
       coalesce(sum(g.valor), 0) as pagado, p.total - coalesce(sum(g.valor), 0) as saldo
  from pedidos_venta p
  join terceros t on t.id = p.cliente_id
  left join pagos g on g.pedido_venta_id = p.id and g.direccion = 'cobro'
 where p.estado = 'confirmado' and p.deleted_at is null
 group by p.id, t.nombre
having p.total - coalesce(sum(g.valor), 0) > 0;

create view v_cuentas_por_pagar with (security_invoker = true) as
select o.id as orden_id, o.proveedor_id, t.nombre as proveedor, o.total, o.fecha_vencimiento_pago,
       coalesce(sum(g.valor), 0) as pagado, o.total - coalesce(sum(g.valor), 0) as saldo
  from ordenes_compra o
  join terceros t on t.id = o.proveedor_id
  left join pagos g on g.orden_compra_id = o.id and g.direccion = 'pago'
 where o.estado in ('recibida_parcial','recibida') and o.deleted_at is null
 group by o.id, t.nombre
having o.total - coalesce(sum(g.valor), 0) > 0;

-- Una fila por pedido finalizado, con sus métricas (base del dashboard)
create view v_ventas_pedido with (security_invoker = true) as
select p.id as pedido_id, p.cliente_id,
       (p.finalizado_en at time zone 'America/Bogota')::date as dia,
       m.unidades, m.ventas_lista,
       p.subtotal - p.descuento_valor                     as ventas_netas,
       m.ventas_lista - p.subtotal + p.descuento_valor    as descuentos,
       p.envio_cobrado, p.envio_costo, m.costo as costo_mercancia,
       (p.subtotal - p.descuento_valor) + p.envio_cobrado - p.envio_costo - m.costo as utilidad_bruta
  from pedidos_venta p
 cross join lateral (
    select coalesce(sum(i.cantidad), 0)                         as unidades,
           coalesce(sum(i.cantidad * i.precio_lista), 0)        as ventas_lista,
           coalesce(sum(i.cantidad * i.costo_unitario), 0)      as costo
      from pedidos_venta_items i where i.pedido_id = p.id) m
 where p.estado = 'finalizado' and p.deleted_at is null;

create view v_ventas_diarias with (security_invoker = true) as
select dia, count(*) as pedidos, sum(unidades) as unidades, sum(ventas_netas) as ventas_netas,
       sum(descuentos) as descuentos, sum(envio_cobrado) as envio_cobrado, sum(envio_costo) as envio_costo,
       sum(costo_mercancia) as costo_mercancia, sum(utilidad_bruta) as utilidad_bruta
  from v_ventas_pedido group by dia;

create view v_ventas_por_articulo with (security_invoker = true) as
select date_trunc('month', vp.dia)::date as mes, a.id as articulo_id, a.nombre,
       sum(i.cantidad) as unidades,
       sum(round(i.cantidad * i.precio_unitario, 2)) as ventas,
       sum(round(i.cantidad * i.costo_unitario, 2))  as costo,
       sum(round(i.cantidad * (i.precio_unitario - i.costo_unitario), 2)) as margen
  from v_ventas_pedido vp
  join pedidos_venta_items i on i.pedido_id = vp.pedido_id
  join articulos a on a.id = i.articulo_id
 group by 1, a.id, a.nombre;

-- "¿Cómo va la semana / los 15 días / el mes?"
create or replace function resumen_periodo(p_desde date, p_hasta date)
returns table (pedidos int, unidades numeric, ventas_lista numeric, descuentos numeric, ventas_netas numeric,
               envio_cobrado numeric, envio_costo numeric, costo_mercancia numeric,
               gastos numeric, utilidad_neta numeric, compras_periodo numeric)
language sql stable as $$
  with v as (
    select * from v_ventas_pedido where dia between p_desde and p_hasta
  ), g as (
    select coalesce(sum(valor), 0) as gastos from gastos
     where fecha between p_desde and p_hasta and deleted_at is null
  ), c as (
    select coalesce(sum(total), 0) as compras from ordenes_compra
     where estado in ('recibida_parcial','recibida') and deleted_at is null
       and (fecha at time zone 'America/Bogota')::date between p_desde and p_hasta
  )
  select count(v.pedido_id)::int, coalesce(sum(v.unidades), 0), coalesce(sum(v.ventas_lista), 0),
         coalesce(sum(v.descuentos), 0), coalesce(sum(v.ventas_netas), 0),
         coalesce(sum(v.envio_cobrado), 0), coalesce(sum(v.envio_costo), 0), coalesce(sum(v.costo_mercancia), 0),
         (select gastos from g),
         coalesce(sum(v.utilidad_bruta), 0) - (select gastos from g),
         (select compras from c)
    from v;
$$;

-- =====================================================================
-- updated_at automático
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['terceros','productos','articulos','pedidos_venta','ordenes_compra'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- =====================================================================
-- RLS: solo miembros. (La llave anon es pública: lo que protege es RLS.)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'unidades','listas_precio','terceros','productos','articulos','precios','eventos_estado','sync_ops',
    'pedidos_venta','pedidos_venta_items','ordenes_compra','ordenes_compra_items','recepciones',
    'recepcion_items','lotes','movimientos_inventario','pagos','gastos','consecutivos','documentos'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy solo_miembros on %I for all using (es_miembro()) with check (es_miembro())', t);
  end loop;
end $$;

alter table miembros enable row level security;
create policy miembros_lectura on miembros for select using (es_miembro());
-- Los miembros se crean desde el panel SQL de Supabase (no desde la app).
