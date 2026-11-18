// Utilidades de las pruebas de integración REALES (CAM-40, T-M1-10) contra Supabase local.
// Las claves NO están en el repo: se leen en tiempo de ejecución de `supabase status` (son las de desarrollo local).
// Requisito: `npm run db:start` y `npm run db:reset` (todas las migraciones aplicadas por la CLI).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';

export const uuid = randomUUID;

const leerStatus = () => {
  const r = spawnSync('npm', ['run', '-s', 'db:status', '--', '-o', 'json'], { shell: true, encoding: 'utf8' });
  const i = (r.stdout || '').indexOf('{');
  if (r.status !== 0 || i < 0) {
    console.error('No se pudo leer `supabase status`. ¿Está levantado Supabase local? (npm run db:start)');
    process.exit(2);
  }
  return JSON.parse(r.stdout.slice(i));
};
const st = leerStatus();
export const API = st.API_URL;
export const DB_URL = st.DB_URL;
const ANON = st.ANON_KEY;
const SERVICE = st.SERVICE_ROLE_KEY;

// ---------- Postgres directo (rol postgres: solo para preparar datos y consultar el catálogo) ----------
export const conectar = async () => {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  return c;
};

// ---------- Auth: usuarios reales y JWT reales ----------
const authFetch = (path, { key, body } = {}) =>
  fetch(`${API}/auth/v1${path}`, {
    method: 'POST',
    headers: { apikey: key ?? ANON, Authorization: `Bearer ${key ?? ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const PASSWORD = 'Integracion-local-1';
export const sesion = async (email) => {
  let r = await authFetch('/token?grant_type=password', { body: { email, password: PASSWORD } });
  if (r.status === 400) {                                   // no existe: se crea con la API de administración
    const c = await authFetch('/admin/users', { key: SERVICE, body: { email, password: PASSWORD, email_confirm: true } });
    assert.ok(c.ok, `no se pudo crear ${email}: ${c.status} ${await c.text()}`);
    r = await authFetch('/token?grant_type=password', { body: { email, password: PASSWORD } });
  }
  assert.ok(r.ok, `no se pudo iniciar sesión ${email}: ${r.status}`);
  const j = await r.json();
  return { token: j.access_token, id: j.user.id, email };
};

export const hacerMiembro = async (db, s, nombre) =>
  db.query(`insert into miembros (user_id, nombre) values ($1,$2) on conflict do nothing`, [s.id, nombre]);

// ---------- PostgREST ----------
// token = null → solo la anon key (visitante sin sesión).
export const rest = async (token, metodo, ruta, { body, headers = {} } = {}) => {
  const r = await fetch(`${API}/rest/v1/${ruta}`, {
    method: metodo,
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await r.text();
  let json; try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  return { status: r.status, json, headers: r.headers };
};
export const rpc = (token, fn, args = {}) => rest(token, 'POST', `rpc/${fn}`, { body: args });
export const aplicarOps = (token, ops) => rpc(token, 'aplicar_ops', { ops });
// Total de filas visibles (Content-Range) sin traerlas.
export const contar = async (token, rel) => {
  const r = await rest(token, 'HEAD', `${rel}?select=*`, { headers: { Prefer: 'count=exact' } });
  if (r.status >= 400) return { status: r.status, n: null };
  return { status: r.status, n: Number((r.headers.get('content-range') || '*/0').split('/')[1]) };
};

// ---------- Mini runner ----------
export const nuevoRunner = () => {
  const r = { passed: 0, failed: 0 };
  r.test = async (name, fn) => {
    try { await fn(); r.passed++; console.log('  ✔', name); }
    catch (e) { r.failed++; console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
  };
  return r;
};

// ---------- Datos base (por admin) ----------
// Artículo nuevo, con `stock` unidades recibidas (compra recibida: orden → pedida → recepción).
export const articuloConStock = async (db, stock, costo = 10000) => {
  const prov = (await db.query(`insert into terceros (nombre, es_proveedor) values ('Prov integracion', true) returning id`)).rows[0].id;
  const prod = (await db.query(`insert into productos (nombre, categoria) values ('Café integración ' || gen_random_uuid(), 'Café') returning id`)).rows[0].id;
  const art = (await db.query(`insert into articulos (producto_id, proveedor_id, nombre, presentacion_cantidad, presentacion_unidad)
                               values ($1,$2,'Café integración 500 g',500,'g') returning id`, [prod, prov])).rows[0].id;
  if (stock > 0) {
    const o = (await db.query(`insert into ordenes_compra (proveedor_id) values ($1) returning id`, [prov])).rows[0].id;
    const it = (await db.query(`insert into ordenes_compra_items (orden_id, articulo_id, cantidad, costo_unitario) values ($1,$2,$3,$4) returning id`, [o, art, stock, costo])).rows[0].id;
    await db.query(`update ordenes_compra set estado='pedida' where id=$1`, [o]);
    const r = (await db.query(`insert into recepciones (orden_id) values ($1) returning id`, [o])).rows[0].id;
    await db.query(`insert into recepcion_items (recepcion_id, orden_item_id, cantidad) values ($1,$2,$3)`, [r, it, stock]);
  }
  return art;
};
// Pedido confirmado y pagado por completo (listo para finalizar).
export const pedidoListo = async (db, art, cliente, cant = 1, precio = 20000) => {
  const p = (await db.query(`insert into pedidos_venta (cliente_id, entrega_tipo) values ($1, 'recoge') returning id`, [cliente])).rows[0].id;
  await db.query(`insert into pedidos_venta_items (pedido_id, articulo_id, cantidad, precio_lista, precio_unitario) values ($1,$2,$3,$4,$4)`, [p, art, cant, precio]);
  await db.query(`update pedidos_venta set estado='confirmado' where id=$1`, [p]);
  await db.query(`insert into pagos (direccion, pedido_venta_id, medio, valor) values ('cobro',$1,'efectivo',$2)`, [p, cant * precio]);
  return p;
};
export const fisico = async (db, art) =>
  Number((await db.query(`select coalesce(sum(cantidad),0) s from movimientos_inventario where articulo_id=$1`, [art])).rows[0].s);
