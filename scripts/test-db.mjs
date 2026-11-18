// Corre todas las suites de tests/db (*.test.mjs) en orden alfabético.
// Cada tarea solo añade su archivo; no hay que editar package.json (CAM-87).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dir = new URL('../tests/db/', import.meta.url);
const suites = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
if (suites.length === 0) { console.error('No se encontró ninguna suite en tests/db'); process.exit(1); }

let fallos = 0;
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [new URL(s, dir).pathname.replace(/^\/(\w:)/, '$1')], { stdio: 'inherit' });
  if (r.status !== 0) fallos++;
}
console.log(`\n${suites.length} suites, ${fallos} con fallas`);
process.exit(fallos ? 1 : 0);
