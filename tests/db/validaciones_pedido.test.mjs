// Pruebas de la migración 0015_validaciones_pedido.sql (H-05, H-07, H-08; D-015, CAM-94). Ejecutar: npm run test:db
// El servidor decide (regla 3): total no negativo, descuento <= subtotal, motivos y campos obligatorios de la spec,
// y una sola vía para el costo del flete (el costo de envío del pedido).
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
for (const f of ['0001_core.sql', '0002_sync.sql', '0003_aplicar_ops.sql', '0006_fix_touch_padre.sql', '0007_op_tercero.sql',
                 '0009_op_gasto_adjunto.sql', '0010_op_pedido_venta.sql', '0011_candado_finalizados.sql',
                 '0013_cerrar_escritura_directa.sql', '0015_validaciones_pedido.sql']) {
  if (!existsSync(new URL(`../../supabase/migrations/${f}`, import.meta.url))) {
    console.log(`  (aún no existe ${f}: las pruebas de validación deben fallar)`);
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
const rejects = async (sql, params = [], patron) => {
  await assert.rejects(() => db.query(sql, params), patron, `debía rechazarse: ${sql}`);
};
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};
let seq = 0;
const uid = () => `dddddddd-0000-0000-0000-${String(++seq).padStart(12, '0')}`;
const aplicar = async (ops) => (await one(`select aplicar_ops($1::jsonb) r`, [JSON.stringify(ops)])).r;
const error = (r, i = 0) => r.resultados[i].error?.codigo;

// ---------- Datos base: stock 50 y un precio de lista ----------
const prov = (await one(`insert into terceros (nombre, es_proveedor) values ('Don Luis', true) returning id`)).id;
const cli = (await one(`insert into terceros (nombre, es_cliente, consentimiento_datos, consentimiento_en)
                        values ('María', true, true, now()) returning id`)).id;
const prod = (await one(`insert into productos (nombre, categoria) values ('Café', 'Café') returning id`)).id;
const art = (await one(`insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad)
                        values ($1,$2,'Café 500 g',500,'g') returning id`, [prod, prov])).id;
const publica = (await one(`select id from listas_precio where es_publica`)).id;
await q(`insert into precios (lista_id, articulo_id, precio) values ($1,$2,20000)`, [publica, art]);
const oc = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
{
  const it = (await one(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,50,10000) returning id`, [oc, art])).id;
  await q(`update ordenes_compra set estado='pedida' where id=$1`, [oc]);
  const r = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [oc])).id;
  await q(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,50)`, [r, it]);
}
// Pedido confirmado de 2 und a 20.000 (subtotal 40.000), entrega por transportadora (valor por defecto)
const pedidoConfirmado = async () => {
  const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
  await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,2,20000,20000)`, [p, art]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  return p;
};
const cobrar = (p, v) => q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',$2)`, [p, v]);
const estado = async (p) => (await one(`select estado from pedidos_venta where id=$1`, [p])).estado;

// ---------- H-05 · total no negativo y descuento <= subtotal ----------
await test('[RF-VEN-03] pedido_venta.crear rechaza descuento mayor que el subtotal', async () => {
  const r = await aplicar([{ op_id: uid(), tipo: 'pedido_venta.crear', datos: {
    pedido: { cliente_id: cli, descuento_valor: 50000 }, items: [{ articulo_id: art, cantidad: 2 }] } }]);
  assert.equal(error(r), 'DATOS_INVALIDOS');
  assert.equal(Number((await one(`select count(*) n from pedidos_venta where cliente_id=$1`, [cli])).n), 0);
});
await test('[RF-VEN-03] pedido_venta.crear acepta descuento igual al subtotal (total 0)', async () => {
  const r = await aplicar([{ op_id: uid(), tipo: 'pedido_venta.crear', datos: {
    pedido: { cliente_id: cli, descuento_valor: 40000 }, items: [{ articulo_id: art, cantidad: 2 }] } }]);
  assert.equal(r.resultados[0].status, 'ok');
  assert.equal(Number(r.resultados[0].resultado.total), 0);
});
await test('[RF-VEN-03] finalizar rechaza descuento mayor que el subtotal (total negativo) aunque no haya que cobrar', async () => {
  const p = await pedidoConfirmado();
  await q(`update pedidos_venta set descuento_valor = 50000, entrega_tipo = 'propia' where id=$1`, [p]);
  assert.ok(Number((await one(`select total from pedidos_venta where id=$1`, [p])).total) < 0);
  await rejects(`update pedidos_venta set estado='finalizado' where id=$1`, [p], /descuento|total/i);
  assert.equal(await estado(p), 'confirmado');
  assert.equal(Number((await one(`select count(*) n from movimientos_inventario where tipo='venta'`)).n), 0);
});
await test('[RF-VEN-03] finalizar con descuento igual al subtotal (total 0) sigue permitido', async () => {
  const p = await pedidoConfirmado();
  await q(`update pedidos_venta set descuento_valor = 40000, entrega_tipo = 'propia' where id=$1`, [p]);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  assert.equal(await estado(p), 'finalizado');
});

// ---------- H-07 · motivos y campos obligatorios (RF-VEN-05) ----------
for (const desde of ['recibido', 'confirmado']) {
  await test(`[RF-VEN-05] ${desde} -> cancelado exige motivo (ausente o en blanco)`, async () => {
    const p = (await one(`insert into pedidos_venta (cliente_id) values ($1) returning id`, [cli])).id;
    await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,1,20000,20000)`, [p, art]);
    if (desde === 'confirmado') await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
    await rejects(`update pedidos_venta set estado='cancelado' where id=$1`, [p], /motivo/i);
    await rejects(`update pedidos_venta set estado='cancelado', motivo_estado='   ' where id=$1`, [p], /motivo/i);
    await q(`update pedidos_venta set estado='cancelado', motivo_estado='cliente desistió' where id=$1`, [p]);
    const ev = await one(`select motivo from eventos_estado where entidad_id=$1 and estado_nuevo='cancelado'`, [p]);
    assert.equal(ev.motivo, 'cliente desistió');
  });
}
await test('[RF-VEN-05] devuelto exige motivo', async () => {
  const p = await pedidoConfirmado();
  await q(`update pedidos_venta set entrega_tipo='recoge' where id=$1`, [p]);
  await cobrar(p, 40000);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  await rejects(`update pedidos_venta set estado='devuelto' where id=$1`, [p], /motivo/i);
  await q(`update pedidos_venta set estado='devuelto', motivo_estado='empaque dañado' where id=$1`, [p]);
  assert.equal(await estado(p), 'devuelto');
});
await test('[RF-VEN-05] finalizar con transportadora exige envio_costo > 0', async () => {
  const p = await pedidoConfirmado();
  await cobrar(p, 40000);
  await rejects(`update pedidos_venta set estado='finalizado' where id=$1`, [p], /envio_costo/i);
  assert.equal(await estado(p), 'confirmado');
  await q(`update pedidos_venta set envio_costo = 15000 where id=$1`, [p]);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  assert.equal(await estado(p), 'finalizado');
});
await test('[RN-VEN-04] finalizar con entrega propia o recoge no exige envio_costo', async () => {
  for (const tipo of ['propia', 'recoge']) {
    const p = await pedidoConfirmado();
    await q(`update pedidos_venta set entrega_tipo=$2 where id=$1`, [p, tipo]);
    await cobrar(p, 40000);
    await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
    assert.equal(await estado(p), 'finalizado');
  }
});
await test('[RF-INV-03] ajuste y merma exigen motivo (en blanco también)', async () => {
  for (const tipo of ['ajuste', 'merma']) {
    const cant = tipo === 'merma' ? -1 : 1;
    await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario) values ($1,$2,$3,0)`, [art, tipo, cant], /motivo/i);
    await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario, motivo) values ($1,$2,$3,0,'  ')`, [art, tipo, cant], /motivo/i);
    await q(`insert into movimientos_inventario (articulo_id, tipo, cantidad, costo_unitario, motivo) values ($1,$2,$3,0,'conteo físico')`, [art, tipo, cant]);
  }
});
await test('[RN-DOC-02] anular un documento exige motivo también por UPDATE directo', async () => {
  const p = await pedidoConfirmado();
  await q(`update pedidos_venta set entrega_tipo='recoge' where id=$1`, [p]);
  await cobrar(p, 40000);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [p]);
  const d = await one(`select * from emitir_documento('remision', $1)`, [p]);
  await rejects(`update documentos set anulado_en = now() where id=$1`, [d.id], /motivo/i);
  await rejects(`update documentos set anulado_en = now(), motivo_anulacion = '  ' where id=$1`, [d.id], /motivo/i);
  await rejects(`select anular_documento($1, '')`, [d.id], /motivo/i);
  const a = await one(`select * from anular_documento($1, 'error de cliente')`, [d.id]);
  assert.ok(a.anulado_en);
  assert.equal(a.motivo_anulacion, 'error de cliente');
});

// ---------- H-08 · una sola vía para el costo del flete ----------
await test('[RF-PAG-03] gasto de flete vinculado a un pedido de venta se rechaza (el costo va en envio_costo)', async () => {
  const p = await pedidoConfirmado();
  for (const categoria of ['Flete', ' envío ', 'Transportadora', 'transporte']) {
    const r = await aplicar([{ op_id: uid(), tipo: 'gasto.registrar', datos: { categoria, valor: 15000, pedido_venta_id: p } }]);
    assert.equal(error(r), 'E_FLETE', categoria);
  }
  await rejects(`insert into gastos (categoria, valor, pedido_venta_id) values ('flete', 15000, $1)`, [p], /envio_costo/i);
  assert.equal(Number((await one(`select count(*) n from gastos where pedido_venta_id=$1`, [p])).n), 0);
});
await test('[RF-PAG-03] otros gastos siguen permitidos (otra categoría con pedido, flete de una compra, o sin vínculo)', async () => {
  const p = await pedidoConfirmado();
  const r = await aplicar([
    { op_id: uid(), tipo: 'gasto.registrar', datos: { categoria: 'Empaques', valor: 5000, pedido_venta_id: p } },
    { op_id: uid(), tipo: 'gasto.registrar', datos: { categoria: 'Flete', valor: 8000, orden_compra_id: oc } },
    { op_id: uid(), tipo: 'gasto.registrar', datos: { categoria: 'Combustible', valor: 20000 } },
  ]);
  assert.deepEqual(r.resultados.map((x) => x.status), ['ok', 'ok', 'ok']);
});

console.log(`\n${passed} pruebas pasaron`);
