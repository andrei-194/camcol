-- =====================================================================
-- 0004_hardening.sql  (T-M1-09 · CAM-39 · RNF-SEC-01/03/04, D-009)
-- Endurecimiento de seguridad. Solo hacia adelante; no toca 0001/0002.
--   1. pg_trgm fuera de `public` (esquema `extensions`).
--   2. search_path fijo en TODAS las funciones de `public`.
--   3. Sin acceso de `anon`: REVOKE en tablas, vistas, secuencias y funciones.
--      Solo `authenticated` (y dentro de él, solo miembros por RLS) usa la API.
--   4. Bucket privado `soportes` + políticas solo miembros (si existe Storage).
--   5. Sin Realtime (D-009): ninguna tabla de `public` en `supabase_realtime`.
-- Nota: las funciones y tablas que agreguen migraciones posteriores (0003, 0005...)
-- heredan los privilegios por defecto corregidos aquí; el test del catálogo
-- (tests/db/hardening.test.mjs) falla si alguna queda sin search_path fijo.
-- =====================================================================

-- 1. pg_trgm fuera de public ------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to authenticated, service_role;
do $$ begin
  if (select n.nspname from pg_extension x join pg_namespace n on n.oid = x.extnamespace
       where x.extname = 'pg_trgm') <> 'extensions' then
    alter extension pg_trgm set schema extensions;
  end if;
end $$;

-- 2. search_path fijo en todas las funciones de public ------------------
-- Las que ya lo traen (es_miembro, touch_padre, ...) se dejan igual.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;

-- Usa similarity() de pg_trgm, ahora en `extensions`.
alter function detectar_duplicados_tercero(text, text, text) set search_path = public, extensions;

-- 3. Sin acceso de anon -------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from public, anon;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from public, anon;

-- `authenticated` conserva lo que necesita; la RLS "solo miembros" decide el resto.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 4. Storage: bucket privado `soportes` (RNF-SEC-04) ---------------------
-- Bloque protegido: si el esquema storage no existe (BD sin Supabase) se omite.
do $$ begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public) values ('soportes', 'soportes', false)
      on conflict (id) do update set public = false;
    drop policy if exists soportes_solo_miembros on storage.objects;
    create policy soportes_solo_miembros on storage.objects for all to authenticated
      using (bucket_id = 'soportes' and public.es_miembro())
      with check (bucket_id = 'soportes' and public.es_miembro());
  end if;
end $$;

-- 5. Sin Realtime (D-009) -----------------------------------------------
do $$
declare t record;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    for t in select tablename from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public'
    loop
      execute format('alter publication supabase_realtime drop table public.%I', t.tablename);
    end loop;
  end if;
end $$;
