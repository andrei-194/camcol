// Pruebas de la migración 0013_cerrar_escritura_directa.sql (H-03, CAM-89). Ejecutar: npm run test:db
// Hallazgo de auditoría: nada se escribe saltándose la ruta única (AGENTS regla 4) ni los consecutivos/costos del servidor.
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
for (const f of ['0001_core.sql', '0002_sync.sql', '0006_fix_touch_padre.sql', '0013_cerrar_escritura_directa.sql']) {
  if (!existsSync(new URL(`../../supabase/migrations/${f}`, import.meta.url))) {
    console.log(`  (aún no existe ${f}: las pruebas de cierre deben fallar)`);
    continue;
  }
  await db.exec(migracion(f));
}

const USER_A = '00000000-0000-0000-0000-00000000000a';
await db.exec(`
  insert into auth.users (id) values ('${USER_A}');
  insert into miembros (user_id, nombre) values ('${USER_A}', 'Socio A');
  select set_config('request.jwt.claim.sub', '${USER_A}', false);
`);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const rejects = async (sql, params = []) => {
  await assert.rejects(() => db.query(sql, params), undefined, `debía rechazarse: ${sql}`);
};
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

const prov = (await one(`insert into terceros (nombre, es_proveedor) values ('Don Luis', true) returning id`)).id;
const cli = (await one(`insert into terceros (nombre, es_cliente) values ('María', true) returning id`)).id;
const prod = (await one(`insert into productos (nombre, categoria) values ('Café', 'Café') returning id`)).id;
const art = (await one(`insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad)
                        values ($1,$2,'Café 500 g',500,'g') returning id`, [prod, prov])).id;
// Una compra legítima recibida (fija stock y costo_promedio por triggers internos)
const o = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
const oit = (await one(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,10,10000) returning id`, [o, art])).id;
await q(`update ordenes_compra set estado='pedida' where id=$1`, [o]);
const rec = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [o])).id;
await q(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,10)`, [rec, oit]);

console.log('\nH-03 · cerrar la escritura directa');

await test('[H-03] no se inserta un pedido de venta ya finalizado ni con finalizado_en', async () => {
  await rejects(`insert into pedidos_venta (cliente_id, estado, subtotal, finalizado_en) values ($1,'finalizado',500000, now())`, [cli]);
  await rejects(`insert into pedidos_venta (cliente_id, estado) values ($1,'confirmado')`, [cli]);
});

await test('[H-03] no se inserta una orden de compra ya recibida', async () => {
  await rejects(`insert into ordenes_compra (proveedor_id, estado, total) values ($1,'recibida',1000000)`, [prov]);
  await rejects(`insert into ordenes_compra (proveedor_id, estado) values ($1,'pedida')`, [prov]);
});

await test('[RN-DOC-01] control: emitir una remisión sigue dando el siguiente consecutivo sin huecos', async () => {
  const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,20000,20000)`, [p, art]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',20000)`, [p]);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  const d = await one(`select * from emitir_documento('remision', $1)`, [p]);
  assert.equal(d.numero, 'RM-000001');
});

await test('[RN-DOC-01] los consecutivos no se editan a mano (sin huecos)', async () => {
  await rejects(`update consecutivos set ultimo = ultimo + 5 where tipo = 'remision'`);
  await rejects(`delete from consecutivos where tipo = 'remision'`);
});

await test('[RN-COS-01] control: la recepción sigue fijando el costo promedio por sus triggers', async () => {
  assert.equal(Number((await one(`select costo_promedio c from articulos where id=$1`, [art])).c), 10000);
});

await test('[RN-COS-01] el costo_promedio del artículo no se edita a mano', async () => {
  await rejects(`update articulos set costo_promedio = 1 where id = $1`, [art]);
});

await test('[H-03] no se borra una recepción ni sus ítems (el stock no se reversa)', async () => {
  await rejects(`delete from recepcion_items where recepcion_id = $1`, [rec]);
  await rejects(`delete from recepciones where id = $1`, [rec]);
  assert.equal(Number((await one(`select fisico from v_stock where articulo_id=$1`, [art])).fisico), 9); // 10 recibidos - 1 vendido en la remisión de arriba
});

await test('[H-03] no se archiva (deleted_at) un pedido finalizado', async () => {
  const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,20000,20000)`, [p, art]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',20000)`, [p]);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  await rejects(`update pedidos_venta set deleted_at = now() where id = $1`, [p]);
});

await test('[RF-INV-03] un ajuste o merma exige motivo', async () => {
  await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario) values ($1,'ajuste',1,10000)`, [art]);
  await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad) values ($1,'merma',-1)`, [art]);
  await q(`insert into movimientos_inventario (articulo_id, tipo, cantidad, motivo) values ($1,'merma',-1,'se humedeció')`, [art]);
});

await test('[H-03] control: un pedido y una orden en su estado inicial se crean normal', async () => {
  await q(`insert into pedidos_venta (cliente_id) values ($1)`, [cli]);
  await q(`insert into ordenes_compra (proveedor_id) values ($1)`, [prov]);
});

console.log(`\n${passed} pruebas ok`);
await db.close();
