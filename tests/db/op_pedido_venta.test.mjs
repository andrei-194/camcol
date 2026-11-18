// Pruebas de la migración 0010_op_pedido_venta.sql en Postgres real (PGlite). Ejecutar: npm run test:db
// T-M1-05 (CAM-35) · RF-VEN-01/08, RN-PRE-01/02, [E5], D-007: op pedido_venta.crear (solo con conexión, D-009).
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const migracion = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
for (const f of ['0001_core.sql', '0002_sync.sql', '0003_aplicar_ops.sql', '0006_fix_touch_padre.sql',
                 '0007_op_tercero.sql', '0010_op_pedido_venta.sql', '0011_candado_finalizados.sql']) {
  await db.exec(migracion(f));
}

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_X = '00000000-0000-0000-0000-0000000000ff';
await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_X}');
  insert into miembros (user_id, nombre) values ('${USER_A}', 'Socio A');
  select set_config('request.jwt.claim.sub', '${USER_A}', false);
`);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const como = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

const uid = (n) => `eeeeeeee-0000-0000-0000-${String(n).padStart(12, '0')}`;
const aplicar = async (ops) => (await one(`select aplicar_ops($1::jsonb) r`, [JSON.stringify(ops)])).r;
const crear = (n, datos) => ({ op_id: uid(n), tipo: 'pedido_venta.crear', datos });
const error = (r, i = 0) => r.resultados[i].error?.codigo;
const res = (r, i = 0) => r.resultados[i].resultado;
const conteo = async (t) => Number((await one(`select count(*) n from ${t}`)).n);
const movs = async () => conteo('movimientos_inventario');
const advertencias = (r) => res(r).advertencias.map((a) => a.codigo);

// Datos base
const CLI = uid(900);
const CLI_MAYOR = uid(901);
const LISTA_MAYOR = uid(950);
await db.exec(`
  insert into listas_precio (id, nombre) values ('${LISTA_MAYOR}', 'Mayorista');
  insert into terceros (id, nombre, es_cliente, telefono, consentimiento_datos, consentimiento_en)
    values ('${CLI}', 'Marta Gómez', true, '3001112233', true, now());
  insert into terceros (id, nombre, es_cliente, telefono, lista_precio_id, consentimiento_datos, consentimiento_en)
    values ('${CLI_MAYOR}', 'Tienda La Esquina', true, '3109998877', '${LISTA_MAYOR}', true, now());
`);
const PUBLICA = (await one(`select id from listas_precio where es_publica`)).id;
const prod = (await one(`insert into productos (nombre, categoria) values ('Café', 'Café') returning id`)).id;
const art = async (nombre, tasa = 0) => (await one(
  `insert into articulos (producto_id, nombre, presentacion_cantidad, presentacion_unidad, tasa_impuesto)
   values ($1, $2, 500, 'g', $3) returning id`, [prod, nombre, tasa])).id;
const precio = (lista, articulo, valor, min = 1) => db.query(
  `insert into precios (lista_id, articulo_id, precio, cantidad_minima) values ($1, $2, $3, $4)`,
  [lista, articulo, valor, min]);

const CAFE = await art('Café Jardín 250 g');          // $15.000; "Llévate 2": $14.000 c/u (D-007)
const CREMA = await art('Crema de cacao 120 g');      // $22.000
const GRAVADO = await art('Artículo con IVA', 19);    // $10.000, impuesto 19 %
const SIN_PRECIO = await art('Artículo sin precio');
await precio(PUBLICA, CAFE, 15000);
await precio(PUBLICA, CAFE, 14000, 2);
await precio(PUBLICA, CREMA, 22000);
await precio(PUBLICA, GRAVADO, 10000);
await precio(LISTA_MAYOR, CREMA, 20000);              // el mayorista solo tiene precio propio de la crema

// Pedido base: 2 cafés ($14.000 por el escalón) -> subtotal 28.000
const pedido = (n, extra = {}) => ({
  pedido: { id: uid(n * 10), cliente_id: CLI, origen: 'whatsapp', ...(extra.pedido || {}) },
  items: extra.items ?? [{ id: uid(n * 10 + 1), articulo_id: CAFE, cantidad: 2 }],
  ...(extra.cliente_nuevo ? { cliente_nuevo: extra.cliente_nuevo } : {}),
});

console.log('\nT-M1-05 · pedido_venta.crear');

await test('[RF-VEN-01] el tipo pedido_venta.crear está registrado en tipos_op', async () => {
  assert.ok(await one(`select funcion from tipos_op where tipo = 'pedido_venta.crear'`), 'tipo no registrado');
});

await test('[RF-VEN-01][RF-VEN-08] crea el pedido en recibido con sus ítems, sin mover ni reservar stock', async () => {
  const antes = await movs();
  const r = await aplicar([crear(1, pedido(1, { pedido: { referencia_origen: 'CC-20261118-01', entrega_tipo: 'transportadora',
    direccion_entrega: 'Calle 5 # 3-21', municipio_entrega: 'Popayán', notas: 'Café molido' } }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.equal(res(r).estado, 'recibido');
  assert.equal(res(r).pedido_id, uid(10));
  const pv = await one(`select * from pedidos_venta where id = $1`, [uid(10)]);
  assert.equal(pv.estado, 'recibido');
  assert.equal(pv.cliente_id, CLI);
  assert.equal(pv.origen, 'whatsapp');
  assert.equal(pv.referencia_origen, 'CC-20261118-01');
  assert.equal(pv.municipio_entrega, 'Popayán');
  assert.equal(pv.notas, 'Café molido');
  assert.equal(await conteo('pedidos_venta_items'), 1);
  assert.equal(await movs(), antes, 'no debe haber movimientos de inventario');
  const s = await one(`select comprometido from v_stock where articulo_id = $1`, [CAFE]);
  assert.equal(Number(s.comprometido), 0, 'recibido no reserva');
  assert.deepEqual(res(r).item_ids, [uid(11)]);
});

await test('[RF-VEN-01] sin ids ni origen: el servidor genera los ids y el origen es manual', async () => {
  const r = await aplicar([crear(2, { pedido: { cliente_id: CLI }, items: [{ articulo_id: CREMA, cantidad: 1 }] })]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const pv = await one(`select * from pedidos_venta where id = $1`, [res(r).pedido_id]);
  assert.equal(pv.origen, 'manual');
  assert.equal(res(r).item_ids.length, 1);
});

await test('[RF-VEN-08] totales calculados por el servidor (subtotal, impuestos y total del cliente se ignoran)', async () => {
  const d = pedido(3, { pedido: { envio_cobrado: 8000, descuento_valor: 3000, subtotal: 1, total: 1, impuestos: 999 },
    items: [{ id: uid(31), articulo_id: CAFE, cantidad: 2 }, { id: uid(32), articulo_id: CREMA, cantidad: 1 }] });
  const r = await aplicar([crear(3, d)]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const pv = await one(`select * from pedidos_venta where id = $1`, [uid(30)]);
  assert.equal(Number(pv.subtotal), 2 * 14000 + 22000);       // 50.000
  assert.equal(Number(pv.impuestos), 0);
  assert.equal(Number(pv.total), 50000 - 3000 + 8000);        // 55.000
  assert.equal(Number(res(r).total), 55000);
  assert.equal(Number(res(r).subtotal), 50000);
});

await test('[RF-VEN-08] el descuento global no puede superar el subtotal', async () => {
  const r = await aplicar([crear(4, pedido(4, { pedido: { descuento_valor: 28001 } }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS');
  assert.equal(await conteo(`pedidos_venta where id = '${uid(40)}'`), 0);
});

await test('[D-007][RN-PRE-01] "Llévate 2": el servidor aplica el escalón por cantidad (1 und a $15.000, 2 a $14.000 c/u)', async () => {
  const r = await aplicar([crear(5, pedido(5, { items: [
    { id: uid(51), articulo_id: CAFE, cantidad: 1 }, { id: uid(52), articulo_id: CAFE, cantidad: 2 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const it = await q(`select id, precio_lista, precio_unitario from pedidos_venta_items where pedido_id = $1 order by cantidad`, [uid(50)]);
  assert.equal(Number(it[0].precio_lista), 15000);
  assert.equal(Number(it[1].precio_lista), 14000);
  assert.equal(Number(it[1].precio_unitario), 14000);
  assert.deepEqual(res(r).advertencias, []);
});

await test('[RN-PRE-02] precio de lista alterado por el cliente: se corrige y se advierte PRECIO_CAMBIO', async () => {
  const r = await aplicar([crear(6, pedido(6, { items: [
    { id: uid(61), articulo_id: CAFE, cantidad: 2, precio_lista: 15000, precio_unitario: 15000 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.deepEqual(advertencias(r), ['PRECIO_CAMBIO']);
  const a = res(r).advertencias[0];
  assert.equal(a.item, 0);
  assert.equal(a.articulo_id, CAFE);
  assert.equal(Number(a.precio_enviado), 15000);
  assert.equal(Number(a.precio_actual), 14000);
  const it = await one(`select * from pedidos_venta_items where id = $1`, [uid(61)]);
  assert.equal(Number(it.precio_lista), 14000);
  assert.equal(Number(it.precio_unitario), 14000);
  assert.equal(Number((await one(`select subtotal from pedidos_venta where id = $1`, [uid(60)])).subtotal), 28000);
});

await test('[RN-PRE-02] precio_unitario inventado por el cliente se recalcula en el servidor (con advertencia)', async () => {
  const r = await aplicar([crear(7, pedido(7, { items: [
    { id: uid(71), articulo_id: CREMA, cantidad: 1, precio_lista: 22000, precio_unitario: 1000 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.deepEqual(advertencias(r), ['PRECIO_CAMBIO']);
  const it = await one(`select * from pedidos_venta_items where id = $1`, [uid(71)]);
  assert.equal(Number(it.precio_unitario), 22000);
});

await test('[RN-PRE-02] si el cliente envía precios correctos no hay advertencia (tolerancia $0,01)', async () => {
  const r = await aplicar([crear(8, pedido(8, { items: [
    { id: uid(81), articulo_id: CREMA, cantidad: 1, precio_lista: 22000.005, precio_unitario: 22000 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.deepEqual(res(r).advertencias, []);
});

await test('[RF-VEN-02] descuento_pct por ítem: el servidor calcula el precio pactado y lo guarda', async () => {
  const r = await aplicar([crear(9, pedido(9, { items: [
    { id: uid(91), articulo_id: CREMA, cantidad: 2, descuento_pct: 10 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const it = await one(`select * from pedidos_venta_items where id = $1`, [uid(91)]);
  assert.equal(Number(it.precio_lista), 22000);
  assert.equal(Number(it.descuento_pct), 10);
  assert.equal(Number(it.precio_unitario), 19800);
  assert.equal(Number((await one(`select subtotal from pedidos_venta where id = $1`, [uid(90)])).subtotal), 39600);
  assert.deepEqual(res(r).advertencias, []);
});

await test('[RN-PRE-01] lista del cliente con respaldo en la pública cuando no tiene precio propio', async () => {
  const r = await aplicar([crear(10, pedido(10, { pedido: { cliente_id: CLI_MAYOR }, items: [
    { id: uid(101), articulo_id: CREMA, cantidad: 1 }, { id: uid(102), articulo_id: CAFE, cantidad: 1 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const it = await q(`select articulo_id, precio_lista from pedidos_venta_items where pedido_id = $1`, [uid(100)]);
  assert.equal(Number(it.find((x) => x.articulo_id === CREMA).precio_lista), 20000);
  assert.equal(Number(it.find((x) => x.articulo_id === CAFE).precio_lista), 15000);
});

await test('[RN-PRE-01] artículo sin precio en ninguna lista: E_PRECIO y no se crea nada', async () => {
  const r = await aplicar([crear(11, pedido(11, { items: [{ articulo_id: SIN_PRECIO, cantidad: 1 }] }))]);
  assert.equal(error(r), 'E_PRECIO');
  assert.equal(await conteo(`pedidos_venta where id = '${uid(110)}'`), 0);
});

await test('[E5] sin stock: el pedido se acepta en recibido con advertencia STOCK', async () => {
  const r = await aplicar([crear(12, pedido(12, { items: [{ id: uid(121), articulo_id: CREMA, cantidad: 8 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.equal(res(r).estado, 'recibido');
  assert.deepEqual(advertencias(r), ['STOCK']);
  const a = res(r).advertencias[0];
  assert.equal(a.articulo_id, CREMA);
  assert.equal(Number(a.requerido), 8);
  assert.equal(Number(a.disponible), 0);
  assert.equal(await conteo(`pedidos_venta where id = '${uid(120)}'`), 1);
});

await test('[E5] con stock suficiente no hay advertencia; la cantidad de varios ítems del mismo artículo se suma', async () => {
  await db.exec(`insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario, motivo)
                 values ('${CAFE}', 'ajuste', 5, 9000, 'inicial')`);
  let r = await aplicar([crear(13, pedido(13, { items: [{ articulo_id: CAFE, cantidad: 5 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.deepEqual(res(r).advertencias, [], 'recibido no reserva: el stock sigue disponible');
  r = await aplicar([crear(14, pedido(14, { items: [
    { articulo_id: CAFE, cantidad: 3 }, { articulo_id: CAFE, cantidad: 3 }] }))]);
  assert.deepEqual(advertencias(r), ['STOCK'], '6 requeridos > 5 disponibles');
  assert.equal(await movs(), 1, 'el pedido no escribe movimientos');
});

await test('[RF-VEN-01] el impuesto lo fija el servidor, no el cliente', async () => {
  const r = await aplicar([crear(15, pedido(15, { items: [
    { id: uid(151), articulo_id: GRAVADO, cantidad: 2, tasa_impuesto: 0 }] }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const it = await one(`select * from pedidos_venta_items where id = $1`, [uid(151)]);
  assert.equal(Number(it.tasa_impuesto), 19);
  const pv = await one(`select * from pedidos_venta where id = $1`, [uid(150)]);
  assert.equal(Number(pv.subtotal), 20000);
  assert.equal(Number(pv.impuestos), 3800);
  assert.equal(Number(pv.total), 23800);
});

await test('[RF-VEN-01] cliente_nuevo: se crea una sola vez y el reenvío del mismo op_id no duplica', async () => {
  const nuevo = { id: uid(960), nombre: 'Carlos Pérez Tienda', telefono: '3205550001', consentimiento_datos: true, municipio: 'Cali' };
  const op = crear(16, { ...pedido(16, { pedido: { cliente_id: null } }), cliente_nuevo: nuevo });
  const r1 = await aplicar([op]);
  assert.equal(r1.resultados[0].status, 'ok', JSON.stringify(r1));
  assert.equal(res(r1).cliente_id, uid(960));
  const t = await one(`select * from terceros where id = $1`, [uid(960)]);
  assert.equal(t.es_cliente, true);
  assert.equal(t.es_proveedor, false);
  assert.equal((await one(`select cliente_id from pedidos_venta where id = $1`, [uid(160)])).cliente_id, uid(960));
  const r2 = await aplicar([op]);
  assert.equal(r2.resultados[0].status, 'ya_aplicada');
  assert.equal(await conteo(`terceros where nombre = 'Carlos Pérez Tienda'`), 1);
  assert.equal(await conteo(`pedidos_venta where id = '${uid(160)}'`), 1);
});

await test('[RF-VEN-01][E14] cliente_nuevo con posible duplicado: devuelve revision y no escribe nada', async () => {
  const antes = { pv: await conteo('pedidos_venta'), t: await conteo('terceros'), i: await conteo('pedidos_venta_items') };
  const nuevo = { nombre: 'Marta G.', telefono: '300 111 2233', consentimiento_datos: true };
  const r = await aplicar([crear(17, { ...pedido(17, { pedido: { cliente_id: null } }), cliente_nuevo: nuevo })]);
  assert.equal(r.resultados[0].status, 'revision', JSON.stringify(r));
  assert.equal(r.detener_cola, true);
  assert.equal(res(r).candidatos[0].id, CLI);
  assert.equal(await conteo('pedidos_venta'), antes.pv);
  assert.equal(await conteo('terceros'), antes.t);
  assert.equal(await conteo('pedidos_venta_items'), antes.i);
});

await test('[RF-VEN-01][E14] con resolucion usar_existente el pedido continúa con el cliente existente', async () => {
  const nuevo = { nombre: 'Marta G.', telefono: '300 111 2233', consentimiento_datos: true,
                  resolucion: { tipo: 'usar_existente', tercero_id: CLI } };
  const r = await aplicar([crear(18, { ...pedido(18, { pedido: { cliente_id: null } }), cliente_nuevo: nuevo })]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.equal(res(r).cliente_id, CLI);
  assert.equal(await conteo(`terceros where nombre = 'Marta G.'`), 0);
});

await test('[RF-VEN-01][E14] con resolucion crear_igual se crea el cliente nuevo', async () => {
  const nuevo = { id: uid(961), nombre: 'Marta Gómez Otra', telefono: '300 111 2233', consentimiento_datos: true,
                  resolucion: { tipo: 'crear_igual' } };
  const r = await aplicar([crear(19, { ...pedido(19, { pedido: { cliente_id: null } }), cliente_nuevo: nuevo })]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.equal(res(r).cliente_id, uid(961));
});

await test('[RF-TER-05] cliente_nuevo sin consentimiento: E_CONSENTIMIENTO y no se crea nada', async () => {
  const antes = await conteo('terceros');
  const r = await aplicar([crear(20, { ...pedido(20, { pedido: { cliente_id: null } }),
    cliente_nuevo: { nombre: 'Sin Consentimiento SAS', telefono: '3115550002' } })]);
  assert.equal(error(r), 'E_CONSENTIMIENTO');
  assert.equal(await conteo('terceros'), antes);
  assert.equal(await conteo(`pedidos_venta where id = '${uid(200)}'`), 0);
});

await test('[RF-VEN-01] cliente: exactamente uno de cliente_id o cliente_nuevo; inexistente es E_REF', async () => {
  let r = await aplicar([crear(21, pedido(21, { cliente_nuevo: { nombre: 'Doble Cliente', consentimiento_datos: true } }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS', 'ambos');
  r = await aplicar([crear(22, pedido(22, { pedido: { cliente_id: null } }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS', 'ninguno');
  r = await aplicar([crear(23, pedido(23, { pedido: { cliente_id: uid(999) } }))]);
  assert.equal(error(r), 'E_REF');
  await db.exec(`insert into terceros (id, nombre, es_proveedor) values ('${uid(902)}', 'Solo Proveedor', true)`);
  r = await aplicar([crear(24, pedido(24, { pedido: { cliente_id: uid(902) } }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS', 'un proveedor que no es cliente');
  assert.equal(await conteo(`terceros where nombre = 'Doble Cliente'`), 0);
});

await test('[RF-VEN-01] validaciones de ítems: vacíos, cantidad, descuento, artículo inexistente', async () => {
  let r = await aplicar([crear(25, pedido(25, { items: [] }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS', 'sin ítems');
  r = await aplicar([crear(26, pedido(26, { items: [{ articulo_id: CAFE, cantidad: 0 }] }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS', 'cantidad 0');
  r = await aplicar([crear(27, pedido(27, { items: [{ articulo_id: CAFE, cantidad: 1, descuento_pct: 101 }] }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS', 'descuento > 100');
  r = await aplicar([crear(28, pedido(28, { items: [{ articulo_id: uid(998), cantidad: 1 }] }))]);
  assert.equal(error(r), 'E_REF', 'artículo inexistente');
  r = await aplicar([crear(29, { items: [{ articulo_id: CAFE, cantidad: 1 }] })]);
  assert.equal(error(r), 'DATOS_INVALIDOS', 'sin objeto pedido');
});

await test('[RF-VEN-01] origen o tipo de entrega desconocidos: DATOS_INVALIDOS', async () => {
  let r = await aplicar([crear(30, pedido(30, { pedido: { origen: 'telepatia' } }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS');
  r = await aplicar([crear(31, pedido(31, { pedido: { entrega_tipo: 'dron' } }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS');
});

await test('[RF-VEN-01] fecha acotada: no puede ser futura (E_FECHA); una fecha pasada se respeta', async () => {
  const futura = new Date(Date.now() + 5 * 86400000).toISOString();
  let r = await aplicar([crear(32, pedido(32, { pedido: { fecha: futura } }))]);
  assert.equal(error(r), 'E_FECHA');
  assert.equal(await conteo(`pedidos_venta where id = '${uid(320)}'`), 0);
  const ayer = new Date(Date.now() - 86400000).toISOString();
  r = await aplicar([crear(33, pedido(33, { pedido: { fecha: ayer } }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const pv = await one(`select fecha from pedidos_venta where id = $1`, [uid(330)]);
  assert.ok(Math.abs(new Date(pv.fecha).getTime() - new Date(ayer).getTime()) < 1000);
  const entrega = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  r = await aplicar([crear(34, pedido(34, { pedido: { fecha_entrega_estimada: entrega } }))]);
  assert.equal(r.resultados[0].status, 'ok', 'la fecha estimada de entrega sí puede ser futura');
});

await test('[RF-VEN-01] atomicidad: si falla un ítem se deshace el pedido y el cliente nuevo', async () => {
  const antes = { pv: await conteo('pedidos_venta'), t: await conteo('terceros'), i: await conteo('pedidos_venta_items') };
  const r = await aplicar([crear(35, { pedido: { id: uid(350), origen: 'web' },
    cliente_nuevo: { nombre: 'Cliente Fantasma', telefono: '3185550003', consentimiento_datos: true },
    items: [{ articulo_id: CAFE, cantidad: 1 }, { articulo_id: uid(997), cantidad: 1 }] })]);
  assert.equal(error(r), 'E_REF');
  assert.equal(await conteo('pedidos_venta'), antes.pv);
  assert.equal(await conteo('terceros'), antes.t);
  assert.equal(await conteo('pedidos_venta_items'), antes.i);
});

await test('[RF-VEN-08] la op fallida no se registra y se puede reenviar corregida con el mismo op_id', async () => {
  const mala = crear(36, pedido(36, { items: [{ articulo_id: uid(996), cantidad: 1 }] }));
  assert.equal(error(await aplicar([mala])), 'E_REF');
  const r = await aplicar([{ ...mala, datos: pedido(36) }]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
});

await test('[RNF-SEC-03] quien no es miembro no puede crear pedidos (NO_AUTORIZADO) y no se escribe nada', async () => {
  await como(USER_X);
  try {
    const r = await aplicar([crear(37, pedido(37))]);
    assert.equal(error(r), 'NO_AUTORIZADO');
  } finally { await como(USER_A); }
  assert.equal(await conteo(`pedidos_venta where id = '${uid(370)}'`), 0);
});

await test('[RF-VEN-08] el pedido creado queda en un estado normal: se puede cancelar desde recibido', async () => {
  await db.exec(`update pedidos_venta set estado = 'cancelado', motivo_estado = 'prueba' where id = '${uid(10)}'`);
  assert.equal((await one(`select estado from pedidos_venta where id = $1`, [uid(10)])).estado, 'cancelado');
});

console.log(`\n${passed} pruebas ok`);
