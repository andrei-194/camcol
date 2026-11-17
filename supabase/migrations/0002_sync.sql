-- =====================================================================
-- Camino Col · Migración 0002: base de sincronización (T-M1-01, CAM-31)
-- =====================================================================
-- Solo hacia adelante: NO se edita 0001_core.sql.
-- Alcance (PLAN §4.2, con la revisión D-009): columnas updated_at para el
-- pull por cursor, "touch" del padre, productos_ofrecidos, adjuntos,
-- configuracion, ping() y uso_bd(). Los duplicados de terceros están al final.
-- Fuera de esta migración (tareas posteriores): aplicar_ops, sync_pull,
-- endurecimiento de permisos, bucket de Storage y Realtime.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) updated_at + trigger set_updated_at en las tablas que aún no lo tenían
--    (set_updated_at() ya existe en 0001)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'listas_precio','precios','unidades','pedidos_venta_items','ordenes_compra_items',
    'recepciones','recepcion_items','lotes','pagos','gastos'
  ] loop
    execute format('alter table %I add column updated_at timestamptz not null default now()', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   t || '_updated_at', t);
    execute format('create index %I on %I (updated_at)', t || '_updated_at_idx', t);
  end loop;
end $$;

-- "Tocar" el padre cuando cambia un hijo: el pull trae cabeceras por updated_at,
-- así que un cambio en un ítem debe mover la cabecera. TG_ARGV: tabla padre y
-- columna FK del hijo. Solo actualiza updated_at (los triggers de estado de
-- 0001 son "before update of estado" y no se disparan).
create or replace function touch_padre() returns trigger
language plpgsql set search_path = public as $$
declare v_padre uuid := (to_jsonb(coalesce(new, old)) ->> tg_argv[1])::uuid;
begin
  execute format('update %I set updated_at = now() where id = $1', tg_argv[0]) using v_padre;
  return null;
end $$;

create trigger pedidos_venta_items_touch after insert or update or delete on pedidos_venta_items
  for each row execute function touch_padre('pedidos_venta', 'pedido_id');
create trigger ordenes_compra_items_touch after insert or update or delete on ordenes_compra_items
  for each row execute function touch_padre('ordenes_compra', 'orden_id');
create trigger recepciones_touch after insert or update or delete on recepciones
  for each row execute function touch_padre('ordenes_compra', 'orden_id');
-- recepcion_items -> recepciones -> ordenes_compra (en cadena)
create trigger recepcion_items_touch after insert or update or delete on recepcion_items
  for each row execute function touch_padre('recepciones', 'recepcion_id');

-- ---------------------------------------------------------------------
-- 2) Terceros: qué productos ofrece el proveedor (texto libre)
-- ---------------------------------------------------------------------
alter table terceros add column productos_ofrecidos text;

-- ---------------------------------------------------------------------
-- 3) Adjuntos (fotos/soportes en Storage). op_id único = idempotencia.
-- ---------------------------------------------------------------------
create table adjuntos (
  id         uuid primary key default gen_random_uuid(),
  entidad    text not null,                 -- p. ej. 'pago', 'gasto', 'recepcion'
  entidad_id uuid not null,
  path       text not null,                 -- ruta en el bucket privado de Storage
  mime       text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),   -- cursor del pull
  op_id      uuid unique
);
create index adjuntos_entidad_idx on adjuntos (entidad, entidad_id);
create index adjuntos_updated_at_idx on adjuntos (updated_at);
create trigger adjuntos_updated_at before update on adjuntos
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 4) Configuración del negocio (clave -> JSON)
-- ---------------------------------------------------------------------
create table configuracion (
  clave      text primary key,
  valor      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger configuracion_updated_at before update on configuracion
  for each row execute function set_updated_at();
insert into configuracion (clave, valor) values ('negocio', jsonb_build_object(
  'razon_social', 'POR DEFINIR',
  'nit', 'POR DEFINIR',
  'direccion', 'POR DEFINIR',
  'telefono', 'POR DEFINIR',
  'email', 'POR DEFINIR',
  'ciudad', 'POR DEFINIR',
  'leyenda_documento', 'POR DEFINIR',
  'logo_path', null
));

-- RLS: solo miembros (igual que el resto)
do $$
declare t text;
begin
  foreach t in array array['adjuntos','configuracion'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy solo_miembros on %I for all using (es_miembro()) with check (es_miembro())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) Funciones de servicio
-- ---------------------------------------------------------------------
create or replace function ping() returns integer
language sql stable set search_path = public as $$ select 1 $$;

create or replace function uso_bd() returns bigint      -- bytes; para la alerta de cuota
language sql stable set search_path = public as $$ select pg_database_size(current_database()) $$;
