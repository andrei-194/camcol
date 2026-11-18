// T-M1-10 (CAM-40) · verificación pendiente de H-15 / CAM-92 (RNF-SEC-03) en Supabase real:
// los privilegios por defecto de 0014 se aplican al rol que ejecuta las migraciones, y `anon` no ejecuta
// ninguna función de `public` vía PostgREST (incluida ping()).
// Ejecutar: npm run test:integration
import assert from 'node:assert/strict';
import { conectar, sesion, hacerMiembro, rest, rpc, nuevoRunner } from './entorno.mjs';

const { test } = nuevoRunner();
const admin = await conectar();
const socio = await sesion('socio-a@integracion.test');
await hacerMiembro(admin, socio, 'Socio A');

const funciones = (await admin.query(`
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args, p.pronargs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by 2`)).rows;

console.log(`\nH-15 · funciones sin anon en Supabase real (${funciones.length} funciones en public)`);

await test('[RNF-SEC-03] control: hay funciones y el rol postgres es el dueño de las migraciones', async () => {
  assert.ok(funciones.length >= 20, `solo ${funciones.length} funciones`);
  const duenos = (await admin.query(`select distinct pg_get_userbyid(p.proowner) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                      where n.nspname='public' and p.proname in ('aplicar_ops','ping','sync_pull')`)).rows;
  assert.deepEqual(duenos, [{ d: 'postgres' }]);
});

await test('[RNF-SEC-03] ninguna función de public es ejecutable por anon ni por PUBLIC (catálogo)', async () => {
  const mal = [];
  for (const f of funciones) {
    const r = (await admin.query(`select has_function_privilege('anon', $1, 'execute') a,
                                         has_function_privilege('authenticated', $1, 'execute') u`, [f.oid])).rows[0];
    if (r.a) mal.push(`${f.proname}(${f.args}) ejecutable por anon`);
    if (!r.u) mal.push(`${f.proname}(${f.args}) NO ejecutable por authenticated`);
    const publico = (await admin.query(`select exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                         where p.oid = $1 and a.grantee = 0 and a.privilege_type = 'EXECUTE') x`, [f.oid])).rows[0].x;
    if (publico) mal.push(`${f.proname}(${f.args}) ejecutable por PUBLIC`);
  }
  assert.deepEqual(mal, []);
});

await test('[RNF-SEC-03] los privilegios por defecto del rol postgres no dan EXECUTE a PUBLIC ni a anon', async () => {
  const d = (await admin.query(`
    select pg_get_userbyid(defaclrole) rol, coalesce(n.nspname,'(global)') esquema, defaclacl::text acl
      from pg_default_acl a left join pg_namespace n on n.oid = a.defaclnamespace
     where defaclobjtype = 'f' and pg_get_userbyid(defaclrole) = 'postgres'`)).rows;
  assert.ok(d.length >= 1, 'debe haber ACL por defecto de funciones para postgres');
  const global = d.find((x) => x.esquema === '(global)');
  assert.ok(global, 'falta la ACL global (alter default privileges sin "in schema")');
  assert.ok(!/(^|[{,"])=X/.test(global.acl), `PUBLIC conserva EXECUTE por defecto: ${global.acl}`);
  for (const x of d.filter((y) => y.esquema === 'public')) assert.ok(!/anon=X/.test(x.acl), `anon con EXECUTE por defecto en ${x.esquema}: ${x.acl}`);
});

await test('[RNF-SEC-03] una función NUEVA creada por postgres nace sin EXECUTE para anon/PUBLIC y con él para authenticated', async () => {
  await admin.query('begin');
  try {
    await admin.query(`create function public.zz_prueba_h15() returns integer language sql as 'select 1'`);
    const r = (await admin.query(`select has_function_privilege('anon','public.zz_prueba_h15()','execute') a,
                                         has_function_privilege('authenticated','public.zz_prueba_h15()','execute') u,
                                         has_function_privilege('service_role','public.zz_prueba_h15()','execute') s,
                                         (select proacl::text from pg_proc where proname='zz_prueba_h15') acl`)).rows[0];
    assert.equal(r.a, false, `anon ejecuta una función nueva: ${r.acl}`);
    assert.equal(r.u, true, `authenticated debía ejecutarla: ${r.acl}`);
    assert.equal(r.s, true);
    assert.doesNotMatch(r.acl, /(^|[{,"])=X/, 'PUBLIC conserva EXECUTE');
  } finally { await admin.query('rollback'); }
});

await test('[RNF-SEC-03] vía PostgREST, anon no ejecuta ping() ni ninguna otra función de public', async () => {
  const p = await rpc(null, 'ping');
  assert.ok(p.status === 401 || p.status === 403, `ping() con anon: HTTP ${p.status} ${JSON.stringify(p.json)}`);
  assert.equal(p.json?.code, '42501', JSON.stringify(p.json));
  for (const f of funciones) {
    // POST con cuerpo vacío: si la función es alcanzable debe dar 401/403 (permission denied), nunca 2xx.
    const r = await rpc(null, f.proname, {});
    assert.ok(r.status !== 200 && r.status !== 204, `${f.proname}(${f.args}) respondió ${r.status} a anon`);
    assert.ok(![400, 409, 500].includes(r.status) || /permission|42501|PGRST202|PGRST203/.test(JSON.stringify(r.json)),
      `${f.proname}(${f.args}) con anon dio HTTP ${r.status}: ${JSON.stringify(r.json)}`);
  }
});

await test('[RNF-SEC-03] con una función nueva real: anon recibe 401/403 y el miembro 200 (PostgREST recarga el esquema)', async () => {
  await admin.query(`create or replace function public.zz_prueba_h15() returns integer language sql as 'select 1'`);
  try {
    await admin.query(`notify pgrst, 'reload schema'`);
    let a, m;
    for (let i = 0; i < 30; i++) {                       // espera a que PostgREST vea la función
      await new Promise((r) => setTimeout(r, 300));
      m = await rpc(socio.token, 'zz_prueba_h15');
      if (m.status === 200) break;
    }
    assert.equal(m.status, 200, `el miembro debía ejecutarla: HTTP ${m.status} ${JSON.stringify(m.json)}`);
    a = await rpc(null, 'zz_prueba_h15');
    assert.ok(a.status === 401 || a.status === 403, `anon con la función nueva: HTTP ${a.status} ${JSON.stringify(a.json)}`);
  } finally {
    await admin.query(`drop function if exists public.zz_prueba_h15()`);
    await admin.query(`notify pgrst, 'reload schema'`);
  }
});

await test('[RNF-SEC-03] el miembro sí puede usar ping() (authenticated conserva el acceso)', async () => {
  const r = await rpc(socio.token, 'ping');
  assert.equal(r.status, 200);
  assert.equal(r.json, 1);
});

await admin.end();
