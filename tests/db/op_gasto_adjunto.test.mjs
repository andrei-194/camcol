// Pruebas de la migración 0009_op_gasto_adjunto.sql en Postgres real (PGlite). Ejecutar: npm run test:db
// T-M1-07 (CAM-37) · RF-PAG-03, RF-SYN-09, RF-SYN-06: ops gasto.registrar y adjunto.vincular.
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
for (const f of ['0001_core.sql', '0002_sync.sql', '0003_aplicar_ops.sql', '0009_op_gasto_adjunto.sql']) {
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

const uid = (n) => `cccccccc-0000-0000-0000-${String(n).padStart(12, '0')}`;
const aplicar = async (ops) => (await one(`select aplicar_ops($1::jsonb) r`, [JSON.stringify(ops)])).r;
const gasto = (n, datos) => ({ op_id: uid(n), tipo: 'gasto.registrar', datos });
const adjunto = (n, datos) => ({ op_id: uid(n), tipo: 'adjunto.vincular', datos });
const error = (r, i = 0) => r.resultados[i].error?.codigo;

// Datos base: un proveedor, una compra, un pedido, una recepción y un pago a la compra
const PROV = uid(900), OC = uid(901), PV = uid(902), CLI = uid(903), PAGO = uid(904), REC = uid(905);
await db.exec(`
  insert into terceros (id, nombre, es_proveedor) values ('${PROV}', 'Finca Base', true);
  insert into terceros (id, nombre, es_cliente) values ('${CLI}', 'Cliente Base', true);
  insert into ordenes_compra (id, proveedor_id) values ('${OC}', '${PROV}');
  insert into pedidos_venta (id, cliente_id) values ('${PV}', '${CLI}');
  insert into recepciones (id, orden_id) values ('${REC}', '${OC}');
  insert into pagos (id, direccion, orden_compra_id, medio, valor) values ('${PAGO}', 'pago', '${OC}', 'efectivo', 1000);
`);

console.log('\nT-M1-07 · gasto.registrar');

await test('[RF-SYN-06] los tipos gasto.registrar y adjunto.vincular están registrados en tipos_op', async () => {
  const t = await q(`select tipo from tipos_op where tipo in ('gasto.registrar','adjunto.vincular') order by tipo`);
  assert.deepEqual(t.map((x) => x.tipo), ['adjunto.vincular', 'gasto.registrar']);
});

await test('[RF-PAG-03] registra un gasto con todos sus campos', async () => {
  const d = { id: uid(1), categoria: 'combustible', concepto: 'Gasolina Cajibío', valor: 85000,
    fecha: '2026-11-16', orden_compra_id: OC, pedido_venta_id: PV, pagado_por: USER_A };
  const r = await aplicar([gasto(1, d)]);
  assert.equal(r.resultados[0].status, 'ok');
  assert.equal(r.resultados[0].resultado.id, d.id);
  const g = await one(`select * from gastos where id = $1`, [d.id]);
  assert.equal(g.categoria, 'combustible');
  assert.equal(g.concepto, 'Gasolina Cajibío');
  assert.equal(Number(g.valor), 85000);
  assert.equal(g.orden_compra_id, OC);
  assert.equal(g.pedido_venta_id, PV);
  assert.equal(g.pagado_por, USER_A);
});

await test('[RF-PAG-03] el id es opcional y la fecha por defecto es hoy en Bogotá', async () => {
  const r = await aplicar([gasto(2, { categoria: 'empaques', valor: 12000 })]);
  assert.equal(r.resultados[0].status, 'ok');
  const g = await one(`select fecha::text f, concepto from gastos where id = $1`, [r.resultados[0].resultado.id]);
  const hoy = (await one(`select (now() at time zone 'America/Bogota')::date::text d`)).d;
  assert.equal(g.f, hoy);
  assert.equal(g.concepto, null);
});

await test('[RF-PAG-03] el gasto entra al resumen del periodo y baja la utilidad neta', async () => {
  const antes = await one(`select gastos, utilidad_neta from resumen_periodo('2026-01-01', '2026-12-31')`);
  await aplicar([gasto(3, { categoria: 'transporte', valor: 40000, fecha: '2026-11-10' })]);
  const despues = await one(`select gastos, utilidad_neta from resumen_periodo('2026-01-01', '2026-12-31')`);
  assert.equal(Number(despues.gastos) - Number(antes.gastos), 40000);
  assert.equal(Number(antes.utilidad_neta) - Number(despues.utilidad_neta), 40000);
});

await test('[RF-PAG-03] un gasto fuera del periodo no entra al resumen', async () => {
  const antes = await one(`select gastos from resumen_periodo('2026-11-01', '2026-11-30')`);
  await aplicar([gasto(4, { categoria: 'otros', valor: 7000, fecha: '2025-01-05' })]);
  const despues = await one(`select gastos from resumen_periodo('2026-11-01', '2026-11-30')`);
  assert.equal(Number(despues.gastos), Number(antes.gastos));
});

await test('[RF-PAG-03] valor cero o negativo se rechaza con DATOS_INVALIDOS', async () => {
  for (const [i, v] of [0, -500].entries()) {
    const r = await aplicar([gasto(10 + i, { categoria: 'x', valor: v })]);
    assert.equal(r.resultados[0].status, 'error');
    assert.equal(error(r), 'DATOS_INVALIDOS');
  }
  assert.equal((await one(`select count(*)::int n from gastos where valor in (0, -500)`, [])).n, 0);
});

await test('[RF-PAG-03] valor ausente, no numérico o con decimales (COP) se rechaza', async () => {
  const casos = [undefined, 'abc', 1500.5];
  for (const [i, v] of casos.entries()) {
    const r = await aplicar([gasto(20 + i, { categoria: 'x', valor: v })]);
    assert.equal(r.resultados[0].status, 'error', `valor ${v}`);
    assert.equal(error(r), 'DATOS_INVALIDOS');
  }
});

await test('[RF-PAG-03] categoría vacía o ausente se rechaza', async () => {
  for (const [i, c] of [undefined, '', '   '].entries()) {
    const r = await aplicar([gasto(30 + i, { categoria: c, valor: 1000 })]);
    assert.equal(error(r), 'DATOS_INVALIDOS');
  }
});

await test('[RF-PAG-03] fecha futura (más de 1 día) se rechaza con E_FECHA', async () => {
  const r = await aplicar([gasto(40, { categoria: 'x', valor: 1000, fecha: '2999-01-01' })]);
  assert.equal(error(r), 'E_FECHA');
});

await test('[RF-PAG-03] fecha con formato inválido se rechaza con DATOS_INVALIDOS', async () => {
  const r = await aplicar([gasto(41, { categoria: 'x', valor: 1000, fecha: 'ayer' })]);
  assert.equal(error(r), 'DATOS_INVALIDOS');
});

await test('[RF-PAG-03] vínculo a compra, pedido o socio inexistente se rechaza con E_REF', async () => {
  const falso = uid(777);
  for (const [i, extra] of [{ orden_compra_id: falso }, { pedido_venta_id: falso }, { pagado_por: falso }].entries()) {
    const r = await aplicar([gasto(50 + i, { categoria: 'x', valor: 1000, ...extra })]);
    assert.equal(error(r), 'E_REF', JSON.stringify(extra));
  }
});

await test('[RF-SYN-06] reenviar el mismo op_id no duplica el gasto (ya_aplicada)', async () => {
  const op = gasto(60, { id: uid(60), categoria: 'x', valor: 3000 });
  await aplicar([op]);
  const r = await aplicar([op]);
  assert.equal(r.resultados[0].status, 'ya_aplicada');
  assert.equal((await one(`select count(*)::int n from gastos where id = $1`, [uid(60)])).n, 1);
});

await test('[RF-SYN-06] el mismo op_id repetido en un lote se aplica una sola vez', async () => {
  const op = gasto(61, { id: uid(61), categoria: 'x', valor: 3000 });
  const r = await aplicar([op, op]);
  assert.deepEqual(r.resultados.map((x) => x.status), ['ok', 'ya_aplicada']);
  assert.equal((await one(`select count(*)::int n from gastos where id = $1`, [uid(61)])).n, 1);
});

await test('[RF-SYN-06] un id de gasto ya existente con otro op_id no se duplica (E_DUPLICADO)', async () => {
  await aplicar([gasto(62, { id: uid(62), categoria: 'x', valor: 1000 })]);
  const r = await aplicar([gasto(63, { id: uid(62), categoria: 'x', valor: 1000 })]);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(error(r), 'E_DUPLICADO');
});

console.log('\nT-M1-07 · adjunto.vincular');

await test('[RF-SYN-09] vincula un archivo a un gasto', async () => {
  const g = (await aplicar([gasto(70, { id: uid(70), categoria: 'x', valor: 1000 })])).resultados[0].resultado.id;
  const d = { id: uid(71), entidad: 'gasto', entidad_id: g, path: `gastos/${g}/foto.webp`, mime: 'image/webp' };
  const r = await aplicar([adjunto(71, d)]);
  assert.equal(r.resultados[0].status, 'ok');
  assert.equal(r.resultados[0].resultado.id, d.id);
  const a = await one(`select * from adjuntos where id = $1`, [d.id]);
  assert.equal(a.entidad, 'gasto');
  assert.equal(a.entidad_id, g);
  assert.equal(a.path, d.path);
  assert.equal(a.mime, 'image/webp');
});

await test('[RF-SYN-09] vincula a un pago, una recepción y una compra', async () => {
  const casos = [['pago', PAGO], ['recepcion', REC], ['orden_compra', OC]];
  for (const [i, [entidad, id]] of casos.entries()) {
    const r = await aplicar([adjunto(80 + i, { entidad, entidad_id: id, path: `s/${entidad}.webp`, mime: 'image/webp' })]);
    assert.equal(r.resultados[0].status, 'ok', entidad);
  }
});

await test('[RF-SYN-09] el id del adjunto es opcional y el mime también', async () => {
  const r = await aplicar([adjunto(85, { entidad: 'pago', entidad_id: PAGO, path: 's/sin-mime.webp' })]);
  assert.equal(r.resultados[0].status, 'ok');
  assert.match(r.resultados[0].resultado.id, /^[0-9a-f-]{36}$/);
});

await test('[RF-SYN-09] entidad inexistente se rechaza con E_REF y no deja fila', async () => {
  const r = await aplicar([adjunto(90, { entidad: 'gasto', entidad_id: uid(778), path: 's/x.webp' })]);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(error(r), 'E_REF');
  assert.equal((await one(`select count(*)::int n from adjuntos where entidad_id = $1`, [uid(778)])).n, 0);
});

await test('[RF-SYN-09] un gasto borrado lógicamente cuenta como inexistente', async () => {
  const g = (await aplicar([gasto(91, { id: uid(91), categoria: 'x', valor: 1000 })])).resultados[0].resultado.id;
  await db.exec(`update gastos set deleted_at = now() where id = '${g}'`);
  const r = await aplicar([adjunto(92, { entidad: 'gasto', entidad_id: g, path: 's/x.webp' })]);
  assert.equal(error(r), 'E_REF');
});

await test('[RF-SYN-09] tipo de entidad desconocido, o path vacío o ausente, se rechaza con DATOS_INVALIDOS', async () => {
  const malos = [
    { entidad: 'pedido_venta', entidad_id: PV, path: 's/x.webp' },
    { entidad: 'pago', entidad_id: PAGO, path: '' },
    { entidad: 'pago', entidad_id: PAGO },
    { entidad_id: PAGO, path: 's/x.webp' },
    { entidad: 'pago', path: 's/x.webp' },
  ];
  for (const [i, d] of malos.entries()) {
    const r = await aplicar([adjunto(100 + i, d)]);
    assert.equal(error(r), 'DATOS_INVALIDOS', JSON.stringify(d));
  }
});

await test('[RF-SYN-09] reenviar el mismo op_id no duplica el adjunto (ya_aplicada)', async () => {
  const op = adjunto(110, { id: uid(110), entidad: 'pago', entidad_id: PAGO, path: 's/dup.webp' });
  await aplicar([op]);
  const r = await aplicar([op]);
  assert.equal(r.resultados[0].status, 'ya_aplicada');
  assert.equal((await one(`select count(*)::int n from adjuntos where id = $1`, [uid(110)])).n, 1);
});

console.log('\nT-M1-07 · seguridad');

await test('[RF-SYN-06] quien no es miembro recibe NO_AUTORIZADO en ambas ops', async () => {
  await como(USER_X);
  const r = await aplicar([
    gasto(120, { categoria: 'x', valor: 1000 }),
    adjunto(121, { entidad: 'pago', entidad_id: PAGO, path: 's/x.webp' }),
  ]);
  await como(USER_A);
  assert.deepEqual(r.resultados.map((x) => x.error?.codigo), ['NO_AUTORIZADO', 'NO_AUTORIZADO']);
});

await test('[RF-SYN-06] las funciones de las ops son SECURITY INVOKER con search_path fijo', async () => {
  const f = await q(`select p.proname, p.prosecdef, p.proconfig from pg_proc p
    where p.proname in ('op_gasto_registrar','op_adjunto_vincular')`);
  assert.equal(f.length, 2);
  for (const x of f) {
    assert.equal(x.prosecdef, false, x.proname);
    assert.ok((x.proconfig || []).some((c) => c.startsWith('search_path=')), x.proname);
  }
});

console.log(`\n${passed} pruebas OK`);
