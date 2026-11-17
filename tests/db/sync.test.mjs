// Pruebas de la migración 0002_sync.sql en Postgres real (PGlite, WASM). Ejecutar: npm run test:db
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

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_X = '00000000-0000-0000-0000-0000000000ff';
await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_X}');
  insert into miembros (user_id, nombre) values ('${USER_A}', 'Socio A');
  select set_config('request.jwt.claim.sub', '${USER_A}', false);
`);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const rejects = async (sql, re, params = []) => {
  await assert.rejects(() => db.query(sql, params), (e) => re.test(e.message), `esperaba error ${re} en: ${sql}`);
};
const pausa = () => q(`select pg_sleep(0.02)`);   // now() es por transacción: separa los instantes

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

// ---------- Datos base ----------
const prov = (await one(`insert into terceros (nombre, es_proveedor, telefono) values ('Don Luis (finca)', true, '3001112233') returning id`)).id;
const cli  = (await one(`insert into terceros (nombre, es_cliente, telefono, municipio) values ('María Pérez', true, '3009998877', 'Zarzal') returning id`)).id;
const prodCafe = (await one(`insert into productos (nombre, categoria) values ('Café molido', 'Café') returning id`)).id;
const cafe = (await one(`insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad)
                         values ($1, $2, 'Café Sierra 500 g', 500, 'g') returning id`, [prodCafe, prov])).id;
const updatedAt = async (tabla, id) => new Date((await one(`select updated_at from ${tabla} where id = $1`, [id])).updated_at).getTime();

console.log('\nT-M1-01 · Columnas de sincronización (updated_at) y touch del padre');

await test('[RF-SYN-08] las 10 tablas hijas tienen updated_at con default', async () => {
  const tablas = ['listas_precio','precios','unidades','pedidos_venta_items','ordenes_compra_items',
                  'recepciones','recepcion_items','lotes','pagos','gastos'];
  const r = await q(`select table_name from information_schema.columns
                      where table_schema = 'public' and column_name = 'updated_at'
                        and column_default is not null and table_name = any($1)`, [tablas]);
  assert.deepEqual(r.map((x) => x.table_name).sort(), [...tablas].sort());
});

await test('[RF-SYN-08] updated_at de una fila se mueve al modificarla (trigger set_updated_at)', async () => {
  const id = (await one(`insert into listas_precio (nombre) values ('Mayorista') returning id`)).id;
  const antes = await updatedAt('listas_precio', id);
  await pausa();
  await q(`update listas_precio set descripcion = 'x' where id = $1`, [id]);
  assert.ok(await updatedAt('listas_precio', id) > antes);
});

let pedido, item;
await test('[RF-SYN-08] tocar un ítem de pedido actualiza updated_at del pedido', async () => {
  pedido = (await one(`insert into pedidos_venta (cliente_id, origen) values ($1,'whatsapp') returning id`, [cli])).id;
  item = (await one(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario)
                     values ($1,$2,2,20000,20000) returning id`, [pedido, cafe])).id;
  let antes = await updatedAt('pedidos_venta', pedido);
  await pausa();
  await q(`update pedidos_venta_items set cantidad = 3 where id = $1`, [item]);
  assert.ok(await updatedAt('pedidos_venta', pedido) > antes, 'update del ítem');
  antes = await updatedAt('pedidos_venta', pedido);
  await pausa();
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario)
           values ($1,$2,1,20000,20000)`, [pedido, cafe]);
  assert.ok(await updatedAt('pedidos_venta', pedido) > antes, 'insert de ítem');
  antes = await updatedAt('pedidos_venta', pedido);
  await pausa();
  await q(`delete from pedidos_venta_items where id = $1`, [item]);
  assert.ok(await updatedAt('pedidos_venta', pedido) > antes, 'delete de ítem');
});

let orden, oitem;
await test('[RF-SYN-08] tocar un ítem de orden de compra actualiza updated_at de la orden', async () => {
  orden = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
  oitem = (await one(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario)
                      values ($1,$2,10,10000) returning id`, [orden, cafe])).id;
  const antes = await updatedAt('ordenes_compra', orden);
  await pausa();
  await q(`update ordenes_compra_items set cantidad = 12 where id = $1`, [oitem]);
  assert.ok(await updatedAt('ordenes_compra', orden) > antes);
});

await test('[RF-SYN-08] una recepción (y sus ítems) actualiza updated_at de la orden de compra', async () => {
  await q(`update ordenes_compra set estado = 'pedida' where id = $1`, [orden]);
  const antes = await updatedAt('ordenes_compra', orden);
  await pausa();
  const rec = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [orden])).id;
  assert.ok(await updatedAt('ordenes_compra', orden) > antes, 'insert de recepción');
  const a2 = await updatedAt('recepciones', rec);
  const o2 = await updatedAt('ordenes_compra', orden);
  await pausa();
  await q(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,5)`, [rec, oitem]);
  assert.ok(await updatedAt('recepciones', rec) > a2, 'el ítem toca la recepción');
  assert.ok(await updatedAt('ordenes_compra', orden) > o2, 'y la recepción toca la orden');
});

console.log('\nT-M1-01 · Terceros, adjuntos, configuración y funciones de servicio');

await test('[RF-TER-01] terceros.productos_ofrecidos guarda texto libre', async () => {
  const r = await one(`update terceros set productos_ofrecidos = 'café, panela' where id = $1 returning productos_ofrecidos`, [prov]);
  assert.equal(r.productos_ofrecidos, 'café, panela');
});

await test('[RF-SYN-09] adjuntos: se crea con RLS y op_id único (idempotencia)', async () => {
  const op = '11111111-1111-1111-1111-111111111111';
  const a = await one(`insert into adjuntos (entidad, entidad_id, path, mime, op_id)
                       values ('pago', gen_random_uuid(), 'soportes/a.jpg', 'image/jpeg', $1) returning *`, [op]);
  assert.equal(a.creado_por, USER_A);
  assert.ok(a.created_at);
  await rejects(`insert into adjuntos (entidad, entidad_id, path, mime, op_id)
                 values ('pago', gen_random_uuid(), 'soportes/b.jpg', 'image/jpeg', $1)`, /duplicate key|unique/, [op]);
  assert.equal((await one(`select relrowsecurity r from pg_class where relname = 'adjuntos'`)).r, true);
});

await test('[RF-SYN-09] configuracion trae la fila negocio con placeholders y RLS', async () => {
  const r = await one(`select valor from configuracion where clave = 'negocio'`);
  for (const k of ['razon_social','nit','direccion','telefono','email','ciudad','leyenda_documento','logo_path'])
    assert.ok(k in r.valor, `falta ${k}`);
  assert.equal((await one(`select relrowsecurity r from pg_class where relname = 'configuracion'`)).r, true);
});

await test('[RF-SYN-09] RLS: quien no es miembro no ve ni escribe adjuntos ni configuración', async () => {
  await db.exec(`
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER_X}', false);`);
  const vistos = { adj: (await one(`select count(*)::int c from adjuntos`)).c, cfg: (await one(`select count(*)::int c from configuracion`)).c };
  await rejects(`insert into configuracion (clave, valor) values ('x', '{}')`, /row-level security/);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${USER_A}', false);`);
  assert.deepEqual(vistos, { adj: 0, cfg: 0 });
});

await test('[RF-SYN-09] ping() devuelve 1 y uso_bd() devuelve el tamaño de la base en bytes', async () => {
  assert.equal((await one(`select ping() p`)).p, 1);
  const bytes = Number((await one(`select uso_bd() b`)).b);
  assert.ok(bytes > 0);
});

console.log('\nT-M1-02 · Detección de duplicados de terceros');
const dup = (tel, doc, nombre) =>
  q(`select * from detectar_duplicados_tercero($1,$2,$3)`, [tel ?? null, doc ?? null, nombre ?? null]);
const ids = (rows) => rows.map((r) => r.id);

const tUno = (await one(`insert into terceros (nombre, es_cliente, telefono, municipio) values ('Carlos Andrés Ramírez', true, '3001112233', 'Tuluá') returning id`)).id;
const tDoc = (await one(`insert into terceros (nombre, es_proveedor, tipo_documento, numero_documento, municipio) values ('Finca El Mirador', true, 'NIT', '900123456', 'Zarzal') returning id`)).id;
const tBorrado = (await one(`insert into terceros (nombre, es_cliente, telefono, deleted_at) values ('Borrado Total', true, '3112223344', now()) returning id`)).id;
// Ya existen: 'Don Luis (finca)' (3001112233, prov) y 'María Pérez' (3009998877, cli) de los datos base.

await test('[RF-TER-04] el teléfono con +57 y espacios coincide con el guardado sin prefijo', async () => {
  const r = await dup('+57 300 111 2233', null, null);
  assert.ok(ids(r).includes(tUno));
  assert.deepEqual(Object.keys(r[0]).slice(0, 4), ['id', 'nombre', 'telefono', 'municipio']);
});

await test('[RF-TER-04] el teléfono guardado con formato también coincide (57 inicial, guiones, paréntesis)', async () => {
  const t = (await one(`insert into terceros (nombre, es_cliente, telefono) values ('Ana Formato', true, '(57) 315-444-5566') returning id`)).id;
  assert.ok(ids(await dup('3154445566', null, null)).includes(t));
  assert.ok(ids(await dup('0057 315 444 5566', null, null)).includes(t));
});

await test('[RF-TER-04] el documento igual es candidato aunque cambie el formato', async () => {
  assert.deepEqual(ids(await dup(null, '900123456', null)), [tDoc]);
  assert.deepEqual(ids(await dup(null, '900.123.456', null)), [tDoc]);
});

await test('[RF-TER-04] nombre similar (mayúsculas, tildes, signos, error de tipeo) es candidato', async () => {
  assert.ok(ids(await dup(null, null, 'CARLOS ANDRES RAMIREZ')).includes(tUno));
  assert.ok(ids(await dup(null, null, 'carlos andres ramirez.')).includes(tUno));
  assert.ok(ids(await dup(null, null, 'Carlos Andrés Ramirés')).includes(tUno));
  assert.ok(ids(await dup(null, null, 'Don Luis finca')).length >= 1);
});

await test('[RF-TER-04] sin falsos positivos con nombres, teléfono o documento distintos', async () => {
  assert.deepEqual(await dup('3205556677', '1234567', 'Pedro Gómez Torres'), []);
  assert.deepEqual(await dup(null, null, 'Juan Pérez'), []);        // solo comparte apellido con 'María Pérez'
  assert.deepEqual(await dup(null, null, 'Tienda La Esquina'), []);
});

await test('[RF-TER-04] sin datos no devuelve nada; null y vacío no empatan con terceros sin teléfono', async () => {
  await q(`insert into terceros (nombre, es_cliente) values ('Sin Teléfono SAS', true)`);
  assert.deepEqual(await dup(null, null, null), []);
  assert.deepEqual(await dup('', '', ''), []);
  assert.deepEqual(await dup('abc', ' ', null), []);
});

await test('[RF-TER-04] ignora terceros con borrado lógico y devuelve una fila por tercero con el motivo', async () => {
  assert.deepEqual(await dup('3112223344', null, null), []);
  const r = await dup('300 111 2233', null, 'Carlos Andrés Ramírez');
  assert.equal(r.filter((x) => x.id === tUno).length, 1);
  assert.match(r.find((x) => x.id === tUno).motivo, /telefono/);
  assert.match(r.find((x) => x.id === tUno).motivo, /nombre/);
  assert.ok(!ids(r).includes(tBorrado));
});

console.log(`\n${passed} pruebas OK${process.exitCode ? ' — HAY FALLAS' : ''}`);
