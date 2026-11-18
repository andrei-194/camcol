// T-M1-10 (CAM-40) · las ops de aplicar_ops (migraciones 0001-0014 aplicadas por `supabase db reset`)
// de punta a punta con el JWT real de un miembro, vía PostgREST. Cierra el ciclo: compra, gasto, adjunto,
// pedido, cobro, finalización (stock + costo) y documento.
// Ejecutar: npm run test:integration
import assert from 'node:assert/strict';
import { conectar, sesion, hacerMiembro, rest, rpc, aplicarOps, uuid, nuevoRunner } from './entorno.mjs';

const { test } = nuevoRunner();
const admin = await conectar();
const socio = await sesion('socio-a@integracion.test');
await hacerMiembro(admin, socio, 'Socio A');
const T = socio.token;
const sufijo = uuid().slice(0, 8);

const op = (tipo, datos) => ({ op_id: uuid(), tipo, datos });
const unica = async (ops) => {
  const r = await aplicarOps(T, ops);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
};
const ok = (r, i = 0) => { assert.equal(r.resultados[i].status, 'ok', JSON.stringify(r.resultados[i])); return r.resultados[i].resultado; };

// Maestros: se crean con el JWT del miembro (escritura directa de maestros, requiere conexión)
const prod = (await rest(T, 'POST', 'productos', { body: { nombre: `Café e2e ${sufijo}`, categoria: 'Café' }, headers: { Prefer: 'return=representation' } })).json[0];
const art = (await rest(T, 'POST', 'articulos', { body: { producto_id: prod.id, nombre: `Café e2e 500 g ${sufijo}`, presentacion_cantidad: 500, presentacion_unidad: 'g' }, headers: { Prefer: 'return=representation' } })).json[0];
const publica = (await rest(T, 'GET', 'listas_precio?es_publica=eq.true&select=id')).json[0].id;
await rest(T, 'POST', 'precios', { body: { lista_id: publica, articulo_id: art.id, precio: 20000, cantidad_minima: 1 } });

let proveedorId, clienteId, pedidoId, ordenId;

console.log('\nT-M1-10 · ops de punta a punta con JWT de miembro');

await test('[RF-TER-04] tercero.crear (proveedor y cliente con consentimiento) por aplicar_ops', async () => {
  const r = await unica([
    op('tercero.crear', { nombre: `Don Luis e2e ${sufijo}`, es_proveedor: true, telefono: `30${Math.floor(10000000 + Math.random() * 89999999)}` }),
    op('tercero.crear', { nombre: `María e2e ${sufijo}`, es_cliente: true, consentimiento_datos: true, telefono: `31${Math.floor(10000000 + Math.random() * 89999999)}` }),
  ]);
  proveedorId = ok(r, 0).id; clienteId = ok(r, 1).id;
  assert.ok(proveedorId && clienteId);
});

await test('[RN-COM-04][RN-COS-01] orden_compra.registrar "apertura": suma stock inicial sin pagos', async () => {
  const r = await unica([op('orden_compra.registrar', {
    orden: { proveedor_id: proveedorId, modalidad: 'apertura' },
    items: [{ articulo_id: art.id, cantidad: 10, costo_unitario: 8000 }],
    recepcion: { items: [{ item: 0, cantidad: 10 }] },
  })]);
  const res = ok(r);
  assert.equal(res.estado, 'recibida');
  const v = (await rest(T, 'GET', `v_stock?articulo_id=eq.${art.id}&select=fisico`)).json[0];
  assert.equal(Number(v.fisico), 10);
});

await test('[RF-COM-02][E1] orden_compra.registrar inmediata (recepción + pago del socio): stock +5 y costo promedio ponderado', async () => {
  const r = await unica([op('orden_compra.registrar', {
    orden: { proveedor_id: proveedorId, modalidad: 'inmediata' },
    items: [{ articulo_id: art.id, cantidad: 5, costo_unitario: 9000 }],
    recepcion: { items: [{ item: 0, cantidad: 5 }] },
    pagos: [{ medio: 'efectivo', valor: 45000, pagado_por: socio.id }],
  })]);
  const res = ok(r);
  ordenId = res.orden_id;
  assert.equal(Number(res.total), 45000);
  assert.equal(Number((await rest(T, 'GET', `v_stock?articulo_id=eq.${art.id}&select=fisico`)).json[0].fisico), 15);
  const a = (await rest(T, 'GET', `articulos?id=eq.${art.id}&select=costo_promedio`)).json[0];
  assert.ok(Math.abs(Number(a.costo_promedio) - (10 * 8000 + 5 * 9000) / 15) < 0.01, `costo ${a.costo_promedio}`);
});

await test('[RF-COM-02][RF-SYN-09] gasto.registrar y adjunto.vincular', async () => {
  const r = await unica([op('gasto.registrar', { categoria: 'Combustible', valor: 30000, concepto: 'Viaje e2e', pagado_por: socio.id })]);
  const gasto = ok(r);
  const a = await unica([op('adjunto.vincular', { entidad: 'gasto', entidad_id: gasto.id, path: `soportes/${gasto.id}.jpg`, mime: 'image/jpeg' })]);
  assert.equal(ok(a).entidad_id, gasto.id);
  const vis = (await rest(T, 'GET', `adjuntos?entidad_id=eq.${gasto.id}&select=path`)).json;
  assert.equal(vis.length, 1);
});

await test('[RF-VEN-01][RN-PRE-01] pedido_venta.crear (solo con conexión): precios y totales del servidor', async () => {
  const r = await unica([op('pedido_venta.crear', {
    pedido: { cliente_id: clienteId, origen: 'whatsapp', referencia_origen: `CC-${sufijo}`, entrega_tipo: 'recoge' },
    items: [{ articulo_id: art.id, cantidad: 2 }],
  })]);
  const res = ok(r);
  pedidoId = res.pedido_id;
  assert.equal(res.estado, 'recibido');
  assert.equal(Number(res.total), 40000);
});

await test('[RN-VEN-05][RN-INV-03][RN-COS-02] confirmar, cobrar y finalizar con el JWT del miembro: descuenta stock al costo promedio', async () => {
  const c = await rest(T, 'PATCH', `pedidos_venta?id=eq.${pedidoId}`, { body: { estado: 'confirmado' }, headers: { Prefer: 'return=representation' } });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  const sinPago = await rest(T, 'PATCH', `pedidos_venta?id=eq.${pedidoId}`, { body: { estado: 'finalizado' } });
  assert.ok(sinPago.status >= 400 && /no está pagado por completo/.test(JSON.stringify(sinPago.json)), JSON.stringify(sinPago.json));
  const pago = await rest(T, 'POST', 'pagos', { body: { direccion: 'cobro', pedido_venta_id: pedidoId, medio: 'nequi', valor: 40000, pagado_por: socio.id } });
  assert.equal(pago.status, 201, JSON.stringify(pago.json));
  const f = await rest(T, 'PATCH', `pedidos_venta?id=eq.${pedidoId}`, { body: { estado: 'finalizado' }, headers: { Prefer: 'return=representation' } });
  assert.equal(f.status, 200, JSON.stringify(f.json));
  assert.equal(f.json[0].estado, 'finalizado');
  assert.equal(Number((await rest(T, 'GET', `v_stock?articulo_id=eq.${art.id}&select=fisico`)).json[0].fisico), 13);
  const venta = (await rest(T, 'GET', `v_ventas_pedido?pedido_id=eq.${pedidoId}`)).json;
  assert.equal(venta.length, 1);
});

await test('[RN-VEN-03] el candado de pedidos finalizados rige por PostgREST: no se reescribe el total', async () => {
  const r = await rest(T, 'PATCH', `pedidos_venta?id=eq.${pedidoId}`, { body: { total: 1 } });
  assert.ok(r.status >= 400, `se esperaba rechazo, HTTP ${r.status}`);
});

await test('[RN-DOC-01][E9] emitir_documento (remisión) por RPC: consecutivo asignado por el servidor', async () => {
  const d = await rpc(T, 'emitir_documento', { p_tipo: 'remision', p_pedido: pedidoId });
  assert.equal(d.status, 200, JSON.stringify(d.json));
  assert.match(d.json.prefijo, /^RM/);
  assert.ok(Number(d.json.consecutivo) >= 1);
  const otra = await rpc(T, 'emitir_documento', { p_tipo: 'remision', p_pedido: pedidoId });
  assert.ok(otra.status >= 400, 'emitir otra remisión vigente debe fallar');
  const comp = await rpc(T, 'emitir_documento', { p_tipo: 'comprobante_compra', p_orden: ordenId });
  assert.equal(comp.status, 200, JSON.stringify(comp.json));
});

await test('[RF-SYN-01] idempotencia real: reenviar el mismo op_id devuelve ya_aplicada y no duplica', async () => {
  const o = op('gasto.registrar', { categoria: 'Empaques', valor: 5000 });
  const a = await unica([o]); const b = await unica([o]);
  assert.equal(a.resultados[0].status, 'ok');
  assert.equal(b.resultados[0].status, 'ya_aplicada');
  assert.equal(b.resultados[0].resultado.id, a.resultados[0].resultado.id);
  assert.equal(Number((await admin.query(`select count(*) n from sync_ops where op_id=$1`, [o.op_id])).rows[0].n), 1);
});

await test('[RF-SYN-06] el rechazo del servidor llega como error de la op (HTTP 200), distinguible de un fallo de red; las demás ops del lote se aplican', async () => {
  const r = await unica([
    op('gasto.registrar', { categoria: 'Inválido', valor: -5 }),
    op('gasto.registrar', { categoria: 'Válido', valor: 1000 }),
    op('no.existe', {}),
  ]);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(r.resultados[0].error.codigo, 'DATOS_INVALIDOS');
  assert.equal(r.resultados[1].status, 'ok');
  assert.equal(r.resultados[2].error.codigo, 'TIPO_DESCONOCIDO');
  assert.equal(r.detener_cola, true);
});

await test('[RF-SYN-06][E14] tercero.crear con teléfono repetido devuelve revision con el candidato (y no escribe)', async () => {
  const tel = `32${Math.floor(10000000 + Math.random() * 89999999)}`;
  const nombre = `Proveedor dup ${sufijo}`;
  ok(await unica([op('tercero.crear', { nombre, es_proveedor: true, telefono: tel })]));
  const r = await unica([op('tercero.crear', { nombre: `Otro nombre ${sufijo}`, es_proveedor: true, telefono: tel })]);
  assert.equal(r.resultados[0].status, 'revision');
  assert.equal(r.resultados[0].resultado.candidatos.length, 1);
});

await test('[RF-SYN-04] sync_pull entrega al miembro lo recién creado (pedido, artículo y stock)', async () => {
  const s = await rpc(T, 'sync_pull', {});
  assert.equal(s.status, 200, JSON.stringify(s.json).slice(0, 300));
  const texto = JSON.stringify(s.json);
  assert.ok(texto.includes(art.id), 'el artículo debe venir en sync_pull');
  assert.ok(texto.includes(pedidoId), 'el pedido debe venir en sync_pull');
});

await test('[RF-PAG-04][RN-PAG-03/04][E16] pago.reembolsar (solo con conexión): cancelar con cobro, reembolsar por partes, por reembolsar y resumen', async () => {
  const cli2 = (await admin.query(`insert into terceros (nombre, es_cliente) values ($1, true) returning id`, [`Cliente reembolso ${sufijo}`])).rows[0].id;
  const p = (await admin.query(`insert into pedidos_venta (cliente_id, entrega_tipo) values ($1,'recoge') returning id`, [cli2])).rows[0].id;
  await admin.query(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,5,20000,20000)`, [p, art.id]);
  await admin.query(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  await admin.query(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'nequi',40000)`, [p]);
  const sobre = await rest(T, 'POST', 'pagos', { body: { direccion: 'cobro', pedido_venta_id: p, medio: 'efectivo', valor: 60001 } });
  assert.ok(sobre.status >= 400, 'el cobro por encima del total debía rechazarse por PostgREST');
  await admin.query(`update pedidos_venta set estado='cancelado', motivo_estado='cliente desistió' where id=$1`, [p]);
  const por = await rest(T, 'GET', `v_por_reembolsar?pedido_id=eq.${p}&select=por_reembolsar,cobrado,reembolsado`);
  assert.equal(Number(por.json[0].por_reembolsar), 40000);
  const r1 = await unica([op('pago.reembolsar', { pedido_id: p, valor: 15000, medio: 'nequi', motivo: 'parcial' })]);
  assert.equal(Number(ok(r1).cobrado_neto_restante), 25000);
  const exceso = await unica([op('pago.reembolsar', { pedido_id: p, valor: 25001, medio: 'nequi', motivo: 'exceso' })]);
  assert.equal(exceso.resultados[0].error.codigo, 'E_SOBREPAGO');
  const mismo = op('pago.reembolsar', { pedido_id: p, valor: 25000, medio: 'nequi', motivo: 'resto' });
  const r2 = await unica([mismo]);
  assert.equal(ok(r2).por_reembolsar, false);
  assert.equal((await unica([mismo])).resultados[0].status, 'ya_aplicada');
  assert.equal((await rest(T, 'GET', `v_por_reembolsar?pedido_id=eq.${p}&select=pedido_id`)).json.length, 0);
  const hoy = (await admin.query(`select (now() at time zone 'America/Bogota')::date::text d`)).rows[0].d;
  const resumen = await rpc(T, 'resumen_periodo', { p_desde: hoy, p_hasta: hoy });
  assert.ok(Number(resumen.json[0].reembolsos) >= 40000, JSON.stringify(resumen.json));
  const s = await rpc(T, 'sync_pull', { desde: '2000-01-01T00:00:00Z' });   // un PV cancelado no entra al snapshot inicial
  const ped = s.json.pedidos_venta.find((x) => x.id === p);
  assert.deepEqual(ped.pagos.map((g) => g.direccion).sort(), ['cobro', 'reembolso', 'reembolso']);
});

await admin.end();
