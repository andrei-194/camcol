// Pruebas de la migración 0014_funciones_sin_anon.sql (H-15, CAM-92). Ejecutar: npm run test:db
// Hallazgo de auditoría: las funciones creadas después de 0004 las ejecuta `anon` (RNF-SEC-03).
// Carga TODAS las migraciones de la carpeta, así cada migración futura queda cubierta sin tocar esta prueba.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const carpeta = new URL('../../supabase/migrations/', import.meta.url);
const migraciones = readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();
const cargar = (f) => db.exec(readFileSync(new URL(f, carpeta), 'utf8'));

// Stub de Supabase: roles y privilegios por defecto (Supabase concede todo a anon/authenticated en public)
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;

  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.buckets, storage.objects to anon, authenticated;

  create publication supabase_realtime;
`);
await cargar(migraciones[0]);
await db.exec(`alter publication supabase_realtime add table terceros, pedidos_venta`);
for (const f of migraciones.slice(1)) await cargar(f);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

const funciones = await q(`
  select p.oid, p.proname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- no de extensiones
   order by 2`);

console.log(`\nH-15 · funciones sin acceso de anon (${migraciones.length} migraciones, ${funciones.length} funciones)`);

await test('[RNF-SEC-03] control: se cargaron las migraciones y hay funciones que revisar', async () => {
  assert.ok(migraciones.length >= 7, `solo ${migraciones.length} migraciones`);
  assert.ok(funciones.length > 20, `solo ${funciones.length} funciones`);
});

await test('[RNF-SEC-03] ninguna función de public es ejecutable por anon', async () => {
  const abiertas = [];
  for (const f of funciones) {
    const [{ ok }] = await q(`select has_function_privilege('anon', $1::oid, 'execute') as ok`, [f.oid]);
    if (ok) abiertas.push(f.firma);
  }
  assert.deepEqual(abiertas, [], `anon ejecuta: ${abiertas.join(', ')}`);
});

await test('[RNF-SEC-03] las funciones de negocio siguen ejecutables por authenticated', async () => {
  const negocio = ['aplicar_ops', 'sync_pull', 'es_miembro', 'detectar_duplicados_tercero', 'op_tercero_crear'];
  for (const nombre of negocio) {
    const f = funciones.find((x) => x.proname === nombre);
    assert.ok(f, `no existe ${nombre}`);
    const [{ ok }] = await q(`select has_function_privilege('authenticated', $1::oid, 'execute') as ok`, [f.oid]);
    assert.ok(ok, `authenticated no puede ejecutar ${nombre}`);
  }
});

await test('[RNF-SEC-03] una función creada después de la migración también nace cerrada a anon', async () => {
  await db.exec(`create function prueba_futura() returns int language sql as $$ select 1 $$`);
  const [{ ok }] = await q(`select has_function_privilege('anon', 'prueba_futura()'::regprocedure, 'execute') as ok`);
  assert.equal(ok, false, 'anon ejecuta una función nueva (faltan los privilegios por defecto)');
});

console.log(`\n${passed} pruebas ok`);
await db.close();
