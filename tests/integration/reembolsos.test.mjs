// T-M1-18 (CAM-97) · RN-PAG-02/04, [E16], [E18]: dos conexiones reales compiten por el último saldo.
// Postgres real (Supabase local). El bloqueo `for update` de pagos_reembolso_candado / pagos_sobrepago no se
// puede probar en PGlite (una sola conexión). Ejecutar: npm run test:integration
import assert from 'node:assert/strict';
import { conectar, sesion, hacerMiembro, aplicarOps, uuid, nuevoRunner, articuloConStock, pedidoListo } from './entorno.mjs';

const { test } = nuevoRunner();
const admin = await conectar();
const socioA = await sesion('socio-a@integracion.test');
const socioB = await sesion('socio-b@integracion.test');
await hacerMiembro(admin, socioA, 'Socio A');
await hacerMiembro(admin, socioB, 'Socio B');
const cli = (await admin.query(`insert into terceros (nombre, es_cliente) values ('Cliente reembolsos', true) returning id`)).rows[0].id;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// PV de 20.000 totalmente cobrado y cancelado: 20.000 por reembolsar.
const pedidoCancelado = async () => {
  const art = await articuloConStock(admin, 1);
  const p = await pedidoListo(admin, art, cli, 1, 20000);
  await admin.query(`update pedidos_venta set estado='cancelado', motivo_estado='integración' where id=$1`, [p]);
  return p;
};
const netoDe = async (p) => Number((await admin.query(
  `select coalesce(sum(valor) filter (where direccion='cobro'),0) - coalesce(sum(valor) filter (where direccion='reembolso'),0) n
     from pagos where pedido_venta_id=$1`, [p])).rows[0].n);
const reembolso = (p, valor = 20000) => ({ op_id: uuid(), tipo: 'pago.reembolsar', datos: { pedido_id: p, valor, medio: 'efectivo', motivo: 'integración' } });
const hayEsperaPorBloqueo = async () =>
  (await admin.query(`select 1 from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`)).rowCount > 0;

console.log('\n[E16][E18] doble reembolso sobre el último saldo');

await test('[RN-PAG-04] dos transacciones: la 2.ª espera el bloqueo del pedido y recibe E_SOBREPAGO', async () => {
  const p = await pedidoCancelado();
  const ins = `insert into pagos (direccion, pedido_venta_id, medio, valor, motivo) values ('reembolso',$1,'efectivo',20000,'integración')`;
  const c1 = await conectar(); const c2 = await conectar();
  try {
    await c1.query('begin'); await c2.query('begin');
    await c1.query(ins, [p]);                                   // c1 toma el bloqueo del pedido y aún no confirma
    const pendiente = c2.query(ins, [p]).then(() => ({ ok: true }), (e) => ({ ok: false, e }));
    let esperando = false;
    for (let i = 0; i < 30 && !esperando; i++) { await espera(100); esperando = await hayEsperaPorBloqueo(); }
    assert.ok(esperando, 'el segundo reembolso debía quedar esperando el bloqueo del primero');
    await c1.query('commit');
    const r2 = await pendiente;
    assert.equal(r2.ok, false, 'el segundo reembolso debía fallar');
    assert.match(r2.e.message, /^E_SOBREPAGO:/);
    await c2.query('rollback');
  } finally { await c1.end(); await c2.end(); }
  assert.equal(await netoDe(p), 0);
  assert.equal(Number((await admin.query(`select count(*) c from pagos where pedido_venta_id=$1 and direccion='reembolso'`, [p])).rows[0].c), 1);
});

await test('[RN-PAG-04][E18] 10 rondas de pago.reembolsar simultáneo por aplicar_ops (dos socios): exactamente un ok y un E_SOBREPAGO; neto 0', async () => {
  for (let ronda = 1; ronda <= 10; ronda++) {
    const p = await pedidoCancelado();
    const [a, b] = await Promise.all([aplicarOps(socioA.token, [reembolso(p)]), aplicarOps(socioB.token, [reembolso(p)])]);
    assert.equal(a.status, 200, JSON.stringify(a.json)); assert.equal(b.status, 200, JSON.stringify(b.json));
    const rs = [a.json.resultados[0], b.json.resultados[0]];
    assert.equal(rs.filter((r) => r.status === 'ok').length, 1, `ronda ${ronda}: ${JSON.stringify(rs)}`);
    const ko = rs.filter((r) => r.status === 'error');
    assert.equal(ko.length, 1, `ronda ${ronda}`);
    assert.equal(ko[0].error.codigo, 'E_SOBREPAGO', `ronda ${ronda}`);
    assert.equal(await netoDe(p), 0, `ronda ${ronda}: el neto nunca queda negativo`);
  }
});

await test('[RN-PAG-04] dos reembolsos parciales simultáneos que caben juntos se aplican los dos', async () => {
  const p = await pedidoCancelado();
  const [a, b] = await Promise.all([aplicarOps(socioA.token, [reembolso(p, 10000)]), aplicarOps(socioB.token, [reembolso(p, 10000)])]);
  assert.equal(a.json.resultados[0].status, 'ok', JSON.stringify(a.json));
  assert.equal(b.json.resultados[0].status, 'ok', JSON.stringify(b.json));
  assert.equal(await netoDe(p), 0);
});

console.log('\n[RN-PAG-02] doble cobro sobre el último saldo');

await test('[RN-PAG-02] dos cobros simultáneos del último saldo: uno entra y el otro falla con E_SOBREPAGO', async () => {
  for (let ronda = 1; ronda <= 5; ronda++) {
    const art = await articuloConStock(admin, 1);
    const p = (await admin.query(`insert into pedidos_venta (cliente_id, entrega_tipo) values ($1,'recoge') returning id`, [cli])).rows[0].id;
    await admin.query(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,20000,20000)`, [p, art]);
    await admin.query(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
    const cobrar = async () => { const c = await conectar(); try { return await c.query(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',20000)`, [p]); } finally { await c.end(); } };
    const res = await Promise.allSettled([cobrar(), cobrar()]);
    assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1, `ronda ${ronda}`);
    const ko = res.find((r) => r.status === 'rejected');
    assert.match(ko.reason.message, /^E_SOBREPAGO:/, `ronda ${ronda}`);
    assert.equal(await netoDe(p), 20000, `ronda ${ronda}`);
  }
});

await admin.end();
