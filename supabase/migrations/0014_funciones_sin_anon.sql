-- 0014 · Funciones sin acceso de anon (H-15, CAM-92, RNF-SEC-03)
-- Postgres concede EXECUTE a PUBLIC por defecto a toda función nueva; ese privilegio por defecto es global
-- (no del esquema), así que `alter default privileges in schema public ... from public` (0004) no lo quita
-- y las funciones de 0005 en adelante quedaron ejecutables por `anon`.

-- 1. Corregir las existentes.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- 2. Futuras funciones. Sin `in schema` se cambia el privilegio global de PUBLIC para el rol que ejecuta
--    las migraciones (en Supabase, `postgres`; verificar en T-M1-10 / CAM-40).
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
