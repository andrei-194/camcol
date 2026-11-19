// Parte pura del seed de socios (CAM-104): sin red, sin disco y sin efectos al importarse, para poder probarla.
// El script que la usa es `scripts/socios.mjs` (`npm run db:socios`).

/** Error de configuración del usuario: el mensaje ya dice qué corregir. */
export class ErrorSocios extends Error {}

const MIN_PASSWORD = 6; // igual que `minimum_password_length` de supabase/config.toml
const MAX_SOCIOS = 2;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida el contenido de `supabase/socios.local.json`:
 * `{ "password": "...", "socios": [{ "email": "...", "nombre": "..." }] }`.
 * Devuelve `{ password, socios }` con los correos en minúsculas (Auth los guarda así).
 */
export function leerSocios(texto) {
  let datos;
  try {
    datos = JSON.parse(String(texto).replace(/^﻿/, '')); // Notepad y PowerShell 5 añaden un BOM
  } catch {
    throw new ErrorSocios('supabase/socios.local.json no es un JSON válido. Revisa comas, llaves y comillas.');
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorSocios('supabase/socios.local.json debe ser un objeto con «password» y «socios» (mira socios.example.json).');
  }
  const { password, socios } = datos;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new ErrorSocios(`Falta «password» o es demasiado corta: mínimo ${MIN_PASSWORD} caracteres.`);
  }
  if (!Array.isArray(socios) || socios.length === 0) {
    throw new ErrorSocios('Falta «socios»: debe ser una lista con al menos un socio.');
  }
  if (socios.length > MAX_SOCIOS) {
    throw new ErrorSocios(`Hay ${socios.length} socios y el proyecto tiene dos. Quita los que sobren.`);
  }
  const vistos = new Set();
  const limpios = socios.map((s, i) => {
    const nombre = typeof s?.nombre === 'string' ? s.nombre.trim() : '';
    const email = typeof s?.email === 'string' ? s.email.trim().toLowerCase() : '';
    if (!nombre) throw new ErrorSocios(`El socio ${i + 1} no tiene «nombre».`);
    if (!CORREO.test(email)) throw new ErrorSocios(`El socio ${i + 1} (${nombre}) no tiene un correo válido.`);
    if (vistos.has(email)) throw new ErrorSocios(`El correo del socio ${i + 1} (${nombre}) está repetido.`);
    vistos.add(email);
    return { email, nombre };
  });
  return { password, socios: limpios };
}

/** La plantilla `socios.example.json` usa correos `@ejemplo.co`: si siguen ahí, el archivo local no se ha editado. */
export function esPlantilla(socios) {
  return socios.some((s) => s.email.endsWith('@ejemplo.co'));
}

/**
 * ¿Es un fallo de red (Auth caído, arrancando o sin responder)? `fetch` lanza `TypeError('fetch failed')` con el código en
 * `cause`, o un `TimeoutError` si vence `AbortSignal.timeout`. Otros `TypeError` son bugs y no deben disfrazarse de red.
 */
export function esFalloDeRed(e) {
  return (e instanceof TypeError && e.message === 'fetch failed') || e?.name === 'TimeoutError' || Boolean(e?.cause?.code);
}

/** Mensaje para un inicio de sesión rechazado. Solo 400/401 son «contraseña distinta»; el resto no justifica borrar nada. */
export function explicarFalloLogin(estado, nombre) {
  if (estado === 400 || estado === 401) {
    return (
      `${nombre} ya existía con una contraseña distinta a la de supabase/socios.local.json. ` +
      'Bórralo en Studio (Authentication > Users) y vuelve a correr:  npm run db:socios'
    );
  }
  return `No se pudo iniciar sesión con ${nombre} (estado ${estado}). Espera unos segundos y repite:  npm run db:socios`;
}

const LOCALES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** ¿La URL apunta a esta máquina? Compara el host exacto: `localhost.evil.com` o `127.0.0.1@evil.com` no pasan. */
export function esApiLocal(url) {
  try {
    return LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Regla 14: la API y la base deben ser locales. Si alguna no lo es, lanza un `ErrorSocios` sin imprimir la URL. */
export function exigirLocal(apiUrl, dbUrl) {
  if (!esApiLocal(apiUrl) || !esApiLocal(dbUrl)) {
    throw new ErrorSocios(
      'La API o la base de datos no son locales. Los socios de desarrollo solo se crean en la base local (regla 14 de AGENTS.md).',
    );
  }
}
