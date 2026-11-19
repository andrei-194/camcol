# Runbook de Camino

Guía operativa mínima para quien mantiene el proyecto. Es un esqueleto: se completa a medida que avanzan los hitos. Cierra la base de RNF-SEC-07.

## 1. Variables de entorno

La app web las lee de `apps/web/.env.local` (ignorado por Git) a partir de `.env.example`.

| Variable | Qué es | ¿Pública? |
|---|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (en local: `http://127.0.0.1:54321`) | Sí, va en el cliente |
| `VITE_SUPABASE_ANON_KEY` | Clave `anon` de Supabase | Sí, es pública por diseño; la protege RLS |

Reglas:

- Todo lo que empieza por `VITE_` termina dentro del bundle del navegador. Nunca pongas ahí nada secreto.
- **La `service_role` nunca** va en el cliente, en el repo, en `.env.example`, en logs ni en capturas. Si se filtra, se rota desde el panel de Supabase.
- Los secretos de CI (cadena de conexión para backups, `AGE_RECIPIENT`, etc.) viven solo en los *secrets* de GitHub Actions.
- Si agregas una variable nueva, documéntala aquí y en `.env.example` (sin valor real).

## 2. Cómo correr en local

Requisitos: Docker Desktop (la app web corre en un contenedor con Node 22; no se instala Node 22 en el PC) y Node 20 o superior en el PC para `setup`, `test:db`, `db:catalogo` y la CLI de Supabase.

```bash
npm run setup      # una vez: dependencias del PC y de apps/web (dentro del contenedor)
npm run test:db     # pruebas del esquema en Postgres real (PGlite)
npm run dev         # app web en http://localhost:5173
npm test            # pruebas de la app (también typecheck, lint y build)
npm run db:start    # Supabase local (ver README)
npm run db:reiniciar  # base local limpia: migraciones + socios (supabase/socios.local.json) + catálogo
```

Los socios de desarrollo viven en `supabase/socios.local.json` (ignorado por Git; plantilla `socios.example.json`). Nunca van al repo ni a una base que no sea local.

- Si cambian `apps/web/package.json` o su lockfile, repetir `npm run setup`.
- El disco virtual de Docker debe estar en D: (Docker Desktop → Settings → Resources → Advanced).

## 3. Pérdida de un dispositivo

Aplica si un teléfono o computador con la app instalada se pierde, lo roban o lo usa alguien más.

1. **Cerrar todas las sesiones:** panel de Supabase, *Authentication > Users*, buscar al usuario y cerrar sesión en todos los dispositivos (o revocar sus sesiones). Eso invalida los *refresh tokens*.
2. **Cambiar la contraseña** del usuario afectado (y la del correo asociado si el dispositivo estaba abierto en él).
3. Si hay sospecha de uso indebido, revisar en el panel los últimos movimientos y pagos registrados por ese usuario.
4. Si el usuario deja de ser socio, quitarlo de la tabla `miembros`: sin membresía, RLS le devuelve 0 filas aunque conserve un token.

Qué datos pueden quedar en el dispositivo:

- Una **caché local** de lectura (catálogo, terceros, stock, pedidos recientes) en IndexedDB. Contiene datos de clientes (nombre, teléfono, municipio).
- La **cola de pendientes**: operaciones registradas sin conexión que aún no se subieron (RF-SYN-03). Estas **se pierden** si el dispositivo no se recupera.

Mitigación:

- Los pendientes nunca se suben solos, pero se avisa su antigüedad: subirlos pronto reduce la ventana de pérdida (RF-SYN-03, RF-OPS-02).
- Los pendientes se pueden exportar a JSON como respaldo de emergencia (RF-SYN-10).
- Tras cerrar sesiones el dispositivo ya no puede leer ni escribir en el servidor. La caché local sigue en el aparato: por eso conviene bloquear la pantalla del dispositivo y, si es posible, borrar el dispositivo de forma remota (Buscar mi dispositivo / Google Encuentra mi dispositivo).
- Al reponer el dato perdido, se vuelve a registrar a mano (las ops no son editables ni importables en el MVP).

## 4. Backups y restauración

Diseño en `docs/spec/PLAN.md` §12 (backup diario con `pg_dump` cifrado con `age`, retención 30 días, `restore-check.sh`).

- Workflow `backup.yml` y dónde se guardan los dumps: TODO(T-M8-01)
- Restaurar un dump en un Postgres local y correr las consultas de humo: TODO(T-M8-01)
- Respaldo de objetos de Storage (`soportes`): TODO(T-M8-01)
- Prueba de restauración documentada antes de salir a producción y luego trimestral: TODO(T-M8-01)

## 5. Reglas del entorno de desarrollo

- **Todo lo pesado va en el disco D:** repos, `node_modules`, caché de npm, imágenes y volúmenes de Docker, datos de Supabase local, navegadores de Playwright, dumps y descargas.
- **El disco C: está casi lleno:** no instales nada allí. Si una herramienta usa C: por defecto, redirige su caché o directorio de datos a D: antes de ejecutarla.
- Sin secretos en el repo ni en capturas de pantalla.
