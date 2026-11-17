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

- Node.js 20+ y npm
- Docker Desktop y la [CLI de Supabase](https://supabase.com/docs/guides/local-development) (desde T-M0-03)

## Comandos

```bash
npm install
npm run test:db      # 24 pruebas del esquema, en memoria con PGlite
```

El resto de comandos (`dev`, `test`, `test:integration`, `test:e2e`) se agregan con las tareas de `TASKS.md`.

## Configuración

```bash
cp .env.example .env
```

Nunca se suben secretos al repositorio.
