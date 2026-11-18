// Pruebas de la migración 0016_movimientos_solo_internos.sql (H-16, CAM-95). Ejecutar: npm run test:db
// En inserts directos a movimientos_inventario solo se admiten ajuste y merma; el resto nace de triggers internos.
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
for (const f of ['0001_core.sql', '0002_sync.sql', '0006_fix_touch_padre.sql', '0012_compra_apertura.sql', '0013_cerrar_escritura_directa.sql', '0016_movimientos_solo_internos.sql']) {
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
const stock = async () => Number((await one(`select coalesce(sum(cantidad),0) s from movimientos_inventario where articulo_id=$1`, [art])).s);
const costo = async () => Number((await one(`select costo_promedio c from articulos where id=$1`, [art])).c);

const recibir = async (cant, costoU, modalidad = null) => {
  const o = (await one(modalidad
    ? `insert into ordenes_compra (proveedor_id, modalidad) values ($1,'${modalidad}') returning id`
    : `insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
  const it = (await one(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,$3,$4) returning id`, [o, art, cant, costoU])).id;
  await q(`update ordenes_compra set estado='pedida' where id=$1`, [o]);
  const r = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [o])).id;
  await q(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,$3)`, [r, it, cant]);
};
const pedido = async () => {
  const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,20000,20000)`, [p, art]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',20000)`, [p]);
  return p;
};

console.log('\nH-16 · movimientos de inventario solo internos');

await test('[H-16] control: la recepción de una compra genera su movimiento compra y fija el costo', async () => {
  await recibir(10, 10000);
  assert.equal(await stock(), 10);
  assert.equal(await costo(), 10000);
});

await test('[H-16] control: la compra de apertura (modalidad apertura) sigue generando stock y costo', async () => {
  await recibir(10, 12000, 'apertura');
  assert.equal(await stock(), 20);
  assert.equal(await costo(), 11000);
});

await test('[H-16] no se inserta a mano un movimiento compra (ni mueve el costo promedio)', async () => {
  const antes = await costo();
  await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario) values ($1,'compra',100,1)`, [art]);
  assert.equal(await costo(), antes);
  assert.equal(await stock(), 20);
});

await test('[H-16] no se inserta a mano un movimiento venta', async () => {
  await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario) values ($1,'venta',-1,1)`, [art]);
});

await test('[H-16] no se insertan a mano devolución de cliente ni de proveedor', async () => {
  await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario, motivo) values ($1,'devolucion_cliente',1,1,'x')`, [art]);
  await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad, motivo) values ($1,'devolucion_proveedor',-1,'x')`, [art]);
});

await test('[H-16] control: ajuste y merma con motivo se insertan a mano', async () => {
  await q(`insert into movimientos_inventario (articulo_id, tipo, cantidad, motivo) values ($1,'ajuste',2,'conteo físico')`, [art]);
  await q(`insert into movimientos_inventario (articulo_id, tipo, cantidad, motivo) values ($1,'merma',-1,'se humedeció')`, [art]);
  assert.equal(await stock(), 21);
});

await test('[H-16] control: finalizar un pedido genera el movimiento venta', async () => {
  const p = await pedido();
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  assert.equal(await stock(), 20);
  assert.equal((await one(`select count(*)::int n from movimientos_inventario where tipo='venta'`)).n, 1);
});

await test('[H-16] control: devolver un pedido finalizado genera devolucion_cliente', async () => {
  const p = (await one(`select id from pedidos_venta where estado='finalizado'`)).id;
  await q(`update pedidos_venta set estado='devuelto', motivo_estado='cliente devolvió' where id=$1`, [p]);
  assert.equal(await stock(), 21);
  assert.equal((await one(`select count(*)::int n from movimientos_inventario where tipo='devolucion_cliente'`)).n, 1);
});

console.log(`\n${passed} pruebas ok`);
await db.close();
