// [RN-PRE-01] Lado SQL de la paridad con domain/pricing (CAM-54): los mismos vectores que
// apps/web/src/domain/pricing/pricing.test.ts se ejecutan contra precio_para real (PGlite).
// Si uno de los dos lados cambia, el otro deja de pasar. Ejecutar: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { pg_trgm } });
const leer = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
await db.exec(leer('0001_core.sql'));

const vectores = JSON.parse(readFileSync(new URL('./vectores/precio_para.json', import.meta.url), 'utf8'));
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];

const prod = (await one(`insert into productos (nombre) values ('Producto de prueba') returning id`)).id;
const publicaId = (await one('select id from listas_precio where es_publica')).id;

let passed = 0;
for (const [i, esc] of vectores.escenarios.entries()) {
  const listas = { publica: publicaId };
  for (const n of esc.listas.filter((x) => x !== 'publica')) {
    listas[n] = (await one(`insert into listas_precio (nombre) values ($1) returning id`, [`${n}-${i}`])).id;
  }
  const clientes = {};
  for (const [n, lista] of Object.entries(esc.clientes)) {
    clientes[n] = (await one(
      `insert into terceros (nombre, es_cliente, lista_precio_id) values ($1, true, $2) returning id`,
      [`${n}-${i}`, lista ? listas[lista] : null],
    )).id;
  }
  const articulos = {};
  const art = async (n) => (articulos[n] ??= (await one(
    `insert into articulos (producto_id, nombre, presentacion_cantidad, presentacion_unidad)
     values ($1, $2, 500, 'g') returning id`, [prod, `${n}-${i}`])).id);
  for (const p of esc.precios) {
    await db.query(`insert into precios (lista_id, articulo_id, precio, cantidad_minima) values ($1,$2,$3,$4)`,
      [listas[p.lista], await art(p.articulo), p.precio, p.minima]);
  }
  for (const c of esc.consultas) {
    // 'desconocido' = un id de cliente que no existe (cae a la lista pública, como en el cliente)
    const cliente = c.cliente === null ? null : (clientes[c.cliente] ?? '00000000-0000-0000-0000-00000000dead');
    const r = await one('select precio_para($1, $2, $3) as p', [await art(c.articulo), cliente, c.cantidad]);
    const real = r.p === null ? null : Number(r.p);
    try {
      assert.equal(real, c.esperado);
      passed++;
    } catch {
      console.log('  ✖', `[RN-PRE-01] ${esc.nombre}: ${JSON.stringify(c)} -> SQL ${real}`);
      process.exitCode = 1;
    }
  }
}
const total = vectores.escenarios.reduce((n, e) => n + e.consultas.length, 0);
if (passed === total) console.log(`  ✔ [RN-PRE-01] ${total} vectores coinciden con precio_para`);
