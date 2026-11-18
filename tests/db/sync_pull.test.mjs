// Pruebas de la migración 0005_sync_pull.sql en Postgres real (PGlite, WASM). Ejecutar: npm run test:db
// T-M1-08 (CAM-38) · RF-SYN-08: sync_pull simple, un solo cursor (updated_at), snapshot.
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
await db.exec(migracion('0005_sync_pull.sql'));
await db.exec(migracion('0006_fix_touch_padre.sql'));
await db.exec(migracion('0013_cerrar_escritura_directa.sql'));

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_X = '00000000-0000-0000-0000-0000000000ff';
await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_X}');
  insert into miembros (user_id, nombre) values ('${USER_A}', 'Socio A');
  select set_config('request.jwt.claim.sub', '${USER_A}', false);
`);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const pausa = () => q(`select pg_sleep(0.02)`);
const pull = async (desde = null) => (await one(`select sync_pull($1) as r`, [desde])).r;

// Todas las listas de cambios de una respuesta (el stock es derivado y va siempre completo)
const listas = (r) => ({
  productos: r.catalogo.productos, articulos: r.catalogo.articulos, listas_precio: r.catalogo.listas_precio,
  precios: r.catalogo.precios, unidades: r.catalogo.unidades, terceros: r.terceros,
  configuracion: r.configuracion, pedidos_venta: r.pedidos_venta, ordenes_compra: r.ordenes_compra,
});
const vacia = (r) => Object.entries(listas(r)).every(([, v]) => v.length === 0);

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

// ---------- Datos base ----------
const prov = (await one(`insert into terceros (nombre, es_proveedor) values ('Don Luis (finca)', true) returning id`)).id;
const cli  = (await one(`insert into terceros (nombre, es_cliente) values ('María Pérez', true) returning id`)).id;
const prod = (await one(`insert into productos (nombre) values ('Café molido') returning id`)).id;
const cafe = (await one(`insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad)
                         values ($1,$2,'Café Sierra 500 g',500,'g') returning id`, [prod, prov])).id;
const lista = (await one(`insert into listas_precio (nombre, es_publica) values ('Mayorista', false) returning id`)).id;
await q(`insert into precios (lista_id, articulo_id, precio) values ($1,$2,20000)`, [lista, cafe]);
// Stock 10 y costo promedio 12000 por la ruta legítima (0013 prohíbe editar costo_promedio): una compra recibida
const oc0 = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
const oci0 = (await one(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,10,12000) returning id`, [oc0, cafe])).id;
await q(`update ordenes_compra set estado='pedida' where id=$1`, [oc0]);
const rec0 = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [oc0])).id;
await q(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,10)`, [rec0, oci0]);

// Pedido abierto (recibido) con ítem y un cobro parcial
const pedido = (await one(`insert into pedidos_venta (cliente_id, origen) values ($1,'whatsapp') returning id`, [cli])).id;
const item = (await one(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario)
                         values ($1,$2,2,20000,20000) returning id`, [pedido, cafe])).id;
await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'nequi',10000)`, [pedido]);
// Compra abierta (pedida) con ítem
const oc = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
await q(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,5,12000)`, [oc, cafe]);
await q(`update ordenes_compra set estado='pedida' where id=$1`, [oc]);

console.log('\nT-M1-08 · sync_pull simple (un solo cursor)');

let cursor;
await test('[RF-SYN-08] primera llamada (sin cursor) trae el snapshot completo', async () => {
  const r = await pull();
  assert.ok(r.server_time);
  assert.ok(r.cursor, 'devuelve cursor');
  assert.ok(r.catalogo.productos.some((x) => x.id === prod));
  assert.ok(r.catalogo.articulos.some((x) => x.id === cafe));
  assert.ok(r.catalogo.listas_precio.some((x) => x.id === lista));
  assert.equal(r.catalogo.precios.length, 1);
  assert.ok(r.catalogo.unidades.length >= 8);
  assert.ok(r.terceros.some((x) => x.id === cli) && r.terceros.some((x) => x.id === prov));
  assert.ok(r.configuracion.some((x) => x.clave === 'negocio'));
  const s = r.stock.find((x) => x.articulo_id === cafe);
  assert.equal(Number(s.fisico), 10);
  assert.equal(Number(s.en_camino), 5);
  assert.equal(Number(s.costo_promedio), 12000);
  const p = r.pedidos_venta.find((x) => x.id === pedido);
  assert.equal(p.items.length, 1);
  assert.equal(p.pagos.length, 1);
  const o = r.ordenes_compra.find((x) => x.id === oc);
  assert.equal(o.items.length, 1);
  assert.deepEqual(o.recepciones, []);
  cursor = r.cursor;
});

await test('[RF-SYN-08] segunda llamada con el cursor devuelve vacío y conserva el cursor', async () => {
  const r = await pull(cursor);
  assert.ok(vacia(r), JSON.stringify(Object.fromEntries(Object.entries(listas(r)).map(([k, v]) => [k, v.length]))));
  assert.equal(r.cursor, cursor);
  assert.ok(r.stock.length >= 1, 'el stock (derivado) va siempre completo');
});

await test('[RF-SYN-08] un cambio posterior aparece una sola vez', async () => {
  await pausa();
  await q(`update terceros set notas = 'cambió' where id = $1`, [cli]);
  const r = await pull(cursor);
  assert.deepEqual(r.terceros.map((x) => x.id), [cli]);
  assert.equal(r.pedidos_venta.length + r.ordenes_compra.length + r.catalogo.articulos.length, 0);
  assert.ok(r.cursor > cursor);
  assert.ok(vacia(await pull(r.cursor)));
  cursor = r.cursor;
});

await test('[RF-SYN-08] un cambio en un ítem trae al pedido padre (con sus ítems) una sola vez', async () => {
  await pausa();
  await q(`update pedidos_venta_items set cantidad = 3 where id = $1`, [item]);
  const r = await pull(cursor);
  assert.deepEqual(r.pedidos_venta.map((x) => x.id), [pedido]);
  assert.equal(Number(r.pedidos_venta[0].items[0].cantidad), 3);
  assert.ok(vacia(await pull(r.cursor)));
  cursor = r.cursor;
});

await test('[RF-SYN-08] un cobro nuevo trae al pedido con sus pagos; una recepción trae a la compra', async () => {
  await pausa();
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',5000)`, [pedido]);
  let r = await pull(cursor);
  assert.deepEqual(r.pedidos_venta.map((x) => x.id), [pedido]);
  assert.equal(r.pedidos_venta[0].pagos.length, 2);
  cursor = r.cursor;
  await pausa();
  const oci = (await one(`select id from ordenes_compra_items where orden_id=$1`, [oc])).id;
  const rec = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [oc])).id;
  await q(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,2)`, [rec, oci]);
  r = await pull(cursor);
  assert.deepEqual(r.ordenes_compra.map((x) => x.id), [oc]);
  assert.equal(r.ordenes_compra[0].recepciones.length, 1);
  assert.equal(r.ordenes_compra[0].recepciones[0].items.length, 1);
  assert.equal(Number(r.stock.find((x) => x.articulo_id === cafe).fisico), 12);
  assert.ok(vacia(await pull(r.cursor)));
  cursor = r.cursor;
});

await test('[RF-SYN-08] borrado lógico: la fila llega marcada con deleted_at', async () => {
  await pausa();
  await q(`update terceros set deleted_at = now() where id = $1`, [prov]);
  const r = await pull(cursor);
  const t = r.terceros.find((x) => x.id === prov);
  assert.ok(t && t.deleted_at, 'el tercero borrado viene con deleted_at');
  cursor = r.cursor;
});

await test('[RF-SYN-08] pedido finalizado hace más de 90 días no viene en el snapshot; uno reciente sí', async () => {
  // Se finalizan por la ruta legítima (0013 rechaza insertar pedidos ya finalizados; 0006 corrigió touch_padre)
  const mk = async () => {
    const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
    await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,20000,20000)`, [p, cafe]);
    await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
    await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',20000)`, [p]);
    await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
    return p;
  };
  const viejo = await mk();
  const reciente = await mk();
  await q(`update pedidos_venta set finalizado_en = now() - interval '100 days' where id=$1`, [viejo]);
  const ids = (await pull()).pedidos_venta.map((x) => x.id);
  assert.ok(ids.includes(reciente), 'el reciente viene');
  assert.ok(!ids.includes(viejo), 'el de hace 100 días no viene');
  assert.ok(ids.includes(pedido), 'el abierto viene');
});

await test('[RF-SYN-08] quien no es miembro no ve nada', async () => {
  await db.exec(`
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER_X}', false);`);
  let r;
  try { r = await pull(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${USER_A}', false);`); }
  assert.ok(vacia(r));
  assert.equal(r.stock.length, 0);
});

console.log(`\n${passed} pruebas OK${process.exitCode ? ' — HAY FALLAS' : ''}`);
