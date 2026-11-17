-- =====================================================================
-- Camino Col · Migración 0002: base de sincronización (T-M1-01, CAM-31)
-- =====================================================================
-- Solo hacia adelante: NO se edita 0001_core.sql.
-- Alcance (PLAN §4.2, con la revisión D-009): columnas updated_at para el
-- pull por cursor, "touch" del padre, productos_ofrecidos, adjuntos,
-- configuracion, ping() y uso_bd(). Los duplicados de terceros (T-M1-02, CAM-32)
-- están al final.
-- Fuera de esta migración (tareas posteriores): aplicar_ops, sync_pull,
-- endurecimiento de permisos, bucket de Storage y Realtime.
-- =====================================================================

create extension if not exists pg_trgm;   -- similitud de nombres (T-M1-02)

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

-- =====================================================================
-- 6) Detección de duplicados de terceros (T-M1-02, CAM-32 · RF-TER-04)
-- =====================================================================
-- Teléfono: solo dígitos y sin el indicativo 57 inicial (también con 00 delante).
-- '+57 300 111 2233' = '(57) 300-111-2233' = '3001112233'.
create or replace function normalizar_telefono(p text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^(00)?57(?=\d{10}$)', '')
$$;

-- Documento: minúsculas y solo letras/números ('900.123.456' = '900123456').
create or replace function normalizar_documento(p text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g')
$$;

-- Nombre: minúsculas, sin tildes ni signos, espacios colapsados.
create or replace function normalizar_nombre(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(
           translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'),
           '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create index terceros_telefono_norm_idx on terceros (normalizar_telefono(telefono));

-- Candidatos a duplicado: mismo teléfono normalizado (>= 7 dígitos), mismo documento
-- normalizado, o nombre normalizado con similitud de trigramas >= 0.5. Una fila por
-- tercero; `motivo` lista por qué coincide ('telefono', 'documento', 'nombre').
-- SECURITY INVOKER: la RLS de terceros se aplica (solo miembros).
create or replace function detectar_duplicados_tercero(
  p_telefono text default null, p_numero_documento text default null, p_nombre text default null
) returns table (id uuid, nombre text, telefono text, municipio text, motivo text)
language sql stable set search_path = public as $$
  with q as (
    select case when length(normalizar_telefono(p_telefono)) >= 7 then normalizar_telefono(p_telefono) end as tel,
           nullif(normalizar_documento(p_numero_documento), '') as doc,
           nullif(normalizar_nombre(p_nombre), '') as nom
  )
  select t.id, t.nombre, t.telefono, t.municipio,
         concat_ws(', ',
           case when q.tel is not null and normalizar_telefono(t.telefono) = q.tel then 'telefono' end,
           case when q.doc is not null and normalizar_documento(t.numero_documento) = q.doc then 'documento' end,
           case when q.nom is not null and similarity(normalizar_nombre(t.nombre), q.nom) >= 0.5 then 'nombre' end
         ) as motivo
    from terceros t, q
   where t.deleted_at is null
     and ((q.tel is not null and normalizar_telefono(t.telefono) = q.tel)
       or (q.doc is not null and normalizar_documento(t.numero_documento) = q.doc)
       or (q.nom is not null and similarity(normalizar_nombre(t.nombre), q.nom) >= 0.5))
   order by t.nombre
$$;
