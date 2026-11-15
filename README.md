# Camino

Vitrina virtual de productos campesinos, sobre Odoo Community. Sitio: https://caminocol.com

## Requisitos

- Docker Desktop (con Docker Compose)
- [uv](https://docs.astral.sh/uv/) para las herramientas de desarrollo (Python 3.12+)

## Primeros pasos

```bash
cp .env.example .env          # ajusta las contraseñas
docker compose up -d --build  # Odoo + Postgres + Mailpit
```

| Servicio | URL |
|---|---|
| Odoo | http://localhost:8069 |
| Correos de prueba (Mailpit) | http://localhost:8025 |

La primera vez, Odoo te pide crear la base de datos desde el navegador.

## Comandos habituales

```bash
docker compose logs -f odoo       # ver logs
docker compose down               # parar (los datos se conservan)
docker compose down -v            # parar y BORRAR todos los datos

uv sync                           # instalar herramientas de desarrollo
uv run ruff check src             # lint
```

### Tests (TDD)

```bash
docker compose run --rm odoo odoo -d camino_test -u camino_base \
  --test-enable --test-tags camino --stop-after-init
```

En Git Bash de Windows no uses `--test-tags /camino_base`: la barra inicial se convierte en una ruta de Windows y no se ejecuta ningún test. Usa la etiqueta `camino`.

## Estructura

```
docs/      documentación (specs SDD, ADRs, procesos)
src/       código: addons de Odoo (camino_*) y configuración
tests/     pruebas fuera de Odoo (integración y e2e)
docker/    Dockerfile de la imagen
```

Cómo trabajamos: [AGENTS.md](AGENTS.md).
