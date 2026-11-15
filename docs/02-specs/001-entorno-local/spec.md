# SPEC-001: Entorno de desarrollo local con Docker

- **Estado:** En implementación
- **Issue Linear:** [CAM-6](https://linear.app/caminocol/issue/CAM-6/entorno-local-con-docker-odoo-190-postgres-mailpit), dentro de [CAM-5](https://linear.app/caminocol/issue/CAM-5/entorno-y-base-tecnica-de-local-a-produccion)
- **ADR relacionado:** [ADR-0001](../../03-arquitectura/adr/0001-infraestructura-vps-docker.md)

## Objetivo

Tener Odoo 20.0 Community funcionando en local con Docker Compose, lo más parecido posible a un VPS cualquiera, para empezar a desarrollar sin depender de la decisión del proveedor.

## Alcance

Incluye: Odoo, Postgres, servidor de correo de prueba, un addon base y su test.
No incluye: despliegue, CI, Cloudflare, backups, ni integraciones.

## Requisitos

1. `docker compose up` levanta Odoo y Postgres sin pasos manuales extra.
2. Odoo responde en `http://localhost:8069`.
3. Los datos de Postgres y el filestore sobreviven a un `docker compose down` (volúmenes con nombre).
4. El código de `src/addons/` se ve dentro del contenedor sin reconstruir la imagen.
5. La misma imagen se construye con `docker/odoo/Dockerfile`, que es la que se usará en producción.
6. Ningún secreto está en el repo: se leen de `.env` (ignorado por Git); `.env.example` documenta las variables.
7. Los correos que envíe Odoo en local los captura Mailpit y no salen a internet.
8. El addon `camino_base` se instala y su test pasa con el runner de Odoo.

## Criterios de aceptación

- [x] `docker compose up -d` deja los servicios `db` y `odoo` sanos.
- [x] `GET http://localhost:8069/web/login` devuelve 200.
- [x] Tras `docker compose down` y `up`, los datos siguen ahí (verificado con la base de pruebas, que sobrevivió al reinicio).
- [x] Editar un archivo de `src/addons/camino_base/` se refleja en el contenedor.
- [x] El comando de tests instala `camino_base` y termina con 0 fallos (1 test).
- [x] `git status` no muestra `.env` como archivo nuevo.

Pendiente: el filestore (`camino-odoo-data`) no se probó con adjuntos reales; se verifica al crear la primera base de datos de trabajo.

## Plan de pruebas (TDD)

El primer test es de humo: comprueba que `camino_base` queda instalado. Se escribió antes del manifest del addon y debe fallar mientras el addon no exista.

Comando:

```
docker compose run --rm odoo odoo -d camino_test -i camino_base --test-enable --stop-after-init --without-demo=all
```

## Decisiones abiertas

- Proveedor del VPS (ver ADR-0001): no bloquea este trabajo.
