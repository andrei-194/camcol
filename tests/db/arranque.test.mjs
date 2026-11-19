// [RNF-OPS] Arranque desde cero: un script del PC al que le falta algo debe decir qué hacer, no soltar un error de Node.
// Cubre `scripts/dependencia.mjs`: paquete ausente → `npm run setup`; fallos de conexión y de esquema → el comando que toca,
// sin recomendar `db:start` cuando la base es remota. Ejecutar: npm run test:db
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const helper = new URL('../../scripts/dependencia.mjs', import.meta.url).href;
const correr = (codigo) => spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8' });
const importar = (nombres) => `import { ${nombres} } from ${JSON.stringify(helper)};`;

// Llama a explicarFalloConexion con un error `{ code }` y las opciones dadas.
const falla = (code, opciones = {}) =>
  correr(`${importar('explicarFalloConexion')} explicarFalloConexion(Object.assign(new Error('boom'), { code: ${JSON.stringify(code)} }), ${JSON.stringify(opciones)});`);

test('[RNF-OPS] falta una dependencia: sale con código 2 y manda a `npm run setup`', () => {
  const r = correr(`${importar('requerir')} await requerir('paquete-que-no-existe-camino');`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm run setup/);
  assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/);
});

test('[RNF-OPS] una dependencia presente se carga normal', () => {
  const r = correr(`${importar('requerir')} const m = await requerir('node:path'); console.log(typeof m.join);`);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), 'function');
});

test('[RNF-OPS] un módulo que importa OTRO paquete ausente no se disfraza de «falta setup»', () => {
  const dir = mkdtempSync(join(tmpdir(), 'camino-arranque-'));
  try {
    const modulo = join(dir, 'ajeno.mjs');
    writeFileSync(modulo, "import 'otro-paquete-que-tampoco-existe';\n");
    const r = correr(`${importar('requerir')} await requerir(${JSON.stringify(pathToFileURL(modulo).href)});`);
    assert.notEqual(r.status, 2);
    assert.match(r.stderr, /otro-paquete-que-tampoco-existe/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const code of ['ECONNREFUSED', 'ENOTFOUND']) {
  test(`[RNF-OPS] ${code} con base local: nombra \`npm run db:start\``, () => {
    const r = falla(code, { esLocal: true });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /npm run db:start/);
  });

  test(`[RNF-OPS] ${code} con base remota: NO recomienda db:start y nombra el host`, () => {
    const r = falla(code, { esLocal: false, host: 'db.ejemplo.co:5432' });
    assert.equal(r.status, 2);
    assert.doesNotMatch(r.stderr, /db:start/);
    assert.match(r.stderr, /db\.ejemplo\.co:5432/);
  });
}

for (const code of ['57P03', 'ETIMEDOUT', 'ECONNRESET']) {
  test(`[RNF-OPS] ${code}: pide esperar unos segundos y repetir`, () => {
    const r = falla(code, { esLocal: true });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /espera/i);
  });
}

test('[RNF-OPS] 42P01 (faltan tablas) en base local manda a db:reiniciar y avisa de que borra los datos', () => {
  const r = falla('42P01', { esLocal: true });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /npm run db:reiniciar/);
  assert.match(r.stderr, /borra/i); // el reset borra usuarios y datos; db:reiniciar los vuelve a crear
});

test('[RNF-OPS] 42P01 en base remota habla de migraciones, sin db:reiniciar ni db:reset', () => {
  const r = falla('42P01', { esLocal: false, host: 'db.ejemplo.co' });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr, /db:reiniciar|db:reset/);
  assert.match(r.stderr, /migraciones/);
});

test('[RNF-OPS] un error desconocido se relanza tal cual (no se traga)', () => {
  const r = falla('XX000');
  assert.notEqual(r.status, 2);
  assert.match(r.stderr, /boom/);
});
