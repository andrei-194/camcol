// [RNF-OPS] Seed de los socios (CAM-104): la parte pura de `scripts/socios-lib.mjs`, el ejemplo versionado y la guarda
// de `.gitignore`. La parte de red y Auth se verifica al correr `npm run db:socios` (verificación final del script).
// Todos los datos de esta prueba son ficticios. Ejecutar: npm run test:db
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ErrorSocios, esApiLocal, exigirLocal, leerSocios } from '../../scripts/socios-lib.mjs';

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

test('[RNF-OPS] `.gitignore` protege supabase/socios.local.json (credenciales fuera del repo, regla 13)', () => {
  const lineas = leer('../../.gitignore').split(/\r?\n/).map((l) => l.trim());
  assert.ok(lineas.includes('supabase/socios.local.json'));
});
