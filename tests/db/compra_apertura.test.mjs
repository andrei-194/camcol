// Pruebas de la migración 0013_compra_apertura.sql (H-01, CAM-90). Ejecutar: npm run test:db
// Decisión del socio: el inventario inicial se carga como compra de apertura (con costo), no como ajuste.
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
for (const f of ['0001_core.sql', '0002_sync.sql', '0006_fix_touch_padre.sql', '0013_compra_apertura.sql']) {
  if (!existsSync(new URL(`../../supabase/migrations/${f}`, import.meta.url))) {
    console.log(`  (aún no existe ${f}: las pruebas de apertura deben fallar)`);
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
const num = (v) => Number(v);
const rejects = async (sql, params = []) => {
  await assert.rejects(() => db.query(sql, params), undefined, `debía rechazarse: ${sql}`);
};
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

const inicial = (await one(`insert into terceros (nombre, es_proveedor) values ('Inventario inicial', true) returning id`)).id;
const don = (await one(`insert into terceros (nombre, es_proveedor) values ('Don Luis', true) returning id`)).id;
const cli = (await one(`insert into terceros (nombre, es_cliente) values ('María', true) returning id`)).id;
const prod = (await one(`insert into productos (nombre, categoria) values ('Café', 'Café') returning id`)).id;
const art = (await one(`insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad)
                        values ($1,$2,'Café 500 g',500,'g') returning id`, [prod, don])).id;

const comprar = async (proveedor, modalidad, cant, costo) => {
  const o = (await one(`insert into ordenes_compra (proveedor_id, modalidad) values ($1,$2) returning id`, [proveedor, modalidad])).id;
  const it = (await one(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,$3,$4) returning id`, [o, art, cant, costo])).id;
  await q(`update ordenes_compra set estado='pedida' where id=$1`, [o]);
  const r = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [o])).id;
  await q(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,$3)`, [r, it, cant]);
  return o;
};
const hoy = (await one(`select (now() at time zone 'America/Bogota')::date d`)).d.toISOString().slice(0, 10);
const periodo = async () => one(`select * from resumen_periodo($1::date, $1::date)`, [hoy]);

console.log('\nH-01 · compra de apertura');

let apertura;
await test('[RN-COM-04][RN-COS-01] una compra de apertura suma stock y fija el costo promedio', async () => {
  apertura = await comprar(inicial, 'apertura', 10, 13000);
  assert.equal(num((await one(`select fisico from v_stock where articulo_id=$1`, [art])).fisico), 10);
  assert.equal(num((await one(`select costo_promedio c from articulos where id=$1`, [art])).c), 13000);
});

await test('[RN-COM-04] la compra de apertura no cuenta en compras_periodo', async () => {
  assert.ok(apertura, 'la compra de apertura debe existir (modalidad apertura)');
  const p = await periodo();
  assert.equal(num(p.compras_periodo), 0);
});

await test('[RN-COM-04] la compra de apertura no genera cuenta por pagar', async () => {
  assert.ok(apertura, 'la compra de apertura debe existir (modalidad apertura)');
  assert.equal((await q(`select 1 from v_cuentas_por_pagar where orden_id=$1`, [apertura])).length, 0);
});

await test('[RN-COM-04] una compra de apertura no admite pagos', async () => {
  assert.ok(apertura, 'la compra de apertura debe existir (modalidad apertura)');
  await rejects(`insert into pagos (direccion, orden_compra_id, medio, valor) values ('pago',$1,'efectivo',130000)`, [apertura]);
});

await test('[RN-COS-02] la primera venta usa el costo de apertura (no 100 % de margen)', async () => {
  const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,20000,20000)`, [p, art]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',20000)`, [p]);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  assert.equal(num((await one(`select costo_unitario from pedidos_venta_items where pedido_id=$1`, [p])).costo_unitario), 13000);
  assert.equal(num((await periodo()).costo_mercancia), 13000);
});

await test('[RN-COM-02] control: una compra normal (inmediata) sí cuenta como compra y como deuda sin pago', async () => {
  const o = await comprar(don, 'inmediata', 5, 14000);
  await q(`update ordenes_compra set total = 70000 where id = $1`, [o]);
  assert.equal(num((await periodo()).compras_periodo), 70000);
  assert.equal((await q(`select 1 from v_cuentas_por_pagar where orden_id=$1`, [o])).length, 1);
  await q(`insert into pagos (direccion, orden_compra_id, medio, valor) values ('pago',$1,'efectivo',70000)`, [o]);
});

await test('[RN-COS-01] el costo promedio mezcla apertura y compras posteriores', async () => {
  // 10 a 13.000 (apertura) − 1 vendida + 5 a 14.000 → (9·13.000 + 5·14.000) / 14
  const c = num((await one(`select costo_promedio c from articulos where id=$1`, [art])).c);
  assert.ok(Math.abs(c - (9 * 13000 + 5 * 14000) / 14) < 0.01, `costo ${c}`);
});

console.log(`\n${passed} pruebas ok`);
await db.close();
