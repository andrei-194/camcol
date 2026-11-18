// Pruebas de la migración 0003_aplicar_ops.sql (T-M1-03, CAM-33) en Postgres real (PGlite).
// Ejecutar: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const migracion = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');

// Stub mínimo de Supabase Auth (igual que core.test.mjs)
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
await db.exec(migracion('0001_core.sql'));
await db.exec(migracion('0002_sync.sql'));
await db.exec(migracion('0003_aplicar_ops.sql'));

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_X = '00000000-0000-0000-0000-0000000000ff';
await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_X}');
  insert into miembros (user_id, nombre) values ('${USER_A}', 'Socio A');
  select set_config('request.jwt.claim.sub', '${USER_A}', false);
`);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const como = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

// ---------- Operaciones de prueba (solo existen en este test) ----------
// Prueban el registro extensible: T-M1-04..07 harán lo mismo con sus ops reales.
await db.exec(`
  create table prueba_notas (id uuid primary key, texto text not null);
  create function op_prueba_nota(p jsonb) returns jsonb language plpgsql set search_path = public as $$
  begin
    insert into prueba_notas (id, texto) values ((p->>'id')::uuid, p->>'texto');
    return jsonb_build_object('id', p->>'id');
  end $$;
  -- inserta y DESPUÉS falla: debe deshacerse lo insertado
  create function op_prueba_a_medias(p jsonb) returns jsonb language plpgsql set search_path = public as $$
  begin
    insert into prueba_notas (id, texto) values ((p->>'id')::uuid, 'a medias');
    raise exception 'DATOS_INVALIDOS: falla despues de insertar';
  end $$;
  create function op_prueba_revision(p jsonb) returns jsonb language plpgsql set search_path = public as $$
  begin
    return jsonb_build_object('_revision', true, 'candidatos', jsonb_build_array());
  end $$;
  insert into tipos_op (tipo, funcion) values
    ('prueba.nota', 'op_prueba_nota'),
    ('prueba.a_medias', 'op_prueba_a_medias'),
    ('prueba.revision', 'op_prueba_revision');
`);

const uid = (n) => `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, '0')}`;
const op = (n, tipo, datos) => ({ op_id: uid(n), tipo, datos });
const aplicar = async (ops) => (await one(`select aplicar_ops($1::jsonb) r`, [JSON.stringify(ops)])).r;
const notas = async () => (await q(`select id, texto from prueba_notas order by id`));

console.log('\nT-M1-03 · aplicar_ops: idempotencia y aislamiento por operación');

await test('[RF-SYN-01] aplica una op registrada y guarda el resultado en sync_ops', async () => {
  const r = await aplicar([op(1, 'prueba.nota', { id: uid(101), texto: 'hola' })]);
  assert.equal(r.detener_cola, false);
  assert.equal(r.resultados.length, 1);
  assert.equal(r.resultados[0].op_id, uid(1));
  assert.equal(r.resultados[0].status, 'ok');
  assert.equal(r.resultados[0].resultado.id, uid(101));
  const s = await one(`select estado, resultado, tipo from sync_ops where op_id = $1`, [uid(1)]);
  assert.equal(s.estado, 'ok');
  assert.equal(s.tipo, 'prueba.nota');
  assert.equal(s.resultado.id, uid(101));
});

await test('[RF-SYN-05][E2] reenvío idéntico devuelve ya_aplicada con el resultado guardado y no duplica', async () => {
  const antes = (await notas()).length;
  const r = await aplicar([op(1, 'prueba.nota', { id: uid(101), texto: 'hola' })]);
  assert.equal(r.resultados[0].status, 'ya_aplicada');
  assert.equal(r.resultados[0].resultado.id, uid(101));
  assert.equal(r.detener_cola, false, 'ya_aplicada es éxito: la cola sigue');
  assert.equal((await notas()).length, antes);
  assert.equal((await one(`select count(*)::int c from sync_ops where op_id = $1`, [uid(1)])).c, 1);
});

await test('[RF-SYN-05][E2] el mismo op_id dentro de un mismo lote se aplica una sola vez', async () => {
  const o = op(2, 'prueba.nota', { id: uid(102), texto: 'doble' });
  const r = await aplicar([o, o]);
  assert.deepEqual(r.resultados.map((x) => x.status), ['ok', 'ya_aplicada']);
  assert.equal((await q(`select 1 from prueba_notas where id = $1`, [uid(102)])).length, 1);
});

await test('[RF-SYN-01][E2] una op fallida no deja datos a medias y las demás del lote se aplican', async () => {
  const r = await aplicar([
    op(10, 'prueba.nota', { id: uid(110), texto: 'antes' }),
    op(11, 'prueba.a_medias', { id: uid(111) }),
    op(12, 'prueba.nota', { id: uid(112), texto: 'despues' }),
  ]);
  assert.deepEqual(r.resultados.map((x) => x.status), ['ok', 'error', 'ok']);
  assert.equal(r.resultados[1].error.codigo, 'DATOS_INVALIDOS');
  assert.match(r.resultados[1].error.mensaje, /falla despues de insertar/);
  const ids = (await notas()).map((n) => n.id);
  assert.ok(ids.includes(uid(110)) && ids.includes(uid(112)));
  assert.ok(!ids.includes(uid(111)), 'lo insertado por la op fallida se deshizo');
  assert.equal((await q(`select 1 from sync_ops where op_id = $1`, [uid(11)])).length, 0, 'una op fallida no queda registrada');
});

await test('[RF-SYN-07] el resultado indica detener la cola cuando una op falla', async () => {
  const r = await aplicar([op(20, 'prueba.a_medias', { id: uid(120) })]);
  assert.equal(r.detener_cola, true);
  const ok = await aplicar([op(21, 'prueba.nota', { id: uid(121), texto: 'x' })]);
  assert.equal(ok.detener_cola, false);
});

await test('[RF-SYN-07] una op fallida se puede reenviar (no queda marcada como aplicada)', async () => {
  const r = await aplicar([op(11, 'prueba.a_medias', { id: uid(111) })]);
  assert.equal(r.resultados[0].status, 'error');
});

await test('[RF-SYN-07] una op en revisión detiene la cola y no se registra como aplicada', async () => {
  const r = await aplicar([op(30, 'prueba.revision', {})]);
  assert.equal(r.resultados[0].status, 'revision');
  assert.deepEqual(r.resultados[0].resultado.candidatos, []);
  assert.equal(r.detener_cola, true);
  assert.equal((await q(`select 1 from sync_ops where op_id = $1`, [uid(30)])).length, 0);
});

await test('[RF-SYN-01] respeta el orden del arreglo (orden estable)', async () => {
  const r = await aplicar([
    op(40, 'prueba.nota', { id: uid(140), texto: 'a' }),
    op(41, 'prueba.nota', { id: uid(141), texto: 'b' }),
    op(42, 'prueba.nota', { id: uid(142), texto: 'c' }),
  ]);
  assert.deepEqual(r.resultados.map((x) => x.op_id), [uid(40), uid(41), uid(42)]);
  const orden = (await q(`select op_id from sync_ops where op_id = any($1) order by created_at, op_id`, [[uid(40), uid(41), uid(42)]]));
  assert.equal(orden.length, 3);
});

console.log('\nT-M1-03 · Códigos de error estables');

await test('[RF-SYN-01] tipo desconocido → TIPO_DESCONOCIDO (y detiene la cola)', async () => {
  const r = await aplicar([op(50, 'no.existe', {})]);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(r.resultados[0].error.codigo, 'TIPO_DESCONOCIDO');
  assert.equal(r.detener_cola, true);
});

await test('[RF-SYN-01] datos mal formados → DATOS_INVALIDOS (op_id, tipo, datos, restricciones y tipos de Postgres)', async () => {
  const r = await aplicar([
    { op_id: 'no-es-uuid', tipo: 'prueba.nota', datos: {} },
    { op_id: uid(60), datos: {} },
    { op_id: uid(61), tipo: 'prueba.nota', datos: [1, 2] },
    op(62, 'prueba.nota', { id: uid(162), texto: null }),        // not null
    op(63, 'prueba.nota', { id: 'no-uuid', texto: 'x' }),          // cast inválido
  ]);
  assert.deepEqual(r.resultados.map((x) => x.error.codigo), Array(5).fill('DATOS_INVALIDOS'));
  assert.equal(r.resultados[0].op_id, null);
  assert.equal(r.detener_cola, true);
});

await test('[RF-SYN-01] un arreglo vacío es válido y una entrada que no es arreglo lanza DATOS_INVALIDOS', async () => {
  const r = await aplicar([]);
  assert.deepEqual(r, { detener_cola: false, resultados: [] });
  await assert.rejects(() => db.query(`select aplicar_ops('{"a":1}'::jsonb)`), /DATOS_INVALIDOS/);
});

console.log('\nT-M1-03 · Seguridad');

await test('[RNF-SEG] quien no es miembro recibe NO_AUTORIZADO en cada op y no se aplica nada', async () => {
  await como(USER_X);
  try {
    const r = await aplicar([op(70, 'prueba.nota', { id: uid(170), texto: 'intruso' })]);
    assert.equal(r.resultados[0].status, 'error');
    assert.equal(r.resultados[0].error.codigo, 'NO_AUTORIZADO');
    assert.equal(r.detener_cola, true);
  } finally { await como(USER_A); }
  assert.ok(!(await notas()).some((n) => n.id === uid(170)));
  assert.equal((await q(`select 1 from sync_ops where op_id = $1`, [uid(70)])).length, 0);
});

await test('[RNF-SEG] sin sesión (auth.uid() nulo) tampoco se autoriza', async () => {
  await como('');
  try {
    const r = await aplicar([op(71, 'prueba.nota', { id: uid(171), texto: 'anon' })]);
    assert.equal(r.resultados[0].error.codigo, 'NO_AUTORIZADO');
  } finally { await como(USER_A); }
});

await test('[RNF-SEG] RLS activo en sync_ops y tipos_op; aplicar_ops y funciones con search_path fijo', async () => {
  const rls = await q(`select relname from pg_class where relname in ('sync_ops','tipos_op') and relrowsecurity`);
  assert.equal(rls.length, 2);
  const f = await one(`select prosecdef, proconfig from pg_proc where proname = 'aplicar_ops'`);
  assert.equal(f.prosecdef, false, 'SECURITY INVOKER: RLS aplica');
  assert.ok(f.proconfig.some((c) => /search_path=public/.test(c)));
});

await test('[RNF-SEG] un no miembro (rol authenticated) no ve sync_ops ni tipos_op', async () => {
  await db.exec(`
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(`set role authenticated`);
  await como(USER_X);
  try {
    assert.equal((await one(`select count(*)::int c from sync_ops`)).c, 0);
    assert.equal((await one(`select count(*)::int c from tipos_op`)).c, 0);
  } finally { await db.exec(`reset role`); await como(USER_A); }
});

console.log(`\n${passed} pruebas OK${process.exitCode ? ' — HAY FALLAS' : ''}`);
