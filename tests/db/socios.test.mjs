// [RNF-OPS] Seed de los socios (CAM-104): la parte pura de `scripts/socios-lib.mjs`, el ejemplo versionado y la guarda
// de `.gitignore`. La parte de red y Auth se verifica al correr `npm run db:socios` (verificación final del script).
// Todos los datos de esta prueba son ficticios. Ejecutar: npm run test:db
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ErrorSocios,
  esApiLocal,
  esFalloDeRed,
  esPlantilla,
  exigirLocal,
  explicarFalloLogin,
  leerSocios,
} from '../../scripts/socios-lib.mjs';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const valido = (extra = {}) =>
  JSON.stringify({
    password: 'clave-de-prueba',
    socios: [
      { email: 'Ana.Prueba@ejemplo.co', nombre: 'Ana Prueba' },
      { email: 'beto@ejemplo.co', nombre: 'Beto Prueba' },
    ],
    ...extra,
  });
const rechaza = (texto, patron) => assert.throws(() => leerSocios(texto), (e) => e instanceof ErrorSocios && patron.test(e.message));

test('[RNF-OPS] leerSocios acepta el esquema y normaliza los correos a minúsculas', () => {
  const r = leerSocios(valido());
  assert.equal(r.password, 'clave-de-prueba');
  assert.deepEqual(r.socios.map((s) => s.email), ['ana.prueba@ejemplo.co', 'beto@ejemplo.co']);
  assert.equal(r.socios[0].nombre, 'Ana Prueba');
});

test('[RNF-OPS] leerSocios tolera el BOM que añaden Notepad y PowerShell 5', () => {
  assert.equal(leerSocios('﻿' + valido()).socios.length, 2);
});

test('[RNF-OPS] leerSocios: JSON mal formado da un mensaje accionable', () => {
  rechaza('{ "password": ', /JSON válido/);
});

test('[RNF-OPS] leerSocios rechaza contraseña ausente o corta', () => {
  rechaza(valido({ password: undefined }), /password/);
  rechaza(valido({ password: '12345' }), /6/);
});

test('[RNF-OPS] leerSocios rechaza `socios` vacío, ausente o con más de dos', () => {
  rechaza(valido({ socios: [] }), /socios/);
  rechaza(valido({ socios: undefined }), /socios/);
  const tres = ['a', 'b', 'c'].map((x) => ({ email: `${x}@ejemplo.co`, nombre: x }));
  rechaza(valido({ socios: tres }), /dos/);
});

test('[RNF-OPS] leerSocios rechaza nombre vacío y correo inválido', () => {
  rechaza(valido({ socios: [{ email: 'a@ejemplo.co', nombre: '   ' }] }), /nombre/);
  rechaza(valido({ socios: [{ email: 'sin-arroba', nombre: 'X' }] }), /correo/i);
});

test('[RNF-OPS] leerSocios rechaza correos duplicados aunque cambien las mayúsculas', () => {
  const dup = [{ email: 'Uno@ejemplo.co', nombre: 'Uno' }, { email: 'uno@EJEMPLO.co', nombre: 'Otro' }];
  rechaza(valido({ socios: dup }), /repetido|duplicado/i);
});

test('[RNF-OPS] esApiLocal: solo el host exacto cuenta como local', () => {
  for (const u of ['http://127.0.0.1:54321', 'http://localhost:54321', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', 'http://[::1]:54321']) {
    assert.equal(esApiLocal(u), true, u);
  }
  for (const u of ['http://localhost.evil.com', 'http://127.0.0.1.evil.com', 'http://127.0.0.1@evil.com', 'https://abc.supabase.co', 'no es una url', '']) {
    assert.equal(esApiLocal(u), false, u);
  }
});

test('[RNF-OPS] exigirLocal revisa API y base, y cita la regla 14', () => {
  exigirLocal('http://127.0.0.1:54321', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  assert.throws(() => exigirLocal('https://abc.supabase.co', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'), /regla 14/);
  assert.throws(() => exigirLocal('http://127.0.0.1:54321', 'postgresql://u:p@db.abc.supabase.co:5432/postgres'), (e) => e instanceof ErrorSocios && /regla 14/.test(e.message));
});

test('[RNF-OPS] el ejemplo versionado pasa leerSocios y no trae datos reales', () => {
  const r = leerSocios(leer('../../supabase/socios.example.json'));
  assert.equal(r.socios.length, 2);
  for (const s of r.socios) assert.match(s.email, /@ejemplo\.co$/);
});

test('[RNF-OPS] leerSocios rechaza un JSON que no es un objeto y socios que no son objetos', () => {
  rechaza('[]', /objeto/);
  rechaza('null', /objeto/);
  rechaza(valido({ socios: [null] }), /nombre/);
  rechaza(valido({ socios: [42] }), /nombre/);
});

test('[RNF-OPS] esFalloDeRed reconoce el TypeError de fetch y los errores con cause.code; no otros', () => {
  assert.equal(esFalloDeRed(new TypeError('fetch failed')), true);
  assert.equal(esFalloDeRed(Object.assign(new Error('x'), { cause: { code: 'ECONNRESET' } })), true);
  assert.equal(esFalloDeRed(new Error('otra cosa')), false);
  assert.equal(esFalloDeRed(new ErrorSocios('config')), false);
  assert.equal(esFalloDeRed(undefined), false);
});

test('[RNF-OPS] esFalloDeRed: un TypeError de código no es fallo de red; el timeout sí', () => {
  assert.equal(esFalloDeRed(new TypeError("Cannot read properties of undefined (reading 'x')")), false);
  assert.equal(esFalloDeRed(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), true);
});

test('[RNF-OPS] socios.mjs verifica el login antes de inscribir en miembros y acota cada fetch con timeout', () => {
  const src = readFileSync(new URL('../../scripts/socios.mjs', import.meta.url), 'utf8');
  const login = src.indexOf('await verificarLogin(');
  const inscribir = src.indexOf('insert into miembros');
  assert.ok(login > 0 && inscribir > 0 && login < inscribir, 'el login debe verificarse antes del insert');
  assert.equal(src.match(/fetch\(/g).length, src.match(/AbortSignal\.timeout\(/g).length, 'cada fetch lleva timeout');
});

test('[RNF-OPS] explicarFalloLogin: «contraseña distinta» solo con 400/401; otro estado muestra el número', () => {
  for (const estado of [400, 401]) assert.match(explicarFalloLogin(estado, 'Ana'), /contraseña distinta/);
  for (const estado of [429, 500, 503]) {
    const m = explicarFalloLogin(estado, 'Ana');
    assert.match(m, new RegExp(String(estado)));
    assert.doesNotMatch(m, /contraseña distinta|Bórralo/);
  }
});

test('[RNF-OPS] esPlantilla detecta la plantilla sin editar (correos @ejemplo.co) y no a socios reales', () => {
  assert.equal(esPlantilla(leerSocios(leer('../../supabase/socios.example.json')).socios), true);
  assert.equal(esPlantilla([{ email: 'real@gmail.com', nombre: 'Real' }]), false);
  assert.equal(esPlantilla([{ email: 'real@gmail.com', nombre: 'Real' }, { email: 'x@ejemplo.co', nombre: 'X' }]), true);
});

test('[RNF-OPS] db:reiniciar valida el archivo de socios ANTES de borrar la base', () => {
  const { scripts } = JSON.parse(leer('../../package.json'));
  const cadena = scripts['db:reiniciar'];
  assert.ok(cadena.includes('socios.mjs --validar'), cadena);
  assert.ok(cadena.indexOf('socios.mjs --validar') < cadena.indexOf('db:reset'), cadena);
});

test('[RNF-OPS] `.gitignore` protege supabase/socios.local.json (credenciales fuera del repo, regla 13)', () => {
  const lineas = leer('../../.gitignore').split(/\r?\n/).map((l) => l.trim());
  assert.ok(lineas.includes('supabase/socios.local.json'));
});
