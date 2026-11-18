// Pruebas de la migración 0008_op_compra.sql en Postgres real (PGlite). Ejecutar: npm run test:db
// T-M1-06 (CAM-36) · RF-COM-02/03/04/05, [E1] (parte servidor), [E8]: op orden_compra.registrar.
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
for (const f of ['0001_core.sql', '0002_sync.sql', '0003_aplicar_ops.sql', '0007_op_tercero.sql', '0008_op_compra.sql']) {
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

const uid = (n) => `dddddddd-0000-0000-0000-${String(n).padStart(12, '0')}`;
const aplicar = async (ops) => (await one(`select aplicar_ops($1::jsonb) r`, [JSON.stringify(ops)])).r;
const compra = (n, datos) => ({ op_id: uid(n), tipo: 'orden_compra.registrar', datos });
const error = (r, i = 0) => r.resultados[i].error?.codigo;
const stock = async (art) => Number((await one(`select coalesce(sum(cantidad),0) s from movimientos_inventario where articulo_id = $1`, [art])).s);
const costo = async (art) => Number((await one(`select costo_promedio c from articulos where id = $1`, [art])).c);
const conteo = async (t) => Number((await one(`select count(*) n from ${t}`)).n);

// Datos base
const PROV = uid(900);
const prod = (await one(`insert into productos (nombre, categoria) values ('Café', 'Café') returning id`)).id;
await db.exec(`insert into terceros (id, nombre, es_proveedor, telefono) values ('${PROV}', 'Don Luis (finca)', true, '3001112233')`);
const art = async (nombre, vence = false) => (await one(
  `insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad, controla_vencimiento)
   values ($1, $2, $3, 500, 'g', $4) returning id`, [prod, PROV, nombre, vence])).id;
const CAFE = await art('Café Sierra 500 g');
const CAFE2 = await art('Café Sierra 250 g');
const CREMA = await art('Crema de cacao 120 g', true);

// Compra inmediata base: 10 und a $10.000 = $100.000, recibida completa y pagada
const inmediata = (n, extra = {}) => {
  const it = uid(n * 10 + 1);
  return {
    orden: { id: uid(n * 10), proveedor_id: PROV, modalidad: 'inmediata', ...(extra.orden || {}) },
    items: extra.items ?? [{ id: it, articulo_id: CAFE, cantidad: 10, costo_unitario: 10000 }],
    recepcion: extra.recepcion === undefined
      ? { id: uid(n * 10 + 2), items: [{ id: uid(n * 10 + 3), orden_item_id: it, cantidad: 10 }] }
      : extra.recepcion,
    pagos: extra.pagos ?? [{ id: uid(n * 10 + 4), medio: 'efectivo', valor: 100000, pagado_por: USER_A }],
  };
};

console.log('\nT-M1-06 · orden_compra.registrar');

await test('[RF-COM-02] el tipo orden_compra.registrar está registrado en tipos_op', async () => {
  const t = await one(`select funcion from tipos_op where tipo = 'orden_compra.registrar'`);
  assert.ok(t, 'tipo no registrado');
});

await test('[RF-COM-02][E1] compra inmediata completa: OC recibida, stock +10, costo promedio y pago', async () => {
  const r = await aplicar([compra(1, inmediata(1))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const oc = await one(`select * from ordenes_compra where id = $1`, [uid(10)]);
  assert.equal(oc.estado, 'recibida');
  assert.equal(Number(oc.total), 100000);
  assert.equal(oc.modalidad, 'inmediata');
  assert.equal(await stock(CAFE), 10);
  assert.equal(await costo(CAFE), 10000);
  const p = await one(`select * from pagos where orden_compra_id = $1`, [uid(10)]);
  assert.equal(p.direccion, 'pago');
  assert.equal(Number(p.valor), 100000);
  assert.equal(p.medio, 'efectivo');
  assert.equal(p.pagado_por, USER_A);
  assert.equal(r.resultados[0].resultado.orden_id, uid(10));
});

await test('[RF-COM-04] una segunda compra recalcula el costo promedio ponderado', async () => {
  // 10 und a 10.000 ya en stock; 10 más a 12.000 -> promedio 11.000
  const it = uid(21);
  const r = await aplicar([compra(2, inmediata(2, {
    items: [{ id: it, articulo_id: CAFE, cantidad: 10, costo_unitario: 12000 }],
    recepcion: { items: [{ orden_item_id: it, cantidad: 10 }] },
    pagos: [{ medio: 'nequi', valor: 120000 }],
  }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.equal(await stock(CAFE), 20);
  assert.equal(await costo(CAFE), 11000);
});

await test('[RF-COM-05] varios pagos que suman el total se registran todos', async () => {
  const it = uid(31);
  const r = await aplicar([compra(3, inmediata(3, {
    items: [{ id: it, articulo_id: CAFE2, cantidad: 4, costo_unitario: 5000 }],
    recepcion: { items: [{ orden_item_id: it, cantidad: 4 }] },
    pagos: [{ medio: 'efectivo', valor: 15000 }, { medio: 'transferencia', valor: 5000, referencia: 'REF-1' }],
  }))]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const ps = await q(`select medio, valor, referencia from pagos where orden_compra_id = $1 order by valor desc`, [uid(30)]);
  assert.equal(ps.length, 2);
  assert.equal(ps[1].referencia, 'REF-1');
});

await test('[E1] si falla el pago no queda nada a medias (ni OC, ni stock, ni proveedor nuevo)', async () => {
  const antes = { oc: await conteo('ordenes_compra'), t: await conteo('terceros'), mov: await conteo('movimientos_inventario'),
                  rec: await conteo('recepciones'), pagos: await conteo('pagos') };
  const st = await stock(CAFE);
  const d = inmediata(4, { pagos: [{ medio: 'efectivo', valor: 100000, pagado_por: USER_X }] });   // USER_X no es miembro
  delete d.orden.proveedor_id;
  d.proveedor_nuevo = { nombre: 'Finca Rollback', es_proveedor: true, telefono: '3105550000' };
  const r = await aplicar([compra(4, d)]);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(error(r), 'E_REF');
  assert.equal(await conteo('ordenes_compra'), antes.oc);
  assert.equal(await conteo('terceros'), antes.t);
  assert.equal(await conteo('movimientos_inventario'), antes.mov);
  assert.equal(await conteo('recepciones'), antes.rec);
  assert.equal(await conteo('pagos'), antes.pagos);
  assert.equal(await stock(CAFE), st);
  assert.equal((await one(`select count(*)::int n from sync_ops where op_id = $1`, [uid(4)])).n, 0, 'la op fallida no se registra');
});

await test('[E1] medio de pago inválido también deshace todo', async () => {
  const antes = await conteo('ordenes_compra');
  const r = await aplicar([compra(5, inmediata(5, { pagos: [{ medio: 'trueque', valor: 100000 }] }))]);
  assert.equal(r.resultados[0].status, 'error');
  assert.equal(await conteo('ordenes_compra'), antes);
});

await test('[RF-COM-02] proveedor_nuevo se crea una vez dentro de la misma op; el reenvío no duplica', async () => {
  const d = inmediata(6);
  delete d.orden.proveedor_id;
  d.proveedor_nuevo = { id: uid(60), nombre: 'Doña Marta (vereda)', es_proveedor: true, telefono: '3158887766', vereda: 'La Palma' };
  const antesT = await conteo('terceros'), antesOC = await conteo('ordenes_compra'), antesMov = await conteo('movimientos_inventario');
  const r1 = await aplicar([compra(6, d)]);
  assert.equal(r1.resultados[0].status, 'ok', JSON.stringify(r1));
  assert.equal(await conteo('terceros'), antesT + 1);
  const oc = await one(`select proveedor_id from ordenes_compra where id = $1`, [uid(60)]);
  assert.equal(oc.proveedor_id, uid(60));
  const t = await one(`select es_proveedor, es_cliente from terceros where id = $1`, [uid(60)]);
  assert.equal(t.es_proveedor, true);
  assert.equal(t.es_cliente, false);
  const r2 = await aplicar([compra(6, d)]);
  assert.equal(r2.resultados[0].status, 'ya_aplicada');
  assert.equal(await conteo('terceros'), antesT + 1);
  assert.equal(await conteo('ordenes_compra'), antesOC + 1);
  assert.equal(await conteo('movimientos_inventario'), antesMov + 1);
});

await test('[RF-COM-02] proveedor_nuevo duplicado devuelve revisión y no crea nada; con resolución usar_existente continúa', async () => {
  const antes = { t: await conteo('terceros'), oc: await conteo('ordenes_compra') };
  const d = inmediata(7);
  delete d.orden.proveedor_id;
  d.proveedor_nuevo = { nombre: 'Luis (otra finca)', es_proveedor: true, telefono: '300 111 2233' };   // mismo teléfono que PROV
  const r = await aplicar([compra(7, d)]);
  assert.equal(r.resultados[0].status, 'revision');
  assert.equal(r.detener_cola, true);
  assert.equal(r.resultados[0].resultado.candidatos[0].id, PROV);
  assert.equal(await conteo('terceros'), antes.t);
  assert.equal(await conteo('ordenes_compra'), antes.oc);
  d.proveedor_nuevo.resolucion = { tipo: 'usar_existente', tercero_id: PROV };
  const r2 = await aplicar([compra(7, d)]);
  assert.equal(r2.resultados[0].status, 'ok', JSON.stringify(r2));
  assert.equal(await conteo('terceros'), antes.t);
  assert.equal((await one(`select proveedor_id from ordenes_compra where id = $1`, [uid(70)])).proveedor_id, PROV);
});

await test('[E8] encargo con recepción parcial (8 de 20) queda recibida_parcial', async () => {
  const it = uid(81);
  const r = await aplicar([compra(8, {
    orden: { id: uid(80), proveedor_id: PROV, modalidad: 'encargo', fecha_esperada: '2026-11-25' },
    items: [{ id: it, articulo_id: CAFE2, cantidad: 20, costo_unitario: 5000 }],
    recepcion: { items: [{ orden_item_id: it, cantidad: 8 }] },
  })]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.equal((await one(`select estado from ordenes_compra where id = $1`, [uid(80)])).estado, 'recibida_parcial');
  assert.equal(Number((await one(`select cantidad_recibida c from ordenes_compra_items where id = $1`, [it])).c), 8);
});

await test('[RF-COM-03] encargo sin recepción queda pedida y no mueve stock', async () => {
  const it = uid(91);
  const st = await stock(CAFE);
  const r = await aplicar([compra(9, {
    orden: { id: uid(90), proveedor_id: PROV, modalidad: 'encargo', fecha_esperada: '2026-11-30' },
    items: [{ id: it, articulo_id: CAFE, cantidad: 5, costo_unitario: 9000 }],
  })]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  assert.equal((await one(`select estado from ordenes_compra where id = $1`, [uid(90)])).estado, 'pedida');
  assert.equal(await stock(CAFE), st);
});

await test('[E8][RN-COM-01] recibir más de lo pedido se rechaza (E_SOBRE_RECEPCION) y no deja nada', async () => {
  const it = uid(101);
  const antes = await conteo('ordenes_compra');
  const r = await aplicar([compra(10, {
    orden: { id: uid(100), proveedor_id: PROV, modalidad: 'encargo' },
    items: [{ id: it, articulo_id: CAFE, cantidad: 20, costo_unitario: 9000 }],
    recepcion: { items: [{ orden_item_id: it, cantidad: 13 }, { orden_item_id: it, cantidad: 8 }] },
  })]);
  assert.equal(error(r), 'E_SOBRE_RECEPCION');
  assert.equal(await conteo('ordenes_compra'), antes);
});

await test('[RN-COM-01] compra inmediata con recepción incompleta se rechaza (E_RECEPCION)', async () => {
  const it = uid(111);
  const r = await aplicar([compra(11, inmediata(11, {
    items: [{ id: it, articulo_id: CAFE, cantidad: 10, costo_unitario: 10000 }],
    recepcion: { items: [{ orden_item_id: it, cantidad: 6 }] },
  }))]);
  assert.equal(error(r), 'E_RECEPCION');
});

await test('[RN-COM-01] compra inmediata sin recepción se rechaza (E_RECEPCION)', async () => {
  const r = await aplicar([compra(12, inmediata(12, { recepcion: null }))]);
  assert.equal(error(r), 'E_RECEPCION');
});

await test('[RF-COM-04][RN-COM-02] artículo con vencimiento exige fecha (E_VENCIMIENTO); con fecha crea el lote', async () => {
  const it = uid(131);
  const base = (venc) => inmediata(13, {
    items: [{ id: it, articulo_id: CREMA, cantidad: 6, costo_unitario: 8000 }],
    recepcion: { items: [{ orden_item_id: it, cantidad: 6, lote_codigo: 'LOTE-A', ...(venc ? { fecha_vencimiento: venc } : {}) }] },
    pagos: [{ medio: 'efectivo', valor: 48000 }],
  });
  const r1 = await aplicar([compra(13, base(null))]);
  assert.equal(error(r1), 'E_VENCIMIENTO');
  const r2 = await aplicar([compra(13, base('2027-06-30'))]);
  assert.equal(r2.resultados[0].status, 'ok', JSON.stringify(r2));
  const l = await one(`select codigo, fecha_vencimiento::text f from lotes where articulo_id = $1`, [CREMA]);
  assert.equal(l.codigo, 'LOTE-A');
  assert.equal(l.f, '2027-06-30');
  assert.equal(await stock(CREMA), 6);
});

await test('[D-005] compra inmediata exige pago total: incompleto, excedido o sin pagos → E_PAGO', async () => {
  const antes = await conteo('ordenes_compra');
  const corto = await aplicar([compra(14, inmediata(14, { pagos: [{ medio: 'efectivo', valor: 90000 }] }))]);
  assert.equal(error(corto), 'E_PAGO');
  const largo = await aplicar([compra(15, inmediata(15, { pagos: [{ medio: 'efectivo', valor: 100001 }] }))]);
  assert.equal(error(largo), 'E_PAGO');
  const sin = await aplicar([compra(16, inmediata(16, { pagos: [] }))]);
  assert.equal(error(sin), 'E_PAGO');
  assert.equal(await conteo('ordenes_compra'), antes);
});

await test('[D-005] crédito no se admite (DATOS_INVALIDOS)', async () => {
  const r = await aplicar([compra(17, inmediata(17, { orden: { condicion_pago: 'credito', dias_credito: 30 } }))]);
  assert.equal(error(r), 'DATOS_INVALIDOS');
});

await test('[RF-COM-02] fecha de la compra posterior a mañana → E_FECHA', async () => {
  const lejos = new Date(Date.now() + 5 * 86400000).toISOString();
  const r = await aplicar([compra(18, inmediata(18, { orden: { fecha: lejos } }))]);
  assert.equal(error(r), 'E_FECHA');
  const hoy = await aplicar([compra(19, inmediata(19, { orden: { fecha: new Date().toISOString() } }))]);
  assert.equal(hoy.resultados[0].status, 'ok', JSON.stringify(hoy));
});

await test('[RF-COM-01] validaciones: modalidad desconocida, sin ítems, cantidad o costo inválidos → DATOS_INVALIDOS', async () => {
  assert.equal(error(await aplicar([compra(20, inmediata(20, { orden: { modalidad: 'trueque' } }))])), 'DATOS_INVALIDOS');
  assert.equal(error(await aplicar([compra(21, inmediata(21, { items: [], recepcion: null }))])), 'DATOS_INVALIDOS');
  const mal = (cantidad, costo) => [{ id: uid(2201), articulo_id: CAFE, cantidad, costo_unitario: costo }];
  assert.equal(error(await aplicar([compra(22, inmediata(22, { items: mal(0, 100), recepcion: null, pagos: [] }))])), 'DATOS_INVALIDOS');
  assert.equal(error(await aplicar([compra(23, inmediata(23, { items: mal(2, -1), recepcion: null, pagos: [] }))])), 'DATOS_INVALIDOS');
});

await test('[RF-COM-01] proveedor: ni proveedor_id ni proveedor_nuevo, o ambos → DATOS_INVALIDOS; inexistente → E_REF', async () => {
  const sin = inmediata(24); delete sin.orden.proveedor_id;
  assert.equal(error(await aplicar([compra(24, sin)])), 'DATOS_INVALIDOS');
  const ambos = inmediata(25); ambos.proveedor_nuevo = { nombre: 'X', es_proveedor: true };
  assert.equal(error(await aplicar([compra(25, ambos)])), 'DATOS_INVALIDOS');
  const falso = inmediata(26, { orden: { proveedor_id: uid(999) } });
  assert.equal(error(await aplicar([compra(26, falso)])), 'E_REF');
});

await test('[RF-COM-01] artículo inexistente → E_REF; ítem de recepción ajeno a la orden → E_REF', async () => {
  const it = uid(271);
  const a = inmediata(27, { items: [{ id: it, articulo_id: uid(998), cantidad: 1, costo_unitario: 100 }],
    recepcion: { items: [{ orden_item_id: it, cantidad: 1 }] }, pagos: [{ medio: 'efectivo', valor: 100 }] });
  assert.equal(error(await aplicar([compra(27, a)])), 'E_REF');
  const b = inmediata(28, { recepcion: { items: [{ orden_item_id: uid(997), cantidad: 10 }] } });
  assert.equal(error(await aplicar([compra(28, b)])), 'E_REF');
});

await test('[RF-SYN-06] quien no es miembro recibe NO_AUTORIZADO y no se crea nada', async () => {
  await como(USER_X);
  const antes = await conteo('ordenes_compra');
  const r = await aplicar([compra(29, inmediata(29))]);
  await como(USER_A);
  assert.equal(error(r), 'NO_AUTORIZADO');
  assert.equal(await conteo('ordenes_compra'), antes);
});

await test('[RF-COM-02] ids opcionales: el servidor genera los de orden, ítems, recepción y pago (recepción por índice)', async () => {
  const r = await aplicar([compra(30, {
    orden: { proveedor_id: PROV },
    items: [{ articulo_id: CAFE2, cantidad: 2, costo_unitario: 4000, unidad_origen: 'lb', cantidad_origen: 1 }],
    recepcion: { items: [{ item: 0, cantidad: 2 }] },
    pagos: [{ medio: 'daviplata', valor: 8000 }],
  })]);
  assert.equal(r.resultados[0].status, 'ok', JSON.stringify(r));
  const id = r.resultados[0].resultado.orden_id;
  const oc = await one(`select estado, modalidad from ordenes_compra where id = $1`, [id]);
  assert.equal(oc.estado, 'recibida');
  assert.equal(oc.modalidad, 'inmediata');
});

console.log(`\n${passed} pruebas ok`);
await db.close();
