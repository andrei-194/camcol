# AGENTS.md

Guía para humanos y agentes que trabajan en Camino.

## Qué es

Vitrina virtual de productos campesinos. Odoo 19.0 Community en un solo servidor: web, blog, tienda, inventario, compras, ventas y facturación básica. Principio rector: **KISS**. No se agrega nada que no se necesite hoy.

## Stack

Odoo 19.0 Community, Python 3.12, Postgres 16, Docker Compose, uv, GitHub Actions. El proveedor del VPS está pendiente (ver ADR-0001); la imagen Docker es la misma para cualquiera.

## Mapa del repo

- `docs/02-specs/` : una carpeta por feature con su `spec.md`. **Se escribe antes del código.**
- `docs/03-arquitectura/adr/` : decisiones de arquitectura. Leer antes de proponer cambios grandes.
- `src/addons/camino_*` : addons de Odoo.
- `src/config/` : configuración de Odoo.
- `docker/` y `docker-compose.yml` : entorno.

## Flujo de trabajo

1. Cada trabajo tiene un issue en Linear (equipo `CAM`, ID `CAM-n`).
2. **SDD:** escribir o actualizar la spec en `docs/02-specs/` con requisitos y criterios de aceptación.
3. **TDD:** escribir el test, verlo fallar, implementar, verlo pasar.
4. Rama `CAM-n-descripcion-corta`; el PR y los commits mencionan `CAM-n` para que Linear los enlace.
5. Los commits van en español, en formato `tipo: resumen` (feat, fix, docs, chore, test).

## Reglas

- Sin secretos en el repo: van en `.env` (ignorado) y se documentan en `.env.example`.
- Los tests de Odoo llevan la etiqueta `camino`. Ver comando en el README.
- Cualquier funcionalidad nueva es un addon `camino_*` propio, con su spec.
- No agregar integraciones, PWA ni APIs sin una spec aprobada: están fuera de la v1 (ver ADR-0001).
- Pedidos: el checkout deja una cotización; solo se confirma cuando el pago está verificado (ADR-0002).
