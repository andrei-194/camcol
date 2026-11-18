// Pruebas de la migración 0007_op_tercero.sql en Postgres real (PGlite). Ejecutar: npm run test:db
// T-M1-04 (CAM-34) · RF-SYN-06, RF-TER-04, RF-TER-05, [E14]: op tercero.crear con revisión de duplicados.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const migracion = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
for (const f of ['0001_core.sql', '0002_sync.sql', '0003_aplicar_ops.sql', '0007_op_tercero.sql']) {
  await db.exec(migracion(f));
}

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

const uid = (n) => `bbbbbbbb-0000-0000-0000-${String(n).padStart(12, '0')}`;
const aplicar = async (ops) => (await one(`select aplicar_ops($1::jsonb) r`, [JSON.stringify(ops)])).r;
const tercero = (n, extra = {}) => ({
  id: uid(1000 + n), nombre: `Proveedor ${n}`, es_proveedor: true, es_cliente: false,
  telefono: `31000000${String(n).padStart(2, '0')}`, municipio: 'Cajibío', ...extra,
});
const crear = (opN, datos) => ({ op_id: uid(opN), tipo: 'tercero.crear', datos });
const cuenta = async () => Number((await one(`select count(*)::int n from terceros`)).n);

console.log('\nT-M1-04 · tercero.crear');

await test('[RF-SYN-06] el tipo tercero.crear está registrado en tipos_op', async () => {
  const t = await one(`select funcion from tipos_op where tipo = 'tercero.crear'`);
  assert.ok(t, 'falta tipo');
});

await test('[RF-SYN-06] crea un tercero sin duplicados con todos sus campos', async () => {
  const d = tercero(1, {
    productos_ofrecidos: 'café, panela', vereda: 'La Laguna', latitud: 2.6, longitud: -76.5,
    consentimiento_datos: true, consentimiento_en: '2026-11-17T10:00:00-05:00', notas: 'campo',
  });
  const r = await aplicar([crear(1, d)]);
  assert.equal(r.detener_cola, false);
  assert.equal(r.resultados[0].status, 'ok');
  assert.equal(r.resultados[0].resultado.id, d.id);
  const t = await one(`select * from terceros where id = $1`, [d.id]);
  assert.equal(t.nombre, 'Proveedor 1');
  assert.equal(t.es_proveedor, true);
  assert.equal(t.productos_ofrecidos, 'café, panela');
  assert.equal(t.vereda, 'La Laguna');
  assert.equal(t.consentimiento_datos, true);
});

await test('[RF-SYN-06] genera el id si el cliente no lo manda', async () => {
  const d = tercero(2); delete d.id;
  const r = await aplicar([crear(2, d)]);
  assert.equal(r.resultados[0].status, 'ok');
  assert.match(r.resultados[0].resultado.id, /^[0-9a-f-]{36}$/);
});

await test('[RF-TER-04][E14] teléfono repetido (formato distinto) deja la op en revisión y no crea', async () => {
  const antes = await cuenta();
  const d = tercero(3, { telefono: '+57 310 000 0001' }); // = Proveedor 1
  const r = await aplicar([crear(3, d)]);
  assert.equal(r.detener_cola, true);
  assert.equal(r.resultados[0].status, 'revision');
  const c = r.resultados[0].resultado.candidatos;
  assert.equal(c.length, 1);
  assert.equal(c[0].id, uid(1001));
  assert.equal(c[0].nombre, 'Proveedor 1');
  assert.equal(c[0].municipio, 'Cajibío');
  assert.match(c[0].motivo, /telefono/);
  assert.equal(await cuenta(), antes);
  assert.equal((await q(`select 1 from sync_ops where op_id = $1`, [uid(3)])).length, 0, 'revisión no se registra');
});

await test('[RF-TER-04] documento igual o nombre muy similar también piden revisión', async () => {
  await aplicar([crear(10, tercero(10, { tipo_documento: 'CC', numero_documento: '1.234.567', telefono: null }))]);
  const porDoc = await aplicar([crear(11, tercero(11, { tipo_documento: 'CC', numero_documento: '1234567', telefono: null }))]);
  assert.equal(porDoc.resultados[0].status, 'revision');
  assert.match(porDoc.resultados[0].resultado.candidatos[0].motivo, /documento/);
  const porNombre = await aplicar([crear(12, tercero(12, { nombre: 'proveedor 10', telefono: null }))]);
  assert.equal(porNombre.resultados[0].status, 'revision');
  assert.match(porNombre.resultados[0].resultado.candidatos[0].motivo, /nombre/);
});

await test('[RF-SYN-06] resolucion crear_igual crea el tercero pese al candidato', async () => {
  const antes = await cuenta();
  const d = tercero(4, { telefono: '3100000001', resolucion: { tipo: 'crear_igual' } });
  const r = await aplicar([crear(4, d)]);
  assert.equal(r.resultados[0].status, 'ok');
  assert.equal(r.resultados[0].resultado.id, d.id);
  assert.equal(await cuenta(), antes + 1);
});

await test('[E14] resolucion usar_existente no crea y devuelve el existente', async () => {
  const antes = await cuenta();
  const d = tercero(5, { telefono: '3100000001', resolucion: { tipo: 'usar_existente', tercero_id: uid(1001) } });
  const r = await aplicar([crear(5, d)]);
  assert.equal(r.resultados[0].status, 'ok');
  assert.equal(r.resultados[0].resultado.id, uid(1001));
  assert.equal(r.resultados[0].resultado.existente, true);
  assert.equal(await cuenta(), antes);
});

await test('[E14] usar_existente suma el rol que faltaba (cliente que también es proveedor)', async () => {
  await aplicar([crear(20, tercero(20, { es_proveedor: false, es_cliente: true, consentimiento_datos: true,
    consentimiento_en: '2026-11-17T10:00:00-05:00' }))]);
  const d = tercero(21, { telefono: '3100000020', resolucion: { tipo: 'usar_existente', tercero_id: uid(1020) } });
  const r = await aplicar([crear(21, d)]);
  assert.equal(r.resultados[0].status, 'ok');
  const t = await one(`select es_cliente, es_proveedor from terceros where id = $1`, [uid(1020)]);
  assert.equal(t.es_cliente, true);
  assert.equal(t.es_proveedor, true);
});

await test('[RF-SYN-06] usar_existente con id inexistente o borrado → E_REF', async () => {
  const d = tercero(6, { telefono: '3100000001', resolucion: { tipo: 'usar_existente', tercero_id: uid(9999) } });
  const r = await aplicar([crear(6, d)]);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(r.resultados[0].error.codigo, 'E_REF');
});

await test('[RF-SYN-06] resolucion con tipo desconocido → DATOS_INVALIDOS', async () => {
  const d = tercero(7, { telefono: '3100000001', resolucion: { tipo: 'fusionar' } });
  const r = await aplicar([crear(7, d)]);
  assert.equal(r.resultados[0].error.codigo, 'DATOS_INVALIDOS');
});

await test('[E2] reenviar la misma op no duplica (ya_aplicada)', async () => {
  const antes = await cuenta();
  const op = crear(30, tercero(30));
  const r1 = await aplicar([op]);
  const r2 = await aplicar([op]);
  assert.equal(r1.resultados[0].status, 'ok');
  assert.equal(r2.resultados[0].status, 'ya_aplicada');
  assert.equal(r2.resultados[0].resultado.id, r1.resultados[0].resultado.id);
  assert.equal(await cuenta(), antes + 1);
});

await test('[E14] flujo completo: revisión y reenvío de la misma op con resolución', async () => {
  const antes = await cuenta();
  const d = tercero(31, { telefono: '3100000001' });
  const r1 = await aplicar([crear(31, d)]);
  assert.equal(r1.resultados[0].status, 'revision');
  const r2 = await aplicar([crear(31, { ...d, resolucion: { tipo: 'usar_existente', tercero_id: uid(1001) } })]);
  assert.equal(r2.resultados[0].status, 'ok');
  assert.equal(r2.resultados[0].resultado.id, uid(1001));
  assert.equal(await cuenta(), antes);
});

await test('[RF-TER-01] nombre vacío o ausente → DATOS_INVALIDOS', async () => {
  for (const [n, nombre] of [[40, '   '], [41, null]]) {
    const r = await aplicar([crear(n, tercero(n, { nombre }))]);
    assert.equal(r.resultados[0].error.codigo, 'DATOS_INVALIDOS', `nombre=${nombre}`);
  }
});

await test('[RF-TER-01] teléfono con muy pocos o demasiados dígitos → DATOS_INVALIDOS', async () => {
  for (const [n, tel] of [[42, '12345'], [43, 'abc'], [44, '1234567890123456']]) {
    const r = await aplicar([crear(n, tercero(n, { telefono: tel }))]);
    assert.equal(r.resultados[0].error.codigo, 'DATOS_INVALIDOS', `tel=${tel}`);
  }
});

await test('[RF-TER-01] sin ningún rol (ni cliente ni proveedor) → DATOS_INVALIDOS', async () => {
  const r = await aplicar([crear(45, tercero(45, { es_proveedor: false, es_cliente: false }))]);
  assert.equal(r.resultados[0].error.codigo, 'DATOS_INVALIDOS');
});

await test('[RF-TER-05] cliente nuevo sin consentimiento de datos → E_CONSENTIMIENTO', async () => {
  const r = await aplicar([crear(46, tercero(46, { es_proveedor: false, es_cliente: true }))]);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(r.resultados[0].error.codigo, 'E_CONSENTIMIENTO');
  const ok = await aplicar([crear(47, tercero(47, { es_proveedor: false, es_cliente: true,
    consentimiento_datos: true, consentimiento_en: '2026-11-17T10:00:00-05:00' }))]);
  assert.equal(ok.resultados[0].status, 'ok');
});

await test('[RF-TER-05] consentimiento sin fecha toma la hora del servidor', async () => {
  const r = await aplicar([crear(48, tercero(48, { es_proveedor: false, es_cliente: true, consentimiento_datos: true }))]);
  assert.equal(r.resultados[0].status, 'ok');
  const t = await one(`select consentimiento_en from terceros where id = $1`, [uid(1048)]);
  assert.ok(t.consentimiento_en);
});

await test('[RF-SYN-01] una op fallida no deja datos a medias y detiene la cola', async () => {
  const antes = await cuenta();
  const r = await aplicar([crear(50, tercero(50, { nombre: '' })), crear(51, tercero(51))]);
  assert.equal(r.detener_cola, true);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(await cuenta(), antes + 1); // la 51 sí se aplica: el lote sigue (PLAN §4.3)
});

await test('[RNF-SEC-02] quien no es miembro recibe NO_AUTORIZADO y no crea nada', async () => {
  await como(USER_X);
  const antes = (await one(`select count(*)::int n from sync_ops`)).n;
  const r = await aplicar([crear(60, tercero(60))]);
  assert.equal(r.resultados[0].error.codigo, 'NO_AUTORIZADO');
  await como(USER_A);
  assert.equal((await q(`select 1 from terceros where id = $1`, [uid(1060)])).length, 0);
  assert.equal((await one(`select count(*)::int n from sync_ops`)).n, antes);
});

await test('[RF-SYN-06] datos tercero.crear: campo con tipo inválido → DATOS_INVALIDOS', async () => {
  const r = await aplicar([crear(61, tercero(61, { latitud: 'norte' }))]);
  assert.equal(r.resultados[0].error.codigo, 'DATOS_INVALIDOS');
});

console.log(`\n${passed} pruebas ok`);
await db.close();
