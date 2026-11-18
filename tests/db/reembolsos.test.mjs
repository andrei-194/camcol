// Pruebas de la migración 0017_reembolsos.sql (T-M1-18, CAM-97, H-06, D-015). Ejecutar: npm run test:db
// RF-PAG-04/05/06, RN-PAG-02..07, [E16], [E17], [E18]. Postgres real (PGlite). El bloqueo `for update`
// entre dos conexiones no se prueba aquí (una sola conexión): ver tests/integration/reembolsos.test.mjs.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const migracion = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
for (const f of ['0001_core.sql', '0002_sync.sql', '0003_aplicar_ops.sql', '0005_sync_pull.sql', '0006_fix_touch_padre.sql',
                 '0011_candado_finalizados.sql', '0012_compra_apertura.sql', '0013_cerrar_escritura_directa.sql',
                 '0015_validaciones_pedido.sql', '0016_movimientos_solo_internos.sql', '0017_reembolsos.sql']) {
  if (!existsSync(new URL(`../../supabase/migrations/${f}`, import.meta.url))) {
    console.log(`  (aún no existe ${f}: las pruebas de reembolsos deben fallar)`);
    continue;
  }
  await db.exec(migracion(f));
}

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const USER_X = '00000000-0000-0000-0000-0000000000ff';
await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${USER_X}');
  insert into miembros (user_id, nombre) values ('${USER_A}', 'Socio A'), ('${USER_B}', 'Socio B');
  select set_config('request.jwt.claim.sub', '${USER_A}', false);
`);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const como = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rechaza = async (sql, params, patron) => {
  await assert.rejects(() => db.query(sql, params), (e) => patron.test(e.message), `debía rechazarse con ${patron}: ${sql}`);
};
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

let n = 0;
const uid = () => `dddddddd-0000-0000-0000-${String(++n).padStart(12, '0')}`;
const aplicar = async (ops) => (await one(`select aplicar_ops($1::jsonb) r`, [JSON.stringify(ops)])).r;
const reembolsar = (datos, op_id = uid()) => ({ op_id, tipo: 'pago.reembolsar', datos });
const r0 = (r) => r.resultados[0];
const res = (r, i = 0) => r.resultados[i].resultado;
const hoy = (await one(`select (now() at time zone 'America/Bogota')::date::text d`)).d;

// ---------- Datos base: 50 unidades en stock y un cliente ----------
const prov = (await one(`insert into terceros (nombre, es_proveedor) values ('Don Luis', true) returning id`)).id;
const cli = (await one(`insert into terceros (nombre, es_cliente) values ('María', true) returning id`)).id;
const prod = (await one(`insert into productos (nombre, categoria) values ('Café', 'Café') returning id`)).id;
const art = (await one(`insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad)
                        values ($1,$2,'Café 500 g',500,'g') returning id`, [prod, prov])).id;
{
  const o = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
  const it = (await one(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,50,10000) returning id`, [o, art])).id;
  await q(`update ordenes_compra set estado='pedida' where id=$1`, [o]);
  const r = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [o])).id;
  await q(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,50)`, [r, it]);
}
// Pedido de 5 × 20.000 = 100.000 en 'confirmado' (con cobro opcional) o llevado a otro estado.
const pedido = async (cobrado = 0, estado = 'confirmado') => {
  const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,5,20000,20000)`, [p, art]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  if (cobrado) await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'nequi',$2)`, [p, cobrado]);
  if (estado === 'cancelado') await q(`update pedidos_venta set estado='cancelado', motivo_estado='cliente desistió' where id=$1`, [p]);
  if (estado === 'finalizado' || estado === 'devuelto') {
    await q(`update pedidos_venta set estado='finalizado', entrega_tipo='recoge' where id=$1`, [p]);
    if (estado === 'devuelto') await q(`update pedidos_venta set estado='devuelto', motivo_estado='producto dañado' where id=$1`, [p]);
  }
  return p;
};
const neto = async (p) => Number((await one(
  `select coalesce(sum(valor) filter (where direccion='cobro'),0) - coalesce(sum(valor) filter (where direccion='reembolso'),0) n
     from pagos where pedido_venta_id=$1`, [p])).n);
const nMovs = async () => Number((await one(`select count(*) c from movimientos_inventario`)).c);
const estado = async (p) => (await one(`select estado from pedidos_venta where id=$1`, [p])).estado;

console.log('\nEsquema de 0017');

await test('[RN-PAG-01] pagos admite direccion reembolso con motivo y ligadura a PV (CHECK con nombre)', async () => {
  const p = await pedido(40000, 'cancelado');
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor, motivo) values ('reembolso',$1,'efectivo',1000,'prueba')`, [p]);
  const oc = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
  await rechaza(`insert into pagos (direccion, orden_compra_id, medio, valor, motivo) values ('reembolso',$1,'efectivo',1000,'x')`, [oc], /pagos_ligadura_chk|check/i);
  await rechaza(`insert into pagos (direccion, pedido_venta_id, orden_compra_id, medio, valor, motivo) values ('reembolso',$1,$2,'efectivo',1000,'x')`, [p, oc], /pagos_ligadura_chk|check/i);
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor, motivo) values ('otro',$1,'efectivo',1000,'x')`, [p], /pagos_direccion_chk|check/i);
  const nombres = (await q(`select conname from pg_constraint where conrelid = 'pagos'::regclass and contype = 'c'`)).map((c) => c.conname);
  for (const c of ['pagos_direccion_chk', 'pagos_ligadura_chk', 'pagos_motivo_chk']) assert.ok(nombres.includes(c), `falta ${c}`);
});

console.log('\nRN-PAG-02 · control de sobrepago');

await test('[RN-PAG-02] un cobro que deja el cobrado neto sobre el total falla con E_SOBREPAGO; hasta el total se acepta', async () => {
  const p = await pedido(60000);
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',40001)`, [p], /^E_SOBREPAGO:/);
  assert.equal(await neto(p), 60000, 'no se inserta nada');
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',40000)`, [p]);
  assert.equal(await neto(p), 100000);
});

await test('[RN-PAG-02] subir el valor de un cobro por encima del total falla con E_SOBREPAGO; bajarlo se acepta', async () => {
  const p = await pedido(60000);
  const c = (await one(`select id from pagos where pedido_venta_id=$1`, [p])).id;
  await rechaza(`update pagos set valor = 100001 where id=$1`, [c], /^E_SOBREPAGO:/);
  await q(`update pagos set valor = 50000 where id=$1`, [c]);
  assert.equal(await neto(p), 50000);
});

await test('[RN-PAG-02] con el total ya cobrado, 1 más falla con E_SOBREPAGO', async () => {
  const p = await pedido(100000);
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',1)`, [p], /^E_SOBREPAGO:/);
});

await test('[RN-PAG-02] un cobro en un PV cancelado falla con E_ESTADO', async () => {
  const p = await pedido(40000, 'cancelado');
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',1000)`, [p], /^E_ESTADO:/);
});

await test('[RN-PAG-02] los cobros de un PV cancelado no se editan ni se borran (E_ESTADO)', async () => {
  const p = await pedido(40000, 'cancelado');
  const c = (await one(`select id from pagos where pedido_venta_id=$1`, [p])).id;
  await rechaza(`update pagos set valor = 30000 where id=$1`, [c], /^E_ESTADO:/);
  await rechaza(`delete from pagos where id=$1`, [c], /^E_ESTADO:/);
  assert.equal(await neto(p), 40000);
});

await test('[RN-PAG-02] cambiar totales por debajo del cobrado neto falla con E_TOTAL; hasta el cobrado se acepta', async () => {
  const p = await pedido(40000);
  await rechaza(`update pedidos_venta set descuento_valor = 70000 where id=$1`, [p], /^E_TOTAL:/);
  await q(`update pedidos_venta set descuento_valor = 60000 where id=$1`, [p]);
  assert.equal(Number((await one(`select total from pedidos_venta where id=$1`, [p])).total), 40000);
  await rechaza(`update pedidos_venta set descuento_valor = 60001 where id=$1`, [p], /^E_TOTAL:/);
});

await test('[RN-PAG-02] un PV sin cobros puede bajar su total sin restricción', async () => {
  const p = await pedido(0);
  await q(`update pedidos_venta set descuento_valor = 90000 where id=$1`, [p]);
  assert.equal(Number((await one(`select total from pedidos_venta where id=$1`, [p])).total), 10000);
});

console.log('\nRN-PAG-03 · RN-PAG-04 · RN-PAG-05 · RN-PAG-07 · op pago.reembolsar');

await test('[RN-PAG-03] reembolsar un PV confirmado o finalizado falla con E_ESTADO', async () => {
  const p = await pedido(40000);
  const r = await aplicar([reembolsar({ pedido_id: p, valor: 10000, medio: 'nequi', motivo: 'x' })]);
  assert.equal(r0(r).status, 'error'); assert.equal(r0(r).error.codigo, 'E_ESTADO');
  const f = await pedido(100000, 'finalizado');
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: f, valor: 10000, medio: 'nequi', motivo: 'x' })])).error.codigo, 'E_ESTADO');
  assert.equal(await neto(p), 40000);
});

await test('[RN-PAG-03] un reembolso no cambia el estado del PV ni mueve stock', async () => {
  const p = await pedido(40000, 'cancelado');
  const antes = await nMovs();
  const r = await aplicar([reembolsar({ pedido_id: p, valor: 40000, medio: 'efectivo', motivo: 'cliente desistió' })]);
  assert.equal(r0(r).status, 'ok');
  assert.equal(await estado(p), 'cancelado');
  assert.equal(await nMovs(), antes);
});

await test('[RN-PAG-04] el valor debe ser > 0, entero y numérico (DATOS_INVALIDOS)', async () => {
  const p = await pedido(40000, 'cancelado');
  for (const valor of [0, -5, 1500.5, 'abc', null]) {
    const r = await aplicar([reembolsar({ pedido_id: p, valor, medio: 'efectivo', motivo: 'x' })]);
    assert.equal(r0(r).error?.codigo, 'DATOS_INVALIDOS', `valor ${valor}`);
  }
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor, motivo) values ('reembolso',$1,'efectivo',0,'x')`, [p], /./);
  assert.equal(await neto(p), 40000);
});

await test('[RN-PAG-04] el tope es el cobrado neto: parciales hasta 0 y 1 más falla con E_SOBREPAGO', async () => {
  const p = await pedido(40000, 'cancelado');
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 40001, medio: 'efectivo', motivo: 'x' })])).error.codigo, 'E_SOBREPAGO');
  assert.equal(await neto(p), 40000, 'no se inserta nada');
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 15000, medio: 'efectivo', motivo: 'x' })])).status, 'ok');
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 25000, medio: 'efectivo', motivo: 'x' })])).status, 'ok');
  assert.equal(await neto(p), 0);
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 1, medio: 'efectivo', motivo: 'x' })])).error.codigo, 'E_SOBREPAGO');
});

await test('[RN-PAG-04] reembolsar un PV sin cobros falla con E_SOBREPAGO', async () => {
  const p = await pedido(0, 'cancelado');
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 1000, medio: 'efectivo', motivo: 'x' })])).error.codigo, 'E_SOBREPAGO');
});

await test('[RN-PAG-04] el trigger aplica el tope también en SQL directo (E_SOBREPAGO / E_ESTADO)', async () => {
  const p = await pedido(40000, 'cancelado');
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor, motivo) values ('reembolso',$1,'efectivo',40001,'x')`, [p], /^E_SOBREPAGO:/);
  const c = await pedido(40000);
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor, motivo) values ('reembolso',$1,'efectivo',1000,'x')`, [c], /^E_ESTADO:/);
});

await test('[RN-PAG-05] un reembolso sin motivo (ausente, vacío o en blanco) falla con DATOS_INVALIDOS, en la op y en SQL directo', async () => {
  const p = await pedido(40000, 'cancelado');
  for (const motivo of [undefined, '', '   ']) {
    const r = await aplicar([reembolsar({ pedido_id: p, valor: 1000, medio: 'efectivo', motivo })]);
    assert.equal(r0(r).error?.codigo, 'DATOS_INVALIDOS', `motivo ${JSON.stringify(motivo)}`);
  }
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor, motivo) values ('reembolso',$1,'efectivo',1000,'  ')`, [p], /^DATOS_INVALIDOS:/);
  assert.equal(await neto(p), 40000);
});

await test('[RN-PAG-05] el medio debe ser válido (DATOS_INVALIDOS)', async () => {
  const p = await pedido(40000, 'cancelado');
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 1000, medio: 'bitcoin', motivo: 'x' })])).error.codigo, 'DATOS_INVALIDOS');
});

await test('[RN-PAG-05] un reembolso registrado no se edita ni se borra (E_PAGO_INMUTABLE)', async () => {
  const p = await pedido(40000, 'cancelado');
  const r = await aplicar([reembolsar({ pedido_id: p, valor: 10000, medio: 'efectivo', motivo: 'x' })]);
  const id = res(r).pago_id;
  await rechaza(`update pagos set valor = 5000 where id=$1`, [id], /^E_PAGO_INMUTABLE:/);
  await rechaza(`update pagos set motivo = 'otro' where id=$1`, [id], /^E_PAGO_INMUTABLE:/);
  await rechaza(`delete from pagos where id=$1`, [id], /^E_PAGO_INMUTABLE:/);
  assert.equal(await neto(p), 30000);
});

await test('[RN-PAG-07] la op devuelve {pago_id, pedido_id, valor, cobrado_neto_restante, por_reembolsar} y guarda motivo, medio, referencia, pagado_por y quién', async () => {
  const p = await pedido(40000, 'cancelado');
  const r = await aplicar([reembolsar({ pedido_id: p, valor: 15000, medio: 'nequi', motivo: 'cliente desistió', referencia: 'NEQ-123', pagado_por: USER_B })]);
  assert.equal(r0(r).status, 'ok');
  const x = res(r);
  assert.equal(x.pedido_id, p); assert.equal(Number(x.valor), 15000);
  assert.equal(Number(x.cobrado_neto_restante), 25000); assert.equal(x.por_reembolsar, true);
  const g = await one(`select * from pagos where id=$1`, [x.pago_id]);
  assert.equal(g.direccion, 'reembolso'); assert.equal(g.pedido_venta_id, p); assert.equal(g.orden_compra_id, null);
  assert.equal(g.medio, 'nequi'); assert.equal(g.motivo, 'cliente desistió'); assert.equal(g.referencia, 'NEQ-123');
  assert.equal(g.pagado_por, USER_B); assert.equal(g.created_by, USER_A); assert.equal(g.op_id, null);
  const ultimo = await aplicar([reembolsar({ pedido_id: p, valor: 25000, medio: 'nequi', motivo: 'resto' })]);
  assert.equal(res(ultimo).por_reembolsar, false); assert.equal(Number(res(ultimo).cobrado_neto_restante), 0);
});

await test('[RN-PAG-07] repetir la misma op (mismo op_id) responde ya_aplicada y deja un solo reembolso', async () => {
  const p = await pedido(40000, 'cancelado');
  const op = reembolsar({ pedido_id: p, valor: 10000, medio: 'efectivo', motivo: 'x' });
  const a = await aplicar([op]);
  const b = await aplicar([op]);
  assert.equal(r0(a).status, 'ok'); assert.equal(r0(b).status, 'ya_aplicada');
  assert.equal(res(b).pago_id, res(a).pago_id);
  assert.equal(Number((await one(`select count(*) c from pagos where pedido_venta_id=$1 and direccion='reembolso'`, [p])).c), 1);
  assert.equal(await neto(p), 30000);
});

await test('[RN-PAG-07] pedido inexistente o borrado y pagado_por ajeno → E_REF; fecha futura → E_FECHA; fecha ilegible → DATOS_INVALIDOS', async () => {
  const p = await pedido(40000, 'cancelado');
  const base = { valor: 1000, medio: 'efectivo', motivo: 'x' };
  assert.equal(r0(await aplicar([reembolsar({ ...base, pedido_id: uid() })])).error.codigo, 'E_REF');
  assert.equal(r0(await aplicar([reembolsar({ ...base, pedido_id: p, pagado_por: USER_X })])).error.codigo, 'E_REF');
  const b = await pedido(40000, 'cancelado');
  await q(`update pedidos_venta set deleted_at = now() where id=$1`, [b]);
  assert.equal(r0(await aplicar([reembolsar({ ...base, pedido_id: b })])).error.codigo, 'E_REF');
  assert.equal(r0(await aplicar([reembolsar({ ...base, pedido_id: p, fecha: '2999-01-01' })])).error.codigo, 'E_FECHA');
  assert.equal(r0(await aplicar([reembolsar({ ...base, pedido_id: p, fecha: 'ayer' })])).error.codigo, 'DATOS_INVALIDOS');
  assert.equal(await neto(p), 40000);
});

await test('[RN-PAG-07] la fecha (sin hora) se guarda a medianoche de Bogotá, sin correr el día', async () => {
  const p = await pedido(40000, 'cancelado');
  const r = await aplicar([reembolsar({ pedido_id: p, valor: 1000, medio: 'efectivo', motivo: 'x', fecha: '2026-11-10' })]);
  const g = await one(`select fecha, (fecha at time zone 'America/Bogota')::date::text dia from pagos where id=$1`, [res(r).pago_id]);
  assert.equal(g.dia, '2026-11-10');
  assert.equal(new Date(g.fecha).toISOString(), '2026-11-10T05:00:00.000Z');
});

await test('[RN-PAG-07] un no miembro recibe NO_AUTORIZADO', async () => {
  const p = await pedido(40000, 'cancelado');
  await como(USER_X);
  try {
    const r = await aplicar([reembolsar({ pedido_id: p, valor: 1000, medio: 'efectivo', motivo: 'x' })]);
    assert.equal(r0(r).error.codigo, 'NO_AUTORIZADO');
  } finally { await como(USER_A); }
});

console.log('\nRN-PAG-06 · efecto contable y vistas');

await test('[RN-PAG-06] v_por_reembolsar lista PV cancelado/devuelto con cobrado neto > 0 y sale al reembolsar todo; v_cuentas_por_cobrar no cambia', async () => {
  const p = await pedido(40000, 'cancelado');
  const conf = await pedido(40000);
  const sin = await pedido(0, 'cancelado');
  let v = await q(`select * from v_por_reembolsar where pedido_id = any($1)`, [[p, conf, sin]]);
  assert.equal(v.length, 1); assert.equal(v[0].pedido_id, p);
  assert.equal(v[0].cliente_id, cli); assert.equal(v[0].cliente, 'María'); assert.equal(v[0].estado, 'cancelado');
  assert.deepEqual([v[0].total, v[0].cobrado, v[0].reembolsado, v[0].por_reembolsar].map(Number), [100000, 40000, 0, 40000]);
  await aplicar([reembolsar({ pedido_id: p, valor: 15000, medio: 'efectivo', motivo: 'x' })]);
  v = await q(`select * from v_por_reembolsar where pedido_id=$1`, [p]);
  assert.deepEqual([v[0].cobrado, v[0].reembolsado, v[0].por_reembolsar].map(Number), [40000, 15000, 25000]);
  await aplicar([reembolsar({ pedido_id: p, valor: 25000, medio: 'efectivo', motivo: 'x' })]);
  assert.equal((await q(`select 1 from v_por_reembolsar where pedido_id=$1`, [p])).length, 0);
  assert.equal((await q(`select 1 from v_cuentas_por_cobrar where pedido_id=$1`, [conf])).length, 1);
  assert.equal((await q(`select 1 from v_cuentas_por_cobrar where pedido_id=$1`, [p])).length, 0);
});

await test('[RN-PAG-06] v_por_reembolsar no lista pedidos borrados', async () => {
  const p = await pedido(40000, 'cancelado');
  await q(`update pedidos_venta set deleted_at = now() where id=$1`, [p]);
  assert.equal((await q(`select 1 from v_por_reembolsar where pedido_id=$1`, [p])).length, 0);
});

await test('[RN-PAG-06] resumen_periodo agrega la columna reembolsos (Σ del periodo, día de Bogotá) sin tocar ventas ni utilidad', async () => {
  const antes = await one(`select * from resumen_periodo('2026-11-01', '2026-11-30')`);
  assert.ok('reembolsos' in antes, 'falta la columna reembolsos');
  const p = await pedido(40000, 'cancelado');
  await aplicar([reembolsar({ pedido_id: p, valor: 10000, medio: 'efectivo', motivo: 'x', fecha: '2026-11-10' })]);
  await aplicar([reembolsar({ pedido_id: p, valor: 5000, medio: 'efectivo', motivo: 'x', fecha: '2026-10-20' })]);
  const nov = await one(`select * from resumen_periodo('2026-11-01', '2026-11-30')`);
  const oct = await one(`select * from resumen_periodo('2026-10-01', '2026-10-31')`);
  assert.equal(Number(nov.reembolsos) - Number(antes.reembolsos), 10000);
  assert.equal(Number(oct.reembolsos), 5000);
  for (const k of ['pedidos', 'ventas_netas', 'costo_mercancia', 'gastos', 'utilidad_neta', 'compras_periodo']) {
    assert.equal(Number(nov[k]), Number(antes[k]), `${k} no debe cambiar por un reembolso`);
  }
});

console.log('\nRegresión de 0011');

await test('[RN-PAG-01] un cobro en un PV finalizado o devuelto sigue rechazado por el candado de 0011', async () => {
  const f = await pedido(100000, 'finalizado');
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',1)`, [f], /RN-PAG-01/);
  const d = await pedido(100000, 'devuelto');
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',1)`, [d], /RN-PAG-01/);
});

console.log('\nEscenarios E16 · E17 · E18');

await test('[E16] cancelar con cobro parcial: por reembolsar 40.000; reembolsos 15.000 y 25.000; 1 más → E_SOBREPAGO', async () => {
  const p = await pedido(40000);
  const antes = await nMovs();
  await q(`update pedidos_venta set estado='cancelado', motivo_estado='cliente desistió' where id=$1`, [p]);
  assert.equal(await nMovs(), antes, 'cancelar no mueve stock');
  assert.equal(Number((await one(`select por_reembolsar from v_por_reembolsar where pedido_id=$1`, [p])).por_reembolsar), 40000);
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 15000, medio: 'efectivo', motivo: 'parcial' })])).status, 'ok');
  assert.equal(await neto(p), 25000);
  assert.equal(Number((await one(`select por_reembolsar from v_por_reembolsar where pedido_id=$1`, [p])).por_reembolsar), 25000);
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 25000, medio: 'efectivo', motivo: 'resto' })])).status, 'ok');
  assert.equal(await neto(p), 0);
  assert.equal((await q(`select 1 from v_por_reembolsar where pedido_id=$1`, [p])).length, 0);
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 1, medio: 'efectivo', motivo: 'uno más' })])).error.codigo, 'E_SOBREPAGO');
});

await test('[E17] devolver un PV finalizado y reembolsar: stock repuesto, queda por reembolsar 100.000, reembolsos en resumen_periodo, ventas y utilidad intactas', async () => {
  const p = await pedido(100000, 'finalizado');
  const dia = hoy;
  const conPedido = await one(`select * from resumen_periodo($1::date, $1::date)`, [dia]);
  await q(`update pedidos_venta set estado='devuelto', motivo_estado='producto dañado' where id=$1`, [p]);
  assert.ok(Number((await one(`select count(*) c from movimientos_inventario m join pedidos_venta_items i on i.id = m.pedido_venta_item_id where m.tipo='devolucion_cliente' and i.pedido_id=$1`, [p])).c) > 0, 'stock repuesto');
  assert.equal(Number((await one(`select por_reembolsar from v_por_reembolsar where pedido_id=$1`, [p])).por_reembolsar), 100000);
  const antes = await one(`select * from resumen_periodo($1::date, $1::date)`, [dia]);
  assert.ok(Number(conPedido.pedidos) > Number(antes.pedidos), 'el devuelto dejó de contar en ventas');
  const r = await aplicar([reembolsar({ pedido_id: p, valor: 100000, medio: 'transferencia', motivo: 'devolución total', fecha: dia })]);
  assert.equal(r0(r).status, 'ok');
  assert.equal(await estado(p), 'devuelto');
  assert.equal(await neto(p), 0);
  const despues = await one(`select * from resumen_periodo($1::date, $1::date)`, [dia]);
  assert.equal(Number(despues.reembolsos) - Number(antes.reembolsos), 100000);
  for (const k of ['pedidos', 'ventas_netas', 'costo_mercancia', 'utilidad_neta']) assert.equal(Number(despues[k]), Number(antes[k]), k);
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',1)`, [p], /RN-PAG-01/);
});

await test('[E18] sobrepago y estados no reembolsables', async () => {
  const p = await pedido(100000);
  await rechaza(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',1)`, [p], /^E_SOBREPAGO:/);
  assert.equal(await neto(p), 100000);
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: p, valor: 1000, medio: 'efectivo', motivo: 'x' })])).error.codigo, 'E_ESTADO');
  const sin = await pedido(0, 'cancelado');
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: sin, valor: 1000, medio: 'efectivo', motivo: 'x' })])).error.codigo, 'E_SOBREPAGO');
  const c = await pedido(40000, 'cancelado');
  assert.equal(r0(await aplicar([reembolsar({ pedido_id: c, valor: 1000, medio: 'efectivo', motivo: '' })])).error.codigo, 'DATOS_INVALIDOS');
  const op = reembolsar({ pedido_id: c, valor: 1000, medio: 'efectivo', motivo: 'ok' });
  assert.equal(r0(await aplicar([op])).status, 'ok');
  assert.equal(r0(await aplicar([op])).status, 'ya_aplicada');
  assert.equal(Number((await one(`select count(*) c from pagos where pedido_venta_id=$1 and direccion='reembolso'`, [c])).c), 1);
  const id = (await one(`select id from pagos where pedido_venta_id=$1 and direccion='reembolso'`, [c])).id;
  await rechaza(`update pagos set valor = 2 where id=$1`, [id], /^E_PAGO_INMUTABLE:/);
  await rechaza(`delete from pagos where id=$1`, [id], /^E_PAGO_INMUTABLE:/);
});

console.log('\nsync_pull con reembolsos');

await test('[RF-PAG-06] sync_pull trae cobros y reembolsos en pagos (campo direccion) y un reembolso mueve el cursor del pedido', async () => {
  const p = await pedido(40000);
  const cursor = (await one(`select sync_pull(null) s`)).s.cursor;
  await q(`update pedidos_venta set estado='cancelado', motivo_estado='cliente desistió' where id=$1`, [p]);
  const pull1 = (await one(`select sync_pull($1::timestamptz) s`, [cursor])).s;
  const antes = pull1.pedidos_venta.find((x) => x.id === p);
  assert.ok(antes, 'el PV cancelado llega por el cursor');
  assert.deepEqual(antes.pagos.map((g) => g.direccion), ['cobro']);
  await aplicar([reembolsar({ pedido_id: p, valor: 15000, medio: 'efectivo', motivo: 'parcial' })]);
  const pull2 = (await one(`select sync_pull($1::timestamptz) s`, [pull1.cursor])).s;
  const ped = pull2.pedidos_venta.find((x) => x.id === p);
  assert.ok(ped, 'un reembolso mueve el cursor del pedido');
  assert.deepEqual(ped.pagos.map((g) => g.direccion).sort(), ['cobro', 'reembolso']);
  const reemb = ped.pagos.find((g) => g.direccion === 'reembolso');
  assert.equal(Number(reemb.valor), 15000); assert.equal(reemb.motivo, 'parcial');
  const neto2 = ped.pagos.reduce((s, g) => s + (g.direccion === 'cobro' ? 1 : -1) * Number(g.valor), 0);
  assert.equal(neto2, 25000);
});

await test('[RF-PAG-06] en el snapshot inicial un devuelto reciente trae sus reembolsos; un cancelado sin finalizado_en no entra', async () => {
  const d = await pedido(100000, 'devuelto');
  await aplicar([reembolsar({ pedido_id: d, valor: 100000, medio: 'efectivo', motivo: 'devolución' })]);
  const c = await pedido(40000, 'cancelado');
  const s = (await one(`select sync_pull(null) s`)).s;
  const pd = s.pedidos_venta.find((x) => x.id === d);
  assert.ok(pd, 'el devuelto reciente está en el snapshot');
  assert.deepEqual(pd.pagos.map((g) => g.direccion).sort(), ['cobro', 'reembolso']);
  assert.equal(s.pedidos_venta.find((x) => x.id === c), undefined);
});

await test('[RF-SYN-08] los pagos de una OC siguen viajando con direccion pago, sin reembolsos', async () => {
  const oc = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
  await q(`insert into pagos (direccion, orden_compra_id, medio, valor) values ('pago',$1,'efectivo',1000)`, [oc]);
  const s = (await one(`select sync_pull(null) s`)).s;
  const o = s.ordenes_compra.find((x) => x.id === oc);
  assert.deepEqual(o.pagos.map((g) => g.direccion), ['pago']);
});

console.log(`\n${passed} pruebas pasaron${process.exitCode ? ' (hay fallas)' : ''}`);
