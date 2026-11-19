// [RNF-OPS] Arranque desde cero: un script del PC al que le falta una dependencia debe decir qué hacer
// (`npm run setup`), no soltar un error de Node. También: sin Supabase local, el mensaje nombra `npm run db:start`.
// Ejecutar: npm run test:db
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../../scripts/dependencia.mjs', import.meta.url)).replace(/\\/g, '/');
const correr = (codigo) => spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8' });

test('[RNF-OPS] falta una dependencia: sale con código 2 y manda a `npm run setup`', () => {
  const r = correr(`import { requerir } from 'file:///${helper}'; await requerir('paquete-que-no-existe-camino');`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm run setup/);
  assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/);
});

test('[RNF-OPS] una dependencia presente se carga normal', () => {
  const r = correr(`import { requerir } from 'file:///${helper}'; const m = await requerir('node:path'); console.log(typeof m.join);`);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), 'function');
});

test('[RNF-OPS] sin Supabase local, el mensaje nombra `npm run db:start`', () => {
  const r = correr(`import { explicarFalloConexion } from 'file:///${helper}'; explicarFalloConexion(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }));`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm run db:start/);
});
