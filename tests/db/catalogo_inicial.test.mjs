// [RF-CAT-01][RF-CAT-02][RN-PRE-01] Carga inicial del catálogo (CAM-53, T-M3-04): supabase/catalogo_inicial.sql.
// Corre sobre TODAS las migraciones reales (PGlite), es idempotente y deja los precios de docs/negocio/catalogo.md.
// Ejecutar: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
const dirMig = new URL('../../supabase/migrations/', import.meta.url);
// Las migraciones de roles de Supabase (0003+, 0004, 0014) necesitan roles que PGlite no trae; el catálogo
// solo depende del esquema de 0001 y de los candados de escritura directa (0002, 0006, 0013).
const MIGRACIONES = ['0001_core.sql', '0002_sync.sql', '0006_fix_touch_padre.sql', '0013_cerrar_escritura_directa.sql'];
for (const f of readdirSync(dirMig).filter((x) => MIGRACIONES.includes(x)).sort()) {
  await db.exec(readFileSync(new URL(f, dirMig), 'utf8'));
}
const urlSeed = new URL('../../supabase/catalogo_inicial.sql', import.meta.url);
const seed = existsSync(urlSeed) ? readFileSync(urlSeed, 'utf8') : null;

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const all = async (sql, p = []) => (await db.query(sql, p)).rows;
let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { console.log('  ✖', name, '\n     ', e.message); process.exitCode = 1; }
};
const precio = async (codigo, cantidad, cliente = null) =>
  Number((await one(
    `select precio_para((select id from articulos where codigo = $1), $2, $3) as p`, [codigo, cliente, cantidad])).p);

await test('[RF-CAT-01] existe supabase/catalogo_inicial.sql y carga sin errores sobre las migraciones', async () => {
  assert.ok(seed, 'falta supabase/catalogo_inicial.sql');
  await db.exec(seed);
});

await test('[RF-CAT-01] deja 10 artículos activos, 5 productos y sin control de lote ni vencimiento', async () => {
  assert.equal(Number((await one('select count(*) n from articulos where activo and deleted_at is null')).n), 10);
  assert.equal(Number((await one('select count(*) n from productos where activo')).n), 5);
  assert.equal(Number((await one('select count(*) n from articulos where controla_lote or controla_vencimiento')).n), 0);
});

await test('[RF-CAT-01] la presentación de 5 libras es un artículo propio (5 lb) con su código', async () => {
  const cj = await one(`select presentacion_cantidad::float8 c, presentacion_unidad u from articulos where codigo = 'CJ-5LB'`);
  assert.equal(cj.c, 5); assert.equal(cj.u, 'lb');
  const chico = await one(`select presentacion_cantidad::float8 c, presentacion_unidad u from articulos where codigo = 'CJ-500'`);
  assert.equal(chico.c, 500); assert.equal(chico.u, 'g');
  const cmc = await one(`select presentacion_cantidad::float8 c, presentacion_unidad u from articulos where codigo = 'CMC-5LB'`);
  assert.equal(cmc.c, 5); assert.equal(cmc.u, 'lb');
});

await test('[RF-CAT-01] las cuatro cremas de cacao comparten producto y cuestan $22.000', async () => {
  const r = await all(`select a.codigo, a.producto_id from articulos a where a.codigo like 'CC-%' order by 1`);
  assert.equal(r.length, 4);
  assert.equal(new Set(r.map((x) => x.producto_id)).size, 1);
  for (const c of ['CC-ORI', 'CC-MAN', 'CC-NAR', 'CC-CAF']) assert.equal(await precio(c, 1), 22000);
});

await test('[RF-CAT-02][RN-PRE-01] precios de la lista pública de docs/negocio/catalogo.md', async () => {
  const esperado = { 'CJ-500': 38000, 'CJ-5LB': 170000, 'CVL-250': 20000, 'CMC-250': 15000, 'CMC-5LB': 120000, 'PCH-125': 17000 };
  for (const [c, p] of Object.entries(esperado)) assert.equal(await precio(c, 1), p, c);
});

await test('[RF-CAT-02][RN-PRE-01] «Llévate 2» es un escalón (cantidad mínima 2, unitario = precio − 1.000) solo en los 3 cafés pequeños', async () => {
  assert.equal(await precio('CJ-500', 2), 37000);
  assert.equal(await precio('CVL-250', 2), 19000);
  assert.equal(await precio('CMC-250', 2), 14000);
  assert.equal(await precio('CVL-250', 5), 19000);
  for (const c of ['CJ-5LB', 'CMC-5LB', 'CC-ORI', 'PCH-125']) assert.equal(await precio(c, 2), await precio(c, 1), c);
  assert.equal(Number((await one(`select count(*) n from precios where cantidad_minima = 2`)).n), 3);
  assert.equal(Number((await one(`select count(*) n from precios`)).n), 13);
});

await test('[RN-PRE-01] un cliente con lista propia sin precios cae a la pública', async () => {
  const l = (await one(`insert into listas_precio (nombre) values ('Mayorista') returning id`)).id;
  const c = (await one(`insert into terceros (nombre, es_cliente, lista_precio_id) values ('Cafetería', true, $1) returning id`, [l])).id;
  assert.equal(await precio('CVL-250', 2, c), 19000);
});

await test('[RF-CAT-01] es idempotente: cargarlo otra vez no duplica ni pisa precios editados', async () => {
  await db.exec(`update precios set precio = 40000 where articulo_id = (select id from articulos where codigo = 'CJ-500') and cantidad_minima = 1`);
  await db.exec(seed);
  assert.equal(Number((await one('select count(*) n from articulos')).n), 10);
  assert.equal(Number((await one('select count(*) n from productos')).n), 5);
  assert.equal(Number((await one('select count(*) n from precios')).n), 13);
  assert.equal(await precio('CJ-500', 1), 40000);
  assert.equal(Number((await one('select count(*) n from listas_precio where es_publica')).n), 1);
});

console.log(`\n${passed} pruebas pasaron`);
