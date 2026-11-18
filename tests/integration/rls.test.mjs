// T-M1-10 (CAM-40) · RNF-SEC-02 / [E12]: RLS con JWT reales vía PostgREST (Supabase local).
// Ejecutar: npm run test:integration
import assert from 'node:assert/strict';
import { conectar, sesion, hacerMiembro, rest, rpc, aplicarOps, contar, uuid, nuevoRunner, articuloConStock, pedidoListo } from './entorno.mjs';

const { test } = nuevoRunner();
const admin = await conectar();
const socio = await sesion('socio-a@integracion.test');
const extrano = await sesion('no-miembro@integracion.test');     // autenticado, pero NO es socio
await hacerMiembro(admin, socio, 'Socio A');
await admin.query(`delete from miembros where user_id = $1`, [extrano.id]);

// Hay datos en las tablas principales para que "0 filas" signifique algo.
const cli = (await admin.query(`insert into terceros (nombre, es_cliente) values ('Cliente RLS', true) returning id`)).rows[0].id;
const art = await articuloConStock(admin, 5);
const ped = await pedidoListo(admin, art, cli);
await admin.query(`insert into gastos (categoria, valor) values ('Prueba RLS', 1000)`);
await admin.query(`insert into sync_ops (op_id, tipo, estado, resultado) values ($1,'prueba.rls','ok','{}')`, [uuid()]);
await admin.query(`select emitir_documento('confirmacion', $1)`, [ped]);

// Todas las tablas y vistas de public (de la base real, no una lista a mano)
const relaciones = (await admin.query(`
  select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','p') order by 1`)).rows;
const tablas = relaciones.filter((r) => r.relkind === 'r' || r.relkind === 'p').map((r) => r.relname);

console.log(`\n[E12] RLS por JWT vía PostgREST (${relaciones.length} tablas y vistas)`);

await test('[RNF-SEC-02] control: los tokens son JWT reales de Auth y el miembro es miembro, el otro no', async () => {
  assert.equal(socio.token.split('.').length, 3);
  assert.equal((await rpc(socio.token, 'es_miembro')).json, true);
  assert.equal((await rpc(extrano.token, 'es_miembro')).json, false);
});

await test('[RNF-SEC-02] el miembro ve datos: las tablas con filas devuelven las mismas filas que el administrador', async () => {
  let conDatos = 0;
  for (const t of tablas) {
    const real = Number((await admin.query(`select count(*) n from public."${t}"`)).rows[0].n);
    const vis = await contar(socio.token, t);
    assert.equal(vis.status < 300, true, `${t}: el miembro debe poder leerla (HTTP ${vis.status})`);
    assert.equal(vis.n, real, `${t}: el miembro ve ${vis.n} de ${real} filas`);
    if (real > 0) conDatos++;
  }
  assert.ok(conDatos >= 8, `se esperaban varias tablas con datos, hay ${conDatos}`);
  const t = await rest(socio.token, 'GET', `terceros?id=eq.${cli}&select=nombre`);
  assert.deepEqual(t.json, [{ nombre: 'Cliente RLS' }]);
});

await test('[RNF-SEC-02][E12] un autenticado que NO es miembro ve 0 filas en TODAS las tablas', async () => {
  for (const t of tablas) {
    const v = await contar(extrano.token, t);
    assert.ok(v.status < 300 && v.n === 0, `${t}: no miembro ve ${v.n} filas (HTTP ${v.status})`);
  }
});

await test('[RNF-SEC-02][E12] ... y 0 filas en TODAS las vistas (security_invoker)', async () => {
  const vistas = relaciones.filter((r) => r.relkind === 'v').map((r) => r.relname);
  assert.ok(vistas.length >= 7, `vistas encontradas: ${vistas.join(', ')}`);
  for (const v of vistas) {
    const miembro = await contar(socio.token, v);
    assert.ok(miembro.status < 300, `${v}: miembro HTTP ${miembro.status}`);
    const n = await contar(extrano.token, v);
    assert.ok(n.status < 300 && n.n === 0, `${v}: no miembro ve ${n.n} filas (HTTP ${n.status})`);
  }
  const stock = await rest(socio.token, 'GET', `v_stock?articulo_id=eq.${art}&select=fisico`);
  assert.equal(Number(stock.json[0].fisico), 5, 'el miembro sí ve el stock en la vista');
  assert.deepEqual((await rest(extrano.token, 'GET', `v_stock?articulo_id=eq.${art}`)).json, []);
});

await test('[RNF-SEC-02][E12] el no miembro no puede insertar, editar ni borrar (en cada tabla con datos)', async () => {
  const antes = Number((await admin.query(`select count(*) n from terceros`)).rows[0].n);
  const ins = await rest(extrano.token, 'POST', 'terceros', { body: { nombre: 'Intruso', es_cliente: true } });
  assert.ok(ins.status === 401 || ins.status === 403, `insert terceros: HTTP ${ins.status} ${JSON.stringify(ins.json)}`);
  const gasto = await rest(extrano.token, 'POST', 'gastos', { body: { categoria: 'Intruso', valor: 1 } });
  assert.ok(gasto.status === 401 || gasto.status === 403, `insert gastos: HTTP ${gasto.status}`);
  const pago = await rest(extrano.token, 'POST', 'pagos', { body: { direccion: 'cobro', pedido_venta_id: ped, medio: 'efectivo', valor: 1 } });
  assert.ok(pago.status === 401 || pago.status === 403, `insert pagos: HTTP ${pago.status}`);
  // editar y borrar: RLS filtra la fila, no se afecta nada (200/204 con 0 filas) o se rechaza
  await rest(extrano.token, 'PATCH', `terceros?id=eq.${cli}`, { body: { nombre: 'Hackeado' } });
  await rest(extrano.token, 'DELETE', `terceros?id=eq.${cli}`);
  await rest(extrano.token, 'PATCH', `pedidos_venta?id=eq.${ped}`, { body: { estado: 'cancelado' } });
  const t = (await admin.query(`select nombre from terceros where id=$1`, [cli])).rows[0];
  assert.equal(t?.nombre, 'Cliente RLS');
  assert.equal((await admin.query(`select estado from pedidos_venta where id=$1`, [ped])).rows[0].estado, 'confirmado');
  assert.equal(Number((await admin.query(`select count(*) n from terceros`)).rows[0].n), antes);
  assert.equal(Number((await admin.query(`select count(*) n from terceros where nombre='Intruso'`)).rows[0].n), 0);
});

await test('[RNF-SEC-02][E12] el no miembro no puede usar aplicar_ops: cada op devuelve NO_AUTORIZADO y no se escribe nada', async () => {
  const id = uuid();
  const r = await aplicarOps(extrano.token, [{ op_id: uuid(), tipo: 'tercero.crear', datos: { id, nombre: 'Intruso op', es_proveedor: true } }]);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.resultados[0].status, 'error');
  assert.equal(r.json.resultados[0].error.codigo, 'NO_AUTORIZADO');
  assert.equal(Number((await admin.query(`select count(*) n from terceros where id=$1`, [id])).rows[0].n), 0);
});

await test('[RNF-SEC-02] el no miembro tampoco lee por sync_pull ni emite documentos', async () => {
  const s = await rpc(extrano.token, 'sync_pull', {});
  const filas = JSON.stringify(s.json ?? '');
  assert.ok(s.status >= 400 || !filas.includes('Cliente RLS'), `sync_pull filtra datos: ${filas.slice(0, 200)}`);
  const d = await rpc(extrano.token, 'emitir_documento', { p_tipo: 'remision', p_pedido: ped });
  assert.ok(d.status >= 400, `emitir_documento no debía responder 2xx (HTTP ${d.status})`);
  const m = await rpc(socio.token, 'sync_pull', {});
  assert.equal(m.status, 200);
  assert.ok(JSON.stringify(m.json).includes('Cliente RLS'), 'el miembro sí recibe sus datos por sync_pull');
});

await test('[RNF-SEC-02][E12] sin sesión (solo la anon key) no se lee ni se escribe en ninguna tabla ni vista', async () => {
  for (const r of relaciones) {
    const v = await contar(null, r.relname);
    assert.ok(v.status === 401 || v.status === 403, `${r.relname}: anon HTTP ${v.status} (se esperaba 401/403)`);
  }
  const ins = await rest(null, 'POST', 'terceros', { body: { nombre: 'Anon', es_cliente: true } });
  assert.ok(ins.status === 401 || ins.status === 403, `anon insert: HTTP ${ins.status}`);
});

await admin.end();
