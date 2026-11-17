// Pruebas del esquema núcleo en Postgres real (PGlite, WASM). Ejecutar: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const MIGRATION = new URL('../../supabase/migrations/0001_core.sql', import.meta.url);

// Stub mínimo de Supabase Auth
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
await db.exec(readFileSync(MIGRATION, 'utf8'));

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_X = '00000000-0000-0000-0000-0000000000ff';
await db.exec(`
  insert into auth.users (id) values ('${USER_A}'), ('${USER_X}');
  insert into miembros (user_id, nombre) values ('${USER_A}', 'Socio A');
  select set_config('request.jwt.claim.sub', '${USER_A}', false);
`);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const num = (v) => Number(v);
const rejects = async (sql, re, params = []) => {
  await assert.rejects(() => db.query(sql, params), (e) => re.test(e.message), `esperaba error ${re} en: ${sql}`);
};

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};

// ---------- Datos base ----------
const prov   = (await one(`insert into terceros (nombre, es_proveedor, telefono) values ('Don Luis (finca)', true, '3001112233') returning id`)).id;
const cli    = (await one(`insert into terceros (nombre, es_cliente, telefono, municipio) values ('María Pérez', true, '3009998877', 'Zarzal') returning id`)).id;
const comercio = (await one(`insert into terceros (nombre, es_cliente, tipo_documento, numero_documento) values ('Tienda La Esquina', true, 'NIT', '900123456') returning id`)).id;
const prodCafe = (await one(`insert into productos (nombre, categoria) values ('Café molido', 'Café') returning id`)).id;
const prodCacao = (await one(`insert into productos (nombre, categoria) values ('Crema de cacao', 'Cacao') returning id`)).id;
const cafe = (await one(`insert into articulos (producto_id, proveedor_id, nombre, marca, presentacion_cantidad, presentacion_unidad)
                         values ($1, $2, 'Café Sierra 500 g', 'Sierra', 500, 'g') returning id`, [prodCafe, prov])).id;
const crema = (await one(`insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad, controla_vencimiento)
                          values ($1, $2, 'Crema de cacao 120 g', 120, 'g', true) returning id`, [prodCacao, prov])).id;

const nuevaOrden = async (items, { estado = 'pedida' } = {}) => {
  const o = (await one(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).id;
  const ids = [];
  for (const [art, cant, costo] of items) {
    ids.push((await one(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,$3,$4) returning id`,
      [o, art, cant, costo])).id);
  }
  if (estado === 'pedida') await q(`update ordenes_compra set estado = 'pedida' where id = $1`, [o]);
  return { orden: o, items: ids };
};
const recibir = async (orden, itemId, cantidad, extra = {}) => {
  const r = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [orden])).id;
  return one(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad, lote_codigo, fecha_vencimiento)
              values ($1,$2,$3,$4,$5) returning id`, [r, itemId, cantidad, extra.lote ?? null, extra.vence ?? null]);
};
const stock = async (art) => one(`select * from v_stock where articulo_id = $1`, [art]);
const costoProm = async (art) => num((await one(`select costo_promedio from articulos where id = $1`, [art])).costo_promedio);

console.log('\nCompras, recepción y costo promedio');

await test('[RN-INV-04][RN-COS-01] una compra recibida suma stock y fija el costo', async () => {
  const { orden, items } = await nuevaOrden([[cafe, 10, 10000]]);
  await recibir(orden, items[0], 10);
  assert.equal(num((await stock(cafe)).fisico), 10);
  assert.equal(await costoProm(cafe), 10000);
  assert.equal((await one(`select estado from ordenes_compra where id=$1`, [orden])).estado, 'recibida');
});

await test('[RN-COS-01] segunda compra a otro precio recalcula el costo promedio ponderado', async () => {
  const { orden, items } = await nuevaOrden([[cafe, 10, 12000]]);
  await recibir(orden, items[0], 10);
  assert.equal(num((await stock(cafe)).fisico), 20);
  assert.equal(await costoProm(cafe), 11000);
});

await test('[RN-COM-01][RN-INV-02][E8] recepción parcial: en camino baja y estado pasa a recibida_parcial → recibida', async () => {
  const { orden, items } = await nuevaOrden([[cafe, 20, 11000]]);
  assert.equal(num((await stock(cafe)).en_camino), 20);
  await recibir(orden, items[0], 8);
  assert.equal((await one(`select estado from ordenes_compra where id=$1`, [orden])).estado, 'recibida_parcial');
  assert.equal(num((await stock(cafe)).en_camino), 12);
  await recibir(orden, items[0], 12);
  assert.equal((await one(`select estado from ordenes_compra where id=$1`, [orden])).estado, 'recibida');
  assert.equal(num((await stock(cafe)).en_camino), 0);
  assert.equal(num((await stock(cafe)).fisico), 40);
});

await test('[RN-COM-01] no se puede recibir más de lo pedido', async () => {
  const { orden, items } = await nuevaOrden([[cafe, 5, 11000]]);
  const r =(await one(`insert into recepciones (orden_id) values ($1) returning id`, [orden])).id;
  await rejects(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ('${r}','${items[0]}', 6)`, /Sobre-recepción/);
  await q(`update ordenes_compra set estado='cancelada' where id=$1`, [orden]);
});

await test('[RN-COM-02] artículo con vencimiento exige fecha y crea el lote', async () => {
  const { orden, items } = await nuevaOrden([[crema, 12, 15000]]);
  const r = (await one(`insert into recepciones (orden_id) values ($1) returning id`, [orden])).id;
  await rejects(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ('${r}','${items[0]}', 12)`, /exige fecha de vencimiento/);
  await recibir(orden, items[0], 12, { lote: 'CAC-2611', vence: '2027-06-30' });
  const lote = await one(`select * from lotes where articulo_id = $1`, [crema]);
  assert.equal(lote.codigo, 'CAC-2611');
  assert.equal(num((await stock(crema)).fisico), 12);
  const mov = await one(`select lote_id from movimientos_inventario where articulo_id=$1`, [crema]);
  assert.equal(mov.lote_id, lote.id);
});

await test('[RN-COM-03] orden de compra: transiciones inválidas y edición bloqueada tras recibir', async () => {
  const { orden, items } = await nuevaOrden([[cafe, 2, 11000]], { estado: 'borrador' });
  await rejects(`update ordenes_compra set estado='recibida' where id='${orden}'`, /Transición no permitida/);
  await q(`update ordenes_compra set estado='pedida' where id=$1`, [orden]);
  await recibir(orden, items[0], 2);
  await rejects(`update ordenes_compra_items set cantidad = 99 where id='${items[0]}'`, /No se pueden editar ítems/);
  await rejects(`update ordenes_compra set estado='cancelada' where id='${orden}'`, /Transición no permitida/);
});

console.log('\nPrecios');
await test('[RN-PRE-01] precio escalonado y lista de comercio estratégico', async () => {
  const publica = (await one(`select id from listas_precio where es_publica`)).id;
  const mayor = (await one(`insert into listas_precio (nombre) values ('Comercio estratégico') returning id`)).id;
  await q(`insert into precios (lista_id, articulo_id, precio, cantidad_minima) values
           ($1,$3,20000,1), ($1,$3,18000,10), ($2,$3,16000,1)`, [publica, mayor, cafe]);
  await q(`update terceros set lista_precio_id = $1 where id = $2`, [mayor, comercio]);
  assert.equal(num((await one(`select precio_para($1,$2,1) p`, [cafe, cli])).p), 20000);
  assert.equal(num((await one(`select precio_para($1,$2,12) p`, [cafe, cli])).p), 18000);
  assert.equal(num((await one(`select precio_para($1,$2,1) p`, [cafe, comercio])).p), 16000);
});

console.log('\nPedidos de venta: reserva al confirmar y descuento al finalizar con el pago');
const nuevoPedido = async (items, cliente = cli) => {
  const p = (await one(`insert into pedidos_venta (cliente_id, origen) values ($1,'whatsapp') returning id`, [cliente])).id;
  for (const [art, cant, lista, pct] of items) {
    const neto = lista * (1 - (pct ?? 0) / 100);
    await q(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, descuento_pct, precio_unitario)
             values ($1,$2,$3,$4,$5,$6)`, [p, art, cant, lista, pct ?? 0, neto]);
  }
  return p;
};
let P1;

await test('[RF-VEN-03] totales del pedido incluyen envío cobrado y se recalculan', async () => {
  P1 = await nuevoPedido([[cafe, 5, 20000]]);
  let p = await one(`select * from pedidos_venta where id=$1`, [P1]);
  assert.equal(num(p.subtotal), 100000);
  assert.equal(num(p.total), 100000);
  await q(`update pedidos_venta set envio_cobrado = 15000, envio_costo = 15000 where id=$1`, [P1]);
  p = await one(`select * from pedidos_venta where id=$1`, [P1]);
  assert.equal(num(p.total), 115000);
});

await test('[RN-INV-02] confirmar reserva stock: comprometido sube y disponible baja', async () => {
  const antes = await stock(cafe);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [P1]);
  const d = await stock(cafe);
  assert.equal(num(d.comprometido), 5);
  assert.equal(num(d.disponible_para_prometer), num(antes.disponible_para_prometer) - 5);
});

await test('[RN-VEN-02] transiciones: no se salta a finalizado, y despacho y entrega ya no existen', async () => {
  const p = await nuevoPedido([[cafe, 1, 20000]]);
  await rejects(`update pedidos_venta set estado='finalizado' where id='${p}'`, /Transición no permitida/);
  await rejects(`update pedidos_venta set estado='despachado' where id='${p}'`, /Transición no permitida|check/);
  await rejects(`update pedidos_venta set estado='entregado' where id='${p}'`, /Transición no permitida|check/);
  await q(`update pedidos_venta set estado='cancelado' where id=$1`, [p]);
});

await test('[RN-VEN-05][E4] no se puede finalizar sin el pago completo', async () => {
  await rejects(`update pedidos_venta set estado='finalizado' where id='${P1}'`, /no está pagado por completo/);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'nequi',10000)`, [P1]);
  await rejects(`update pedidos_venta set estado='finalizado' where id='${P1}'`, /no está pagado por completo/);
  const s = await stock(cafe);
  assert.equal(num(s.comprometido), 5);                       // sigue reservado
});

await test('[RN-INV-03][RN-COS-02][RN-VEN-03][E4] finalizar con pago completo descuenta el stock al costo promedio y registra evento', async () => {
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',105000)`, [P1]);   // 115.000 - 10.000
  const antes = num((await stock(cafe)).fisico);
  await q(`update pedidos_venta set estado='finalizado', motivo_estado='pago confirmado, sale por Servientrega' where id=$1`, [P1]);
  const d = await stock(cafe);
  assert.equal(num(d.fisico), antes - 5);
  assert.equal(num(d.comprometido), 0);
  const mov = await one(`select * from movimientos_inventario where pedido_venta_item_id is not null and tipo='venta' order by id desc limit 1`);
  assert.equal(num(mov.cantidad), -5);
  assert.equal(num(mov.costo_unitario), 11000);
  const ev = await one(`select * from eventos_estado where entidad_id=$1 and estado_nuevo='finalizado'`, [P1]);
  assert.equal(ev.motivo, 'pago confirmado, sale por Servientrega');
  assert.ok((await one(`select finalizado_en from pedidos_venta where id=$1`, [P1])).finalizado_en);
  assert.equal(num((await one(`select count(*) c from v_ventas_pedido where pedido_id=$1`, [P1])).c), 1);
});

await test('[RN-VEN-02] tras finalizar ya no se editan los ítems ni se puede cancelar', async () => {
  await rejects(`update pedidos_venta_items set cantidad = 1 where pedido_id='${P1}'`, /No se pueden editar ítems/);
  await rejects(`update pedidos_venta set estado='cancelado' where id='${P1}'`, /Transición no permitida/);
});

await test('[E5][RN-INV-03] un pedido sin stock se acepta y confirma, pero no se puede finalizar aunque esté pagado', async () => {
  const p = await nuevoPedido([[cafe, 500, 20000]]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  const s = await stock(cafe);
  assert.ok(num(s.faltante) > 0, 'debe aparecer faltante');
  const nec = await one(`select * from v_necesidades_compra where articulo_id=$1`, [cafe]);
  assert.equal(nec.proveedor, 'Don Luis (finca)');
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'transferencia',10000000)`, [p]);
  await rejects(`update pedidos_venta set estado='finalizado' where id='${p}'`, /Stock insuficiente/);
  await q(`update pedidos_venta set estado='cancelado' where id=$1`, [p]);
  assert.equal(num((await stock(cafe)).comprometido), 0);     // cancelar libera la reserva
});

await test('[RN-VEN-02][E11] la devolución del cliente repone el stock y el pedido deja de contar en ventas', async () => {
  const antes = num((await stock(cafe)).fisico);
  await q(`update pedidos_venta set estado='devuelto', motivo_estado='empaque dañado' where id=$1`, [P1]);
  assert.equal(num((await stock(cafe)).fisico), antes + 5);
  assert.equal(num((await one(`select count(*) c from v_ventas_pedido where pedido_id=$1`, [P1])).c), 0);
  await rejects(`update pedidos_venta set estado='finalizado' where id='${P1}'`, /Transición no permitida/);
});

console.log('\nDocumentos');
let P2;
await test('[RN-DOC-01][RN-DOC-02][E9] remisión con consecutivo sin huecos; no se duplica; es inmutable; se anula y se reemite', async () => {
  P2 = await nuevoPedido([[cafe, 2, 20000, 10]]);              // 10 % de descuento
  await q(`update pedidos_venta set estado='confirmado', envio_cobrado=15000, envio_costo=15000 where id=$1`, [P2]);
  await rejects(`select emitir_documento('remision', '${P2}')`, /finalizados/);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'nequi',51000)`, [P2]);
  await q(`update pedidos_venta set estado='finalizado' where id=$1`, [P2]);
  const d1 = await one(`select * from emitir_documento('remision', $1)`, [P2]);
  assert.equal(d1.numero, 'RM-000001');
  assert.equal(num(d1.totales.total), 51000);                    // 36000 + 15000 envío
  assert.equal(d1.lineas[0].descripcion, 'Café Sierra 500 g');
  await rejects(`select emitir_documento('remision', '${P2}')`, /Ya existe/);
  await rejects(`update documentos set totales = '{}'::jsonb where id='${d1.id}'`, /no se puede modificar/);
  await rejects(`delete from documentos where id='${d1.id}'`, /no se eliminan/);
  await q(`select anular_documento($1, 'error de cliente')`, [d1.id]);
  const d2 = await one(`select * from emitir_documento('remision', $1)`, [P2]);
  assert.equal(d2.numero, 'RM-000002');
});

await test('[RF-DOC-01][RF-DOC-06] confirmación de pedido: sin consecutivo y repetible (sirve offline/borrador)', async () => {
  const a = await one(`select * from emitir_documento('confirmacion', $1)`, [P2]);
  const b = await one(`select * from emitir_documento('confirmacion', $1)`, [P2]);
  assert.equal(a.numero, null);
  assert.notEqual(a.id, b.id);
});

await test('[RF-COM-07][RN-DOC-01] comprobante de compra al proveedor', async () => {
  const { orden, items } = await nuevaOrden([[cafe, 4, 11500]]);
  await recibir(orden, items[0], 4);
  const c = await one(`select * from emitir_documento('comprobante_compra', null, $1)`, [orden]);
  assert.equal(c.numero, 'CP-000001');
  assert.equal(num(c.totales.total), 46000);
});

console.log('\nPagos, cuentas y dashboard');
await test('[RN-PAG-01][RF-COM-05] pago a proveedor y cuentas por pagar (base para crédito futuro)', async () => {
  const { orden, items } = await nuevaOrden([[cafe, 10, 11000]]);
  await q(`update ordenes_compra set condicion_pago='credito', dias_credito=15 where id=$1`, [orden]);
  await recibir(orden, items[0], 10);
  let cxp = await one(`select * from v_cuentas_por_pagar where orden_id=$1`, [orden]);
  assert.equal(num(cxp.saldo), 110000);
  await q(`insert into pagos (direccion, orden_compra_id, medio, valor, pagado_por) values ('pago',$1,'efectivo',40000,$2)`, [orden, USER_A]);
  cxp = await one(`select * from v_cuentas_por_pagar where orden_id=$1`, [orden]);
  assert.equal(num(cxp.saldo), 70000);
  await rejects(`insert into pagos (direccion, orden_compra_id, pedido_venta_id, medio, valor) values ('pago','${orden}','${P2}','efectivo',1)`, /check/);
});

await test('[RF-PAG-02][RN-PAG-01] pedidos esperando pago: saldo por cobrar y cobro parcial', async () => {
  const p3 = await nuevoPedido([[cafe, 1, 20000]]);
  await q(`update pedidos_venta set estado='confirmado' where id=$1`, [p3]);
  let cxc = await one(`select * from v_cuentas_por_cobrar where pedido_id=$1`, [p3]);
  assert.equal(num(cxc.saldo), 20000);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'nequi',5000)`, [p3]);
  cxc = await one(`select * from v_cuentas_por_cobrar where pedido_id=$1`, [p3]);
  assert.equal(num(cxc.saldo), 15000);
  await q(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'nequi',15000)`, [p3]);
  assert.equal(await one(`select * from v_cuentas_por_cobrar where pedido_id=$1`, [p3]), undefined);
  assert.equal(await one(`select * from v_cuentas_por_cobrar where pedido_id=$1`, [P2]), undefined);   // un pedido finalizado ya no está esperando pago
});

await test('[RN-COS-03][E10] resumen del periodo: ventas, descuentos, envíos, costos, gastos y utilidad', async () => {
  await q(`insert into gastos (categoria, concepto, valor) values ('combustible','viaje a la finca', 5000)`);
  const hoy = (await one(`select (now() at time zone 'America/Bogota')::date d`)).d;
  const r = await one(`select * from resumen_periodo($1::date, $1::date)`, [hoy]);
  // Solo P2 cuenta (P1 fue devuelto): 2 und a 18.000 (lista 20.000, 10 %), envío 15.000 cobrado y pagado
  assert.equal(r.pedidos, 1);
  assert.equal(num(r.unidades), 2);
  assert.equal(num(r.ventas_lista), 40000);
  assert.equal(num(r.ventas_netas), 36000);
  assert.equal(num(r.descuentos), 4000);
  assert.equal(num(r.envio_cobrado), 15000);
  assert.equal(num(r.envio_costo), 15000);
  assert.equal(num(r.costo_mercancia), 22000);
  assert.equal(num(r.gastos), 5000);
  assert.equal(num(r.utilidad_neta), 36000 + 15000 - 15000 - 22000 - 5000);  // 9.000
  const top = await one(`select * from v_ventas_por_articulo order by unidades desc limit 1`);
  assert.equal(top.nombre, 'Café Sierra 500 g');
  assert.equal(num(top.margen), 36000 - 22000);
});

console.log('\nIntegridad y seguridad');
await test('[RN-INV-01] el libro de movimientos es append-only', async () => {
  await rejects(`update movimientos_inventario set cantidad = 1`, /append-only/);
  await rejects(`delete from movimientos_inventario`, /append-only/);
});

await test('[RN-INV-04] signo de movimientos validado (una venta no puede ser positiva)', async () => {
  await rejects(`insert into movimientos_inventario (articulo_id, tipo, cantidad) values ('${cafe}','venta', 3)`, /check/);
});

await test('[RF-SYN-05][E2] op_id único: una operación repetida no duplica registros', async () => {
  const op = '11111111-1111-1111-1111-111111111111';
  await q(`insert into terceros (nombre, es_proveedor, op_id) values ('Proveedor offline', true, $1)`, [op]);
  await rejects(`insert into terceros (nombre, es_proveedor, op_id) values ('Proveedor offline', true, '${op}')`, /unique|duplicate/);
  await q(`insert into terceros (nombre, es_proveedor, op_id) values ('Proveedor offline', true, $1) on conflict (op_id) do nothing`, [op]);
  assert.equal(num((await one(`select count(*) c from terceros where op_id=$1`, [op])).c), 1);
});

await test('[RNF-SEC-02][E12] RLS: un usuario autenticado que NO es miembro ve 0 filas; un miembro sí ve datos', async () => {
  await db.exec(`
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER_X}', false);`);
  const noMiembro = {
    terceros: num((await one(`select count(*) c from terceros`)).c),
    stock: num((await one(`select count(*) c from v_stock`)).c),
    documentos: num((await one(`select count(*) c from documentos`)).c),
  };
  await rejects(`insert into terceros (nombre, es_cliente) values ('intruso', true)`, /row-level security/);
  await db.exec(`select set_config('request.jwt.claim.sub', '${USER_A}', false);`);
  const miembro = num((await one(`select count(*) c from terceros`)).c);
  const vistaMiembro = num((await one(`select count(*) c from v_stock`)).c);
  await db.exec(`reset role;`);
  assert.deepEqual(noMiembro, { terceros: 0, stock: 0, documentos: 0 });
  assert.ok(miembro > 0 && vistaMiembro > 0);
});

console.log(`\n${passed} pruebas OK${process.exitCode ? ' — HAY FALLAS' : ''}`);
