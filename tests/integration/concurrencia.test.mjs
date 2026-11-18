// T-M1-10 (CAM-40) · [E6] / RN-INV-03: doble venta. Postgres real (Supabase local), conexiones reales.
// Ejecutar: npm run test:integration
import assert from 'node:assert/strict';
import { conectar, sesion, hacerMiembro, rest, contar, uuid, nuevoRunner, articuloConStock, pedidoListo, fisico } from './entorno.mjs';

const { test } = nuevoRunner();
const admin = await conectar();
const socioA = await sesion('socio-a@integracion.test');
const socioB = await sesion('socio-b@integracion.test');
await hacerMiembro(admin, socioA, 'Socio A');
await hacerMiembro(admin, socioB, 'Socio B');
const cli = (await admin.query(`insert into terceros (nombre, es_cliente) values ('Cliente concurrencia', true) returning id`)).rows[0].id;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const finalizar = (c, p) => c.query(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);

console.log('\n[E6] doble venta sobre la última unidad');

await test('[E6][RN-INV-03] dos conexiones se pisan en transacciones: la 2.ª espera el bloqueo y falla con "Stock insuficiente"', async () => {
  const art = await articuloConStock(admin, 1);
  const p1 = await pedidoListo(admin, art, cli);
  const p2 = await pedidoListo(admin, art, cli);
  const c1 = await conectar(); const c2 = await conectar();
  try {
    await c1.query('begin'); await c2.query('begin');
    await finalizar(c1, p1);                                   // c1 toma el bloqueo del artículo y aún no confirma
    const pendiente = finalizar(c2, p2).then(() => ({ ok: true }), (e) => ({ ok: false, e }));
    // c2 debe quedar esperando (prueba de que de verdad hay competencia, no ejecución en serie)
    let esperando = false;
    for (let i = 0; i < 30 && !esperando; i++) {
      await espera(100);
      esperando = (await admin.query(`select 1 from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`)).rowCount > 0;
    }
    assert.ok(esperando, 'la segunda finalización debía quedar esperando el bloqueo de la primera');
    await c1.query('commit');
    const r2 = await pendiente;
    assert.equal(r2.ok, false, 'la segunda finalización debía fallar');
    assert.match(r2.e.message, /Stock insuficiente/);
    await c2.query('rollback');
  } finally { await c1.end(); await c2.end(); }
  assert.equal(await fisico(admin, art), 0, 'el stock nunca queda negativo');
  const est = (await admin.query(`select id, estado from pedidos_venta where id = any($1)`, [[p1, p2]])).rows;
  assert.equal(est.filter((e) => e.estado === 'finalizado').length, 1);
  assert.equal(est.filter((e) => e.estado === 'confirmado').length, 1);
});

await test('[E6][RN-INV-03] 10 rondas de finalizaciones simultáneas (autocommit): siempre exactamente un éxito, un "Stock insuficiente" y stock 0', async () => {
  for (let ronda = 1; ronda <= 10; ronda++) {
    const art = await articuloConStock(admin, 1);
    const p1 = await pedidoListo(admin, art, cli);
    const p2 = await pedidoListo(admin, art, cli);
    const c1 = await conectar(); const c2 = await conectar();
    try {
      const res = await Promise.allSettled([finalizar(c1, p1), finalizar(c2, p2)]);
      const ok = res.filter((r) => r.status === 'fulfilled');
      const ko = res.filter((r) => r.status === 'rejected');
      assert.equal(ok.length, 1, `ronda ${ronda}: debía ganar exactamente uno`);
      assert.equal(ko.length, 1, `ronda ${ronda}: debía fallar exactamente uno`);
      assert.match(ko[0].reason.message, /Stock insuficiente/, `ronda ${ronda}`);
    } finally { await c1.end(); await c2.end(); }
    assert.equal(await fisico(admin, art), 0, `ronda ${ronda}: stock negativo o sin descontar`);
    const movs = (await admin.query(`select count(*)::int n from movimientos_inventario where articulo_id=$1 and tipo='venta'`, [art])).rows[0].n;
    assert.equal(movs, 1, `ronda ${ronda}: debía haber un solo movimiento de venta`);
  }
});

await test('[E6][RN-INV-03] con stock para uno de tres pedidos en carrera, solo uno finaliza y el resto falla', async () => {
  const art = await articuloConStock(admin, 1);
  const ps = [await pedidoListo(admin, art, cli), await pedidoListo(admin, art, cli), await pedidoListo(admin, art, cli)];
  const cs = await Promise.all(ps.map(() => conectar()));
  try {
    const res = await Promise.allSettled(ps.map((p, i) => finalizar(cs[i], p)));
    assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
    for (const r of res.filter((x) => x.status === 'rejected')) assert.match(r.reason.message, /Stock insuficiente/);
  } finally { await Promise.all(cs.map((c) => c.end())); }
  assert.equal(await fisico(admin, art), 0);
});

await test('[E6][RN-INV-03] con 2 unidades y 2 pedidos de 1 en carrera, ambos finalizan (no hay bloqueo de más)', async () => {
  const art = await articuloConStock(admin, 2);
  const p1 = await pedidoListo(admin, art, cli); const p2 = await pedidoListo(admin, art, cli);
  const c1 = await conectar(); const c2 = await conectar();
  try {
    const res = await Promise.allSettled([finalizar(c1, p1), finalizar(c2, p2)]);
    assert.equal(res.filter((r) => r.status === 'fulfilled').length, 2, JSON.stringify(res.map((r) => r.reason?.message)));
  } finally { await c1.end(); await c2.end(); }
  assert.equal(await fisico(admin, art), 0);
});

await test('[E6][RN-INV-03] por la vía real (PostgREST, JWT de dos socios): una finalización gana y la otra recibe "Stock insuficiente"', async () => {
  for (let ronda = 1; ronda <= 5; ronda++) {
    const art = await articuloConStock(admin, 1);
    const p1 = await pedidoListo(admin, art, cli);
    const p2 = await pedidoListo(admin, art, cli);
    const [a, b] = await Promise.all([
      rest(socioA.token, 'PATCH', `pedidos_venta?id=eq.${p1}`, { body: { estado: 'finalizado' }, headers: { Prefer: 'return=representation' } }),
      rest(socioB.token, 'PATCH', `pedidos_venta?id=eq.${p2}`, { body: { estado: 'finalizado' }, headers: { Prefer: 'return=representation' } }),
    ]);
    const exitos = [a, b].filter((r) => r.status < 300);
    const fallos = [a, b].filter((r) => r.status >= 400);
    assert.equal(exitos.length, 1, `ronda ${ronda}: ${a.status} ${b.status}`);
    assert.equal(fallos.length, 1, `ronda ${ronda}`);
    assert.match(JSON.stringify(fallos[0].json), /Stock insuficiente/);
    assert.equal(await fisico(admin, art), 0, `ronda ${ronda}`);
    // el socio también ve el resultado por la vista (sin negativos)
    const v = await rest(socioA.token, 'GET', `v_stock?articulo_id=eq.${art}&select=fisico`);
    assert.equal(Number(v.json[0].fisico), 0);
  }
});

await test('[E6] control: cualquier stock físico negativo en toda la base sería un fallo (la suma del libro nunca baja de 0)', async () => {
  const neg = (await admin.query(`select articulo_id, sum(cantidad) s from movimientos_inventario group by 1 having sum(cantidad) < 0`)).rows;
  assert.deepEqual(neg, []);
  assert.ok((await contar(socioA.token, 'movimientos_inventario')).n > 0);
});

await admin.end();
