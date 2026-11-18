// Corre las suites de tests/integration (*.test.mjs) contra Supabase local (CAM-40, T-M1-10).
// Requisito: `npm run db:start` (y `npm run db:reset` para partir de las migraciones). No usa PGlite.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dir = new URL('../tests/integration/', import.meta.url);
const suites = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
if (suites.length === 0) { console.error('No se encontró ninguna suite en tests/integration'); process.exit(1); }

let fallos = 0;
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [new URL(s, dir).pathname.replace(/^\/(\w:)/, '$1')], { stdio: 'inherit' });
  if (r.status !== 0) fallos++;
}
console.log(`\n${suites.length} suites, ${fallos} con fallas`);
process.exit(fallos ? 1 : 0);
