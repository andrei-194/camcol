# Camino Col

Plataforma operativa (PWA móvil) para registrar pedidos de venta, compras a campesinos (también sin señal), inventario, pagos, gastos y analítica. La usan los dos socios. Costo de infraestructura ≈ $0.

La vitrina pública (https://caminocol.com, Next.js en Vercel) vive en otro repositorio y no cambia. Los clientes piden por la web, el pedido se confirma por WhatsApp y los socios lo registran aquí.

## Estado

Arranque del proyecto. Existe el esquema de base de datos (`supabase/migrations/0001_core.sql`) con 24 pruebas; la app aún no está construida. Ver el [roadmap](docs/producto/roadmap.md) y [TASKS](docs/spec/TASKS.md).

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
tests/       db/ (PGlite), luego integration/ y e2e/
apps/web/    la PWA (se crea en T-M0-01)
```

## Requisitos

- Node.js 22.12+ y npm (instalarlo en D:)
- Docker Desktop (la [CLI de Supabase](https://supabase.com/docs/guides/local-development) se instala con `npm install`)

## Comandos

```bash
npm install
npm run test:db      # 24 pruebas del esquema, en memoria con PGlite
```

### Base de datos local (Supabase en Docker)

La CLI de Supabase viene como devDependency (`npm install`); no hace falta instalarla aparte. Requiere Docker Desktop en ejecución. La primera vez descarga varias imágenes (unos GB).

```bash
npm run db:start     # levanta Supabase local (Postgres, Auth, Realtime, Storage, Studio)
npm run db:reset     # recrea la base desde cero y aplica supabase/migrations/*.sql
npm run db:status    # URLs y claves locales
npm run db:stop      # detiene los contenedores (los datos se conservan en un volumen)
```

- `db:reset` es el comando que recrea la base local con todas las migraciones aplicadas.
- Estudio (UI): http://127.0.0.1:54323 · API: http://127.0.0.1:54321 · Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Las claves locales (`anon`, `service_role`) las imprime `npm run db:status`; son solo de desarrollo y no se copian a archivos versionados. Pon la `anon key` en `.env` como `VITE_SUPABASE_ANON_KEY`.
- El registro público de Auth está deshabilitado (`enable_signup = false`): crea los usuarios de los socios desde Estudio (Authentication > Users) o con la API de administración.
- Verificar el esquema: `docker exec supabase_db_camino psql -U postgres -c "\dt"` (también `\dv`, `\df emitir_documento`).

El resto de comandos (`dev`, `test`, `test:integration`, `test:e2e`) se agregan con las tareas de `TASKS.md`.

## Configuración

```bash
cp .env.example .env
```

Nunca se suben secretos al repositorio.
