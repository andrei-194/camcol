// Pruebas de la migración 0004_hardening.sql en Postgres real (PGlite, WASM). Ejecutar: npm run test:db
// Cubre RNF-SEC-01/03/04 y D-009 (sin Realtime). Storage se prueba contra un stub del esquema `storage`.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const migracion = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');

// Stub de Supabase: roles, privilegios por defecto (Supabase concede todo a anon/authenticated en public),
// auth, storage y la publicación supabase_realtime.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
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
await db.exec(migracion('0001_core.sql'));
await db.exec(migracion('0002_sync.sql'));
// Simula la configuración por defecto de Supabase: tablas de public en la publicación Realtime.
await db.exec(`alter publication supabase_realtime add table terceros, pedidos_venta`);
await db.exec(migracion('0004_hardening.sql'));

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_X = '00000000-0000-0000-0000-0000000000ff';
await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_X}');
  insert into miembros (user_id, nombre) values ('${USER_A}', 'Socio A');
`);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const rejects = async (sql, re, params = []) => {
  await assert.rejects(() => db.query(sql, params), (e) => re.test(e.message), `esperaba error ${re} en: ${sql}`);
};
const como = async (rol, uid, fn) => {
  await db.exec(`set role ${rol}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false)`);
  try { return await fn(); } finally { await db.exec(`reset role`); }
};

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

console.log('0004_hardening');

await test('[RNF-SEC-01] anon no puede leer ninguna tabla ni vista de public', async () => {
  const objs = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname = 'public' and c.relkind in ('r','v','m','p') order by 1`);
  assert.ok(objs.length > 20);
  await como('anon', null, async () => {
    for (const { relname } of objs) await rejects(`select * from "${relname}" limit 1`, /permission denied/i);
  });
});

await test('[RNF-SEC-01] anon no puede escribir', async () => {
  await como('anon', null, async () => {
    await rejects(`insert into terceros (nombre) values ('x')`, /permission denied/i);
    await rejects(`update terceros set nombre = 'x'`, /permission denied/i);
    await rejects(`delete from terceros`, /permission denied/i);
  });
});

await test('[RNF-SEC-03] anon no puede ejecutar ninguna función de public', async () => {
  const fns = await q(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.prokind in ('f','p')
                          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`);
  assert.ok(fns.length > 5);
  for (const { sig } of fns) {
    const r = await one(`select has_function_privilege('anon', $1::regprocedure, 'execute') as a`, [sig]);
    assert.equal(r.a, false, `anon puede ejecutar ${sig}`);
  }
  await como('anon', null, async () => {
    await rejects(`select es_miembro()`, /permission denied/i);
    await rejects(`select ping()`, /permission denied/i);
    await rejects(`select * from detectar_duplicados_tercero('3001112233')`, /permission denied/i);
  });
});

await test('[RNF-SEC-03] ninguna función de public queda sin search_path fijo', async () => {
  const sin = await q(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.prokind in ('f','p')
                          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
                          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  assert.deepEqual(sin.map((r) => r.sig), []);
});

await test('[RNF-SEC-03] las vistas siguen siendo security_invoker', async () => {
  const malas = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relkind = 'v'
                            and not coalesce('security_invoker=true' = any (c.reloptions), false)`);
  assert.deepEqual(malas, []);
});

await test('[RNF-SEC-01] RLS activo en todas las tablas de public', async () => {
  const sin = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(sin, []);
});

await test('[RNF-SEC-01] un miembro autenticado conserva acceso a tablas, vistas y funciones', async () => {
  await como('authenticated', USER_A, async () => {
    assert.equal((await one(`select es_miembro() as m`)).m, true);
    await q(`insert into terceros (nombre, es_proveedor) values ('Don Luis', true)`);
    assert.equal((await q(`select * from terceros`)).length, 1);
    await q(`select * from v_stock`);
    await q(`select * from resumen_periodo(current_date, current_date)`);
  });
});

await test('[RNF-SEC-01] un autenticado no miembro ve 0 filas y no puede insertar', async () => {
  await como('authenticated', USER_X, async () => {
    assert.equal((await one(`select es_miembro() as m`)).m, false);
    assert.equal((await q(`select * from terceros`)).length, 0);
    await rejects(`insert into terceros (nombre) values ('intruso')`, /row-level security/i);
  });
});

await test('[RNF-SEC-03] pg_trgm no está en public', async () => {
  const e = await one(`select n.nspname from pg_extension x join pg_namespace n on n.oid = x.extnamespace where x.extname = 'pg_trgm'`);
  assert.equal(e.nspname, 'extensions');
  const enPublic = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'public' and p.proname in ('similarity', 'show_trgm', 'word_similarity')`);
  assert.deepEqual(enPublic, []);
});

await test('[T-M1-02] detectar_duplicados_tercero sigue funcionando tras mover pg_trgm', async () => {
  await como('authenticated', USER_A, async () => {
    await q(`insert into terceros (nombre, es_cliente, telefono) values ('María Pérez', true, '300 999 8877')`);
    const porNombre = await q(`select * from detectar_duplicados_tercero(null, null, 'Maria Perez')`);
    assert.equal(porNombre.length, 1);
    assert.match(porNombre[0].motivo, /nombre/);
    const porTel = await q(`select * from detectar_duplicados_tercero('3009998877')`);
    assert.match(porTel[0].motivo, /telefono/);
    assert.equal((await q(`select * from detectar_duplicados_tercero(null, null, 'Zapatos Rojos')`)).length, 0);
  });
});

await test('[RNF-SEC-04] el bucket soportes existe y es privado', async () => {
  const b = await one(`select id, public from storage.buckets where id = 'soportes'`);
  assert.equal(b.id, 'soportes');
  assert.equal(b.public, false);
});

await test('[RNF-SEC-04] solo miembros acceden a objetos de soportes; anon y no miembros no', async () => {
  await como('authenticated', USER_A, async () => {
    await q(`insert into storage.objects (bucket_id, name) values ('soportes', 'compras/1.jpg')`);
    assert.equal((await q(`select * from storage.objects where bucket_id = 'soportes'`)).length, 1);
  });
  await como('authenticated', USER_X, async () => {
    assert.equal((await q(`select * from storage.objects`)).length, 0);
    await rejects(`insert into storage.objects (bucket_id, name) values ('soportes', 'x.jpg')`, /row-level security/i);
  });
  await como('anon', null, async () => {
    assert.equal((await q(`select * from storage.objects`)).length, 0);
    await rejects(`insert into storage.objects (bucket_id, name) values ('soportes', 'x.jpg')`, /row-level security/i);
  });
});

await test('[D-009] ninguna tabla de public está en la publicación supabase_realtime', async () => {
  const t = await q(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`);
  assert.deepEqual(t, []);
});

console.log(`\n${passed} pruebas pasaron`);
