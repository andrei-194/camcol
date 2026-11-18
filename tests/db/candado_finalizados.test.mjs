// Pruebas de la migración 0011_candado_finalizados.sql (H-02, CAM-88). Ejecutar: npm run test:db
// Hallazgo de auditoría: un pedido finalizado no se puede reescribir (AGENTS regla 3, hallazgo H-02).
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
for (const f of ['0001_core.sql', '0002_sync.sql', '0006_fix_touch_padre.sql', '0011_candado_finalizados.sql']) {
  if (f === '0011_candado_finalizados.sql' && !existsSync(new URL(`../../supabase/migrations/${f}`, import.meta.url))) {
    console.log('  (aún no existe 0011_candado_finalizados.sql: las pruebas de candado deben fallar)');
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

// ---------- Datos base: stock, un pedido finalizado y uno devuelto ----------
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
const pedidoFinalizado = async (cant = 2) => {
  const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,$3,20000,20000)`, [p, art, cant]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',$2)`, [p, cant * 20000]);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  return p;
};
const P = await pedidoFinalizado();

console.log('\nH-02 · candado de pedidos finalizados');

await test('[H-02] control: el pedido de prueba quedó finalizado con costo fijado', async () => {
  const p = await one(`select estado, total from pedidos_venta where id=$1`, [P]);
  assert.equal(p.estado, 'finalizado');
  assert.equal(Number(p.total), 40000);
  const i = await one(`select costo_unitario from pedidos_venta_items where pedido_id=$1`, [P]);
  assert.equal(Number(i.costo_unitario), 10000);
});

await test('[H-02] no se cambia el dinero de la cabecera de un pedido finalizado', async () => {
  for (const set of ['descuento_valor = 30000', 'subtotal = 999999', 'envio_costo = 5000', 'envio_cobrado = 5000', 'impuestos = 1']) {
    await rejects(`update pedidos_venta set ${set} where id = $1`, [P]);
  }
  assert.equal(Number((await one(`select total from pedidos_venta where id=$1`, [P])).total), 40000);
});

await test('[RN-COS-02] no se cambia el costo_unitario de los ítems de un pedido finalizado', async () => {
  await rejects(`update pedidos_venta_items set costo_unitario = 1 where pedido_id = $1`, [P]);
  assert.equal(Number((await one(`select costo_unitario from pedidos_venta_items where pedido_id=$1`, [P])).costo_unitario), 10000);
});

await test('[H-02] no se borra, edita ni agrega cobros a un pedido finalizado', async () => {
  await rejects(`delete from pagos where pedido_venta_id = $1`, [P]);
  await rejects(`update pagos set valor = 1 where pedido_venta_id = $1`, [P]);
  await rejects(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',1000)`, [P]);
  assert.equal(Number((await one(`select sum(valor) s from pagos where pedido_venta_id=$1`, [P])).s), 40000);
});

await test('[H-02] lo legítimo sigue permitido: notas y devolución con reposición de stock', async () => {
  await q(`update pedidos_venta set notas = 'entregado en portería' where id = $1`, [P]);
  const antes = Number((await one(`select fisico from v_stock where articulo_id=$1`, [art])).fisico);
  await q(`update pedidos_venta set estado='devuelto', motivo_estado='cliente devolvió' where id = $1`, [P]);
  const despues = Number((await one(`select fisico from v_stock where articulo_id=$1`, [art])).fisico);
  assert.equal(despues, antes + 2);
});

await test('[H-02] un pedido devuelto tampoco se reescribe', async () => {
  assert.equal((await one(`select estado from pedidos_venta where id=$1`, [P])).estado, 'devuelto', 'requiere el pedido devuelto de la prueba anterior');
  await rejects(`update pedidos_venta set descuento_valor = 1 where id = $1`, [P]);
  await rejects(`delete from pagos where pedido_venta_id = $1`, [P]);
});

await test('[H-02] un pedido abierto (confirmado) sí admite cambios de cabecera y cobros', async () => {
  const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,20000,20000)`, [p, art]);
  await q(`update pedidos_venta set estado='confirmado', envio_cobrado = 5000, envio_costo = 5000 where id = $1`, [p]);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'nequi',5000)`, [p]);
  await q(`delete from pagos where pedido_venta_id = $1`, [p]);
});

console.log(`\n${passed} pruebas ok`);
await db.close();
