# Siguiente ronda: H2 (app base offline), en `release/h2`

Estado a 2026-11-18. `main` en `79c6e94` (PR #27). **H1 cerrado.** Línea base de pruebas: `npm run test:db` 15 suites en verde; app web 81 pruebas en verde; `npm run test:integration` 33 pruebas (corridas antes de las migraciones 0015 y 0016; vuelve a correrlas).

Lee primero `AGENTS.md` (flujo de ramas nuevo, D-017) y `docs/DECISIONS.md` (D-009, D-015, D-016, D-017 y las notas T-M2-01 y T-M2-02).

## Paso 0: crear la release (si no existe)

```bash
git fetch && git checkout -B release/h2 origin/main && git push -u origin release/h2
gh pr create --draft --base main --head release/h2 --title "release: H2 app base offline" --body-file .github/pull_request_template.md
```

Solo existirá **ese** PR en todo H2. Las tareas se integran en `release/h2` sin PR (ver «Integrar una tarea» en `AGENTS.md`). Linear: *In Progress* al empezar, *In Review* al integrar en la release, *Done* cuando el PR de la release se fusione.

## Hecho en H2

T-M2-01 login y guardia de rutas (CAM-41) · T-M2-02 PWA instalable (CAM-42) · T-M2-03 Dexie, `device_id`, UUID v7 y formatos (CAM-43).

## Tareas pendientes (una por agente)

| Issue | Tarea | Depende de | Notas |
|---|---|---|---|
| CAM-44 | T-M2-04 Puller | T-M2-03 | Una sola fila `sync_meta` con `tabla = 'global'` (D-016). Deriva `terceros.roles` de `es_cliente`/`es_proveedor`. No pisa registros `_pendiente`. |
| CAM-45 | T-M2-05 Escritor | T-M2-03 | Llama a `aplicar_ops` con el cuerpo `{ "ops": [...] }` (el parámetro se llama `ops`). Solo se encolan compra, proveedor, gasto y adjunto. |
| CAM-97 | T-M1-18 Reembolsos en el servidor (migración 0017) | spec T-M1-17 (hecha) | Solo base de datos; independiente de la app. Rojo primero en `tests/db/reembolsos.test.mjs`. Va en esta release para no abrir otra. |
| CAM-46 | T-M2-06 Centro de pendientes | CAM-45 | Nada se envía sin pulsar «Subir». Agrega el aviso por pendientes al cerrar sesión (RF-AUTH-03). |
| CAM-47 | T-M2-07 Indicadores (conexión, pendientes, «datos al …») | CAM-44 y CAM-45 | Sin Realtime (D-009). |
| CAM-48 | T-M2-08 Fotos locales y `adjunto.vincular` | CAM-45 | |
| CAM-49 | T-M2-09 E2E Playwright base | CAM-45 y CAM-46 | Cierra H2. No se empieza H3 hasta que pase. |
| CAM-84 | T-M2-00 Spike en iPhone real | — | **Lo hace el socio** (necesita un iPhone físico). |

**Oleadas sugeridas** (integración siempre de una en una): A = CAM-44, CAM-45 y CAM-97 en paralelo; B = CAM-46, CAM-47 y CAM-48 cuando 44 y 45 estén en la release; C = CAM-49.

## Lo aprendido (para no repetirlo)

- **Rojo primero es obligatorio.** CAM-41 y CAM-42 se integraron sin él; no se repite. Excepciones, anotadas en la descripción del PR de la release.
- `npm run setup` usa `npm ci`: si cambias dependencias, corre `docker compose run --rm dev npm --prefix apps/web install` y sube el `package-lock.json`. En una fusión con conflicto en el lock, toma el de la release y vuelve a instalar.
- Cada worktree tiene su propio volumen de `node_modules` en Docker. No dejes `npm run dev` ocupando el puerto 5173 mientras otro agente corre; para pruebas usa `test`, `typecheck`, `lint` y `build`.
- `npm run test:integration` necesita `npm run db:start` y `npm run db:reset` (Docker, todo en D:). Al terminar, `npm run db:stop`.
- Las migraciones reservadas: `0017` para CAM-97. No edites migraciones existentes; `funciones_sin_anon` descubre las nuevas y exige que `anon` no ejecute ninguna función de `public` (no hagas grants masivos).
- La outbox sobrevive a re-login y actualizaciones (regla 10). Al cambiar de usuario usa solo `limpiarCacheDeServidor` de `infra/db/db.ts`.
- `/instalar` es pública; `/` y `/ajustes` van tras el login.
- Un fallo de red nunca cierra la sesión ni se trata como «no es miembro» (nota T-M2-01).

## Pendiente del socio (no lo hace un agente)

- **CAM-10:** proteger `main` en GitHub (exigir PR y CI verde, sin pushes directos; `release/*` sin protección). Requiere permisos de administrador.
- **T-M2-00 (CAM-84):** spike en iPhone real.
- **Verificación manual de la PWA** (lista en la nota T-M2-02): instalar en Chrome Android y Safari iPhone, abrir en modo avión tras la primera carga, comprobar que una versión nueva solo se aplica al tocar «Actualizar», y revisar `/ajustes` y las pantallas a 360 px.
- Reemplazar los íconos provisionales de la vitrina si se quiere identidad propia del back-office.
- Revisar los valores por defecto de reembolsos (nota T-M1-17 y addendum D-015).

## Fuera de esta ronda

H3 (terceros, catálogo, pedidos y compras en pantalla, incluida T-M4-08 CAM-98), headers y redirecciones de Cloudflare Pages (T-M8) y despliegue.
