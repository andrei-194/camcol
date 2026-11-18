// E2E (CAM-49, T-M2-09): prepara el usuario de prueba en Supabase local y corre Playwright dentro de Docker.
// Requisito: `npm run db:start` y `npm run db:reset`. Las claves se leen de `supabase status` en tiempo de ejecución
// (son las de desarrollo local); nada se escribe en el repo. Argumentos extra pasan a Playwright
// (p. ej. `npm run test:e2e -- --project=chromium`).
import { spawnSync } from 'node:child_process';

const status = spawnSync('npm', ['run', '-s', 'db:status', '--', '-o', 'json'], { shell: true, encoding: 'utf8' });
const inicio = (status.stdout || '').indexOf('{');
if (status.status !== 0 || inicio < 0) {
  console.error('No se pudo leer `supabase status`. ¿Está levantado Supabase local? (npm run db:start y npm run db:reset)');
  process.exit(2);
}
const st = JSON.parse(status.stdout.slice(inicio));
const API = st.API_URL;
const ANON = st.ANON_KEY;
const SERVICE = st.SERVICE_ROLE_KEY;

const EMAIL = 'e2e@e2e.test';
const PASSWORD = 'E2e-local-1';

const json = async (ruta, { key, body, metodo = 'POST', extra = {} }) => {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
  return r;
};

// Usuario de pruebas (se reutiliza entre corridas) y su fila de socio (la RLS exige pertenecer a `miembros`).
let r = await json('/auth/v1/token?grant_type=password', { key: ANON, body: { email: EMAIL, password: PASSWORD } });
if (r.status === 400) {
  const c = await json('/auth/v1/admin/users', { key: SERVICE, body: { email: EMAIL, password: PASSWORD, email_confirm: true } });
  if (!c.ok) { console.error(`No se pudo crear ${EMAIL}: ${c.status} ${await c.text()}`); process.exit(2); }
  r = await json('/auth/v1/token?grant_type=password', { key: ANON, body: { email: EMAIL, password: PASSWORD } });
}
if (!r.ok) { console.error(`No se pudo iniciar sesión ${EMAIL}: ${r.status}`); process.exit(2); }
const userId = (await r.json()).user.id;
const m = await json('/rest/v1/miembros', {
  key: SERVICE,
  body: { user_id: userId, nombre: 'E2E' },
  extra: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
});
if (!m.ok) { console.error(`No se pudo registrar el socio de prueba: ${m.status} ${await m.text()}`); process.exit(2); }

// El navegador corre en Docker: el Supabase del PC se alcanza por host.docker.internal.
const enDocker = (url) => url.replace('127.0.0.1', 'host.docker.internal').replace('localhost', 'host.docker.internal');
const env = {
  ...process.env,
  E2E_SUPABASE_URL: enDocker(API),
  E2E_ANON_KEY: ANON,
  E2E_SERVICE_KEY: SERVICE,
  E2E_EMAIL: EMAIL,
  E2E_PASSWORD: PASSWORD,
};
const extra = process.argv.slice(2);
const run = spawnSync('docker', ['compose', '--profile', 'e2e', 'run', '--rm', 'e2e', 'npx', 'playwright', 'test', ...extra], {
  stdio: 'inherit',
  env,
});
process.exit(run.status ?? 1);
