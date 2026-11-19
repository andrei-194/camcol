# Camino Col

Plataforma operativa (PWA móvil) para registrar pedidos de venta, compras a campesinos (también sin señal), inventario, pagos, gastos y analítica. La usan los dos socios. Costo de infraestructura ≈ $0.

La vitrina pública (https://caminocol.com, Next.js en Vercel) vive en otro repositorio y no cambia. Los clientes piden por la web, el pedido se confirma por WhatsApp y los socios lo registran aquí.

## Estado

**H1 (cimientos) cerrado.** La base de datos está completa y probada: esquema, `aplicar_ops` con sus operaciones (terceros, compras, compra de apertura, pedidos de venta, gastos y adjuntos), `sync_pull`, candados de seguridad y pruebas de integración reales contra Supabase local. La app web es solo el esqueleto: sigue H2 (login, PWA, datos locales y sincronización). Antes quedan tres validaciones y los reembolsos (T-M1-15 a T-M1-17). Ver el [roadmap](docs/producto/roadmap.md) y [TASKS](docs/spec/TASKS.md).

## Documentación

| Qué | Dónde |
|---|---|
| Qué construir (requisitos, reglas, escenarios) | [docs/spec/SPEC.md](docs/spec/SPEC.md) |
| Cómo construirlo (stack, arquitectura, contratos) | [docs/spec/PLAN.md](docs/spec/PLAN.md) |
| En qué orden | [docs/spec/TASKS.md](docs/spec/TASKS.md) |
| Hitos y fechas | [docs/producto/roadmap.md](docs/producto/roadmap.md) |
| Decisiones de arquitectura (ADR) | [docs/adr/](docs/adr/) |
| Decisiones de negocio y de la spec | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Catálogo, precios y costos | [docs/negocio/catalogo.md](docs/negocio/catalogo.md) |
| Cómo trabajamos | [AGENTS.md](AGENTS.md) |

## Estructura

```
docs/        spec, roadmap, ADR, decisiones, material del negocio
supabase/    migraciones SQL (solo hacia adelante)
tests/       db/ (PGlite) e integration/ (Supabase local); los E2E viven en apps/web/e2e/
apps/web/    la PWA (Vite + React + TypeScript + Tailwind)
```

## Requisitos

- **Docker Desktop.** La app web corre dentro de un contenedor con Node 22, así que no hace falta instalar Node 22 en el PC.
- Node.js 20 o superior en el PC, para `setup`, las pruebas de base de datos, la carga del catálogo y la CLI de Supabase (todo se instala con `npm run setup`).

## Primer arranque (en este orden)

Abre Docker Desktop y espera a que diga «running». Después, en la carpeta del proyecto:

```bash
npm run setup        # 1. instala las dependencias del PC y de la app (una vez; repite si cambia un package.json)
npm run db:start     # 2. levanta Supabase local (la primera vez baja varias imágenes)
npm run db:reset     # 3. aplica las migraciones a la base local
npm run db:catalogo  # 4. carga los 10 artículos del catálogo
npm run db:status    # 5. muestra las claves locales: copia la «anon key»
cp .env.example apps/web/.env.local   # 6. crea la config; abre ese archivo y pega la anon key en VITE_SUPABASE_ANON_KEY
npm run dev          # 7. levanta la app: http://localhost:5173 (déjala abierta en su terminal)
# 8. crea tu usuario para poder entrar (sección siguiente)
```

Desde el móvil, en el mismo WiFi: `http://<IP de tu PC>:5173`, y pon esa misma IP en `VITE_SUPABASE_URL` de `apps/web/.env.local`. Si no carga, permite el puerto 5173 en el Firewall de Windows.

### Crear tu usuario (para poder entrar)

El registro público está cerrado: el socio se crea a mano, una vez por base. **`npm run db:reset` borra usuarios y datos** (no hay seed): después de cada reset repite estos pasos y también `npm run db:catalogo`.

1. Abre Studio (http://127.0.0.1:54323) → **Authentication → Users → Add user**, con correo y contraseña (marca «Auto Confirm User»).
2. Copia el **User UID** de ese usuario.
3. En Studio → **SQL Editor**, corre (cambia el UID y el nombre):

   ```sql
   insert into miembros (user_id, nombre) values ('<User UID>', 'Tu nombre');
   ```

Sin la fila en `miembros`, el login funciona pero la app no muestra datos (RLS).

Si un comando falla con «Falta instalar dependencias» o «¿Está levantado Supabase local?», el mensaje dice cuál de los pasos de arriba repetir.

## Comandos

```bash
npm run setup        # instala todo (PC y contenedor)
npm run test:db      # pruebas del esquema, en memoria con PGlite
npm run test:integration   # integración REAL contra Supabase local (requiere db:start y db:reset)
```

### App web (en Docker)

```bash
npm run setup        # instala las dependencias del PC y, dentro del contenedor, las de apps/web (una vez)
npm run dev          # servidor de desarrollo: http://localhost:5173
npm test             # pruebas de la app
npm run typecheck    # tipos (TypeScript estricto)
npm run lint
npm run build
```

Los `node_modules` viven en un volumen de Docker (en D:), no en la carpeta del proyecto. El editor no verá los tipos de las dependencias; es esperado.

### Base de datos local (Supabase en Docker)

La CLI de Supabase viene como devDependency (`npm run setup`); no hace falta instalarla aparte. Requiere Docker Desktop en ejecución. La primera vez descarga varias imágenes (unos GB).

```bash
npm run db:start     # levanta Supabase local (Postgres, Auth, Realtime, Storage, Studio)
npm run db:reset     # recrea la base desde cero y aplica supabase/migrations/*.sql
npm run db:catalogo  # carga el catálogo inicial (10 artículos) en la base local; NO en producción hasta la regla 14
npm run db:status    # URLs y claves locales
npm run db:stop      # detiene los contenedores (los datos se conservan en un volumen)
```

- `db:reset` es el comando que recrea la base local con todas las migraciones aplicadas.
- Estudio (UI): http://127.0.0.1:54323 · API: http://127.0.0.1:54321 · Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Las claves locales (`anon`, `service_role`) las imprime `npm run db:status`; son solo de desarrollo y no se copian a archivos versionados. Pon la `anon key` en `apps/web/.env.local` como `VITE_SUPABASE_ANON_KEY`.
- El registro público de Auth está deshabilitado (`enable_signup = false`): crea los usuarios de los socios desde Estudio (Authentication > Users) o con la API de administración.
- Verificar el esquema: `docker exec supabase_db_camino psql -U postgres -c "\dt"` (también `\dv`, `\df emitir_documento`).

### Pruebas de integración (Supabase local)

```bash
npm run db:start && npm run db:reset   # Supabase local con las migraciones aplicadas por la CLI
npm run test:integration               # RLS por JWT, concurrencia, privilegios de anon y ops de punta a punta
```

Corren contra Postgres, Auth y PostgREST reales (usan `pg`); no se ejecutan con `npm run test:db`. Leen las claves locales de `supabase status` al correr (no hay secretos en el repo) y crean sus usuarios de prueba con la API de administración de Auth. Se pueden repetir sin reiniciar la base.

### E2E (Playwright, Chromium y WebKit)

```bash
npm run db:start && npm run db:reset   # Supabase local (requisito)
npm run test:e2e                       # E2E de la app en Docker contra Supabase local
npm run test:e2e -- --project=chromium # solo un navegador
```

Corre dentro de la imagen oficial de Playwright (servicio `e2e` de `docker-compose.yml`; baja ≈ 2 GB la primera vez, en el disco de Docker en D:) y necesita haber hecho `npm run setup`. El script lee las claves de `supabase status`, crea el usuario de prueba `e2e@e2e.test` y construye la app en modo `e2e` (con un gancho solo de prueba que no existe en producción). Los E2E están en `apps/web/e2e/`; **no** forman parte de `test:db` ni del CI (ver nota T-M2-09 de `docs/DECISIONS.md`).

## Configuración

```bash
cp .env.example apps/web/.env.local   # la app (Vite) lee apps/web/.env.local; pega ahí la anon key de npm run db:status
```

Nunca se suben secretos al repositorio.
