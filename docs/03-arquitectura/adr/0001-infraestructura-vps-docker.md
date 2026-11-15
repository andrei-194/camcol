# ADR-0001: Infraestructura en un VPS de OVH con Docker Compose

- **Estado:** Propuesto
- **Fecha:** 2026-11-15
- **Decide:** equipo Camino

## Contexto

Camino es una vitrina virtual de productos de campesinos. Necesita sitio web, blog, tienda, inventario, compras, ventas y facturas internas. Hoy hay 2 usuarios internos y menos de 100 productos. El presupuesto de infraestructura es de unos 5 a 8 USD al mes. El dominio `caminocol.com` está en Cloudflare (plan gratuito).

Principio rector: **KISS**. No se agrega nada que no se necesite hoy.

## Decisión

1. **Un solo sistema: Odoo 20.0 Community.** Es la última versión estable (imagen oficial `odoo:20.0`, build 20.0-20261112, Python 3.12). Se eligió sobre la 19.0 porque ya está disponible, se verificó que el flujo de checkout se comporta igual en su documentación (ver ADR-0002) y empezar en la última evita una migración mayor en el primer año. Cubre web, blog, eCommerce, inventario, ventas, compras y facturación básica.
2. **Un solo VPS con Docker Compose** y dos contenedores en producción: `odoo` y `postgres`. **El proveedor está pendiente.** Requisitos: 4 GB de RAM o más, pago mensual sin permanencia, unos 5 USD al mes y datacenter en EE. UU. (idealmente Miami o la costa este). Candidatos: Hetzner, Contabo, Vultr y OVH US. Se mide el rendimiento desde Colombia antes de decidir. **El desarrollo local en Docker no depende de esta decisión.**
3. **Cloudflare delante** (plan gratuito):
   - DNS, caché de recursos estáticos y filtro de bots.
   - **Cloudflare Tunnel** para publicar el servicio sin abrir puertos ni gestionar certificados.
   - **Cloudflare Access** solo sobre las rutas del ERP (`/web`), limitado a los usuarios internos.
4. **Entornos:** local (Docker Compose) y producción. Sin staging en el servidor por ahora.
5. **Imagen Docker única** con los addons `camino_*` dentro, publicada en GitHub Container Registry. Misma imagen en local y producción; solo cambian las variables de entorno.
6. **Despliegue con GitHub Actions:**
   - PR: lint, tests y build de la imagen.
   - Merge a `main`: se publica la imagen.
   - Tag `vX.Y.Z`: despliegue a producción por SSH, con aprobación manual.
7. **Backups:** `pg_dump` diario más el filestore, a un almacenamiento externo (Cloudflare R2). Se prueba una restauración antes de salir a producción.
8. **Configuración de Odoo en producción:** `list_db=False`, contraseña de administrador fuerte, `proxy_mode=True`, `workers=2`. Los secretos van en variables de entorno, nunca en el repo.

## Fuera de alcance (v1)

PWA, app móvil, `camino_api`, staging en servidor, facturación electrónica DIAN, y las integraciones con Dropi, pasarelas de pago y API de WhatsApp. Cada una entra como addon propio cuando el negocio lo pida, con su spec.

## Consecuencias

- **Positivas:** costo bajo y predecible, un solo sistema, poca superficie de ataque, y portabilidad: la imagen corre igual en cualquier host con Docker.
- **Negativas:** un solo servidor es un único punto de falla, y la seguridad y las actualizaciones del VPS son responsabilidad del equipo. Se mitiga con backups probados y caché en Cloudflare.
- **A medir tras desplegar:** consumo real de RAM. Si 4 GB no alcanza, se sube de plan.

## Alternativas descartadas

- **Railway:** cobra por uso; Odoo más Postgres consumen RAM todo el día y el costo supera el presupuesto.
- **Sitio estático en Cloudflare más Odoo solo como backend:** agrega sincronización entre dos sistemas sin necesidad con menos de 100 productos.
- **Odoo Enterprise:** fuera de presupuesto. No se necesita nada exclusivo de Enterprise para la v1.
