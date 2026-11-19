// Carga supabase/catalogo_inicial.sql (idempotente) en una base. `npm run db:catalogo`.
// Por defecto: Supabase local. Otra base: DATABASE_URL=... y --confirmo-regla-14 (solo si ya hay backups y
// una restauración probada; AGENTS.md regla 14). Sin secretos en el repo: la URL viene del entorno.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const url = process.env.DATABASE_URL ?? LOCAL;
const esLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
if (!esLocal && !process.argv.includes('--confirmo-regla-14')) {
  console.error('Esa base no es local. No se carga el catálogo en producción hasta tener backups y restauración probada (regla 14).');
  console.error('Si ya se cumplió, repite con --confirmo-regla-14.');
  process.exit(1);
}
const sql = readFileSync(new URL('../supabase/catalogo_inicial.sql', import.meta.url), 'utf8');
const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query(sql);
  const { rows } = await cliente.query('select (select count(*) from articulos) a, (select count(*) from precios) p');
  console.log(`Catálogo cargado: ${rows[0].a} artículos, ${rows[0].p} precios.`);
} finally {
  await cliente.end();
}
