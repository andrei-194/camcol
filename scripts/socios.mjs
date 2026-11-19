// Crea los socios de desarrollo en la base LOCAL y los inscribe en `miembros`. `npm run db:socios` (CAM-104).
// Idempotente: si un socio ya existe lo reutiliza. Los datos vienen de supabase/socios.local.json (ignorado por Git;
// plantilla en supabase/socios.example.json). Nunca imprime la contraseña, las claves ni el cuerpo de una respuesta.
// Solo actúa sobre la base local (regla 14): API_URL y DB_URL salen de `supabase status`, sin variable que los sustituya.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { requerir, explicarFalloConexion } from './dependencia.mjs';
import { ErrorSocios, exigirLocal, leerSocios } from './socios-lib.mjs';

const pg = (await requerir('pg')).default;
const ARCHIVO = new URL('../supabase/socios.local.json', import.meta.url);
const ESPERA_AUTH_MS = 30_000;

// Mismo bloque que tests/integration/entorno.mjs: `supabase status -o json` (el `indexOf` salta el ruido anterior).
function leerStatus() {
  const r = spawnSync('npm', ['run', '-s', 'db:status', '--', '-o', 'json'], { shell: true, encoding: 'utf8' });
  const i = (r.stdout || '').indexOf('{');
  if (r.status !== 0 || i < 0) {
    throw new ErrorSocios('No se pudo leer `supabase status`. ¿Está levantado Supabase local? Abre Docker Desktop y corre:  npm run db:start');
  }
  return JSON.parse(r.stdout.slice(i));
}

// Tras `db reset` Auth tarda unos segundos en volver: se reintenta hasta ESPERA_AUTH_MS.
async function esperarAuth(api, anon) {
  const limite = Date.now() + ESPERA_AUTH_MS;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`${api}/auth/v1/health`, { headers: { apikey: anon } });
      if (r.ok) return;
    } catch {
      /* Auth todavía arrancando */
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new ErrorSocios('Auth no respondió en 30 s. ¿Está levantado Supabase local? Corre:  npm run db:start');
}

const mensajeDe = async (r) => {
  try {
    const j = await r.json();
    return String(j.msg ?? j.message ?? j.error_description ?? j.error ?? '').slice(0, 200);
  } catch {
    return '';
  }
};

async function crearUsuario(api, service, { email, nombre }, password) {
  const r = await fetch(`${api}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!r.ok) throw new ErrorSocios(`No se pudo crear a ${nombre} (estado ${r.status}): ${await mensajeDe(r)}`);
  return (await r.json()).id;
}

async function verificarLogin(api, anon, { email, nombre }, password) {
  const r = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    throw new ErrorSocios(
      `${nombre} ya existía con una contraseña distinta a la de supabase/socios.local.json. ` +
        'Bórralo en Studio (Authentication > Users) y vuelve a correr:  npm run db:socios',
    );
  }
}

async function main() {
  if (!existsSync(ARCHIVO)) {
    throw new ErrorSocios('Falta supabase/socios.local.json. Copia supabase/socios.example.json con ese nombre y pon tus datos.');
  }
  const { password, socios } = leerSocios(readFileSync(ARCHIVO, 'utf8'));
  const st = leerStatus();
  exigirLocal(st.API_URL, st.DB_URL);
  await esperarAuth(st.API_URL, st.ANON_KEY);

  const cliente = new pg.Client({ connectionString: st.DB_URL });
  await cliente.connect();
  try {
    for (const socio of socios) {
      const previo = await cliente.query('select id from auth.users where lower(email) = $1', [socio.email]);
      const id = previo.rows[0]?.id ?? (await crearUsuario(st.API_URL, st.SERVICE_ROLE_KEY, socio, password));
      await cliente.query('insert into miembros (user_id, nombre) values ($1, $2) on conflict (user_id) do nothing', [id, socio.nombre]);
      await verificarLogin(st.API_URL, st.ANON_KEY, socio, password);
      const fila = await cliente.query('select 1 from miembros where user_id = $1', [id]);
      if (fila.rowCount !== 1) throw new ErrorSocios(`${socio.nombre} no quedó en la tabla miembros.`);
    }
  } finally {
    await cliente.end().catch(() => {});
  }
  console.log(`Socios listos: ${socios.map((s) => s.nombre).join(', ')}.`);
}

try {
  await main();
} catch (e) {
  if (e instanceof ErrorSocios) {
    console.error(e.message);
    process.exitCode = 2;
  } else {
    explicarFalloConexion(e, { esLocal: true });
  }
}
