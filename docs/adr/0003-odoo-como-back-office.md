# ADR-0003: Odoo como back-office; el sitio actual se mantiene

- **Estado:** Reemplazado por [ADR-0004](0004-plataforma-propia-pwa-supabase.md) (propuesto 2026-11-17). Aceptado el 2026-11-15.
- **Reemplaza:** [ADR-0002](0002-checkout-por-whatsapp.md) por completo y, de [ADR-0001](0001-infraestructura-vps-docker.md), lo relativo a web, blog, eCommerce y a la protección de rutas con Cloudflare Access.
- **Issue Linear:** CAM-14

## Contexto

Los ADR 0001 y 0002 planteaban que Odoo alojara la web, el blog y la tienda con un checkout que derivara a WhatsApp. Al revisar `caminocol.com` resultó que el sitio ya existe como proyecto **Next.js en Vercel** (repo `andrei-194/camino`), con identidad de marca, SEO trabajado, historias de producto y la página "Cómo pedir". Ese sitio declara que no es una tienda online: no tiene carrito, no cobra, y todo pedido pasa por WhatsApp con un mensaje prellenado por producto.

El catálogo es pequeño: 3 cafés y una crema de cacao en 4 sabores, más presentaciones de 5 libras para cafeterías. Se vende con stock propio comprado por adelantado y también sobre pedido.

Reconstruir ese sitio en Odoo implicaría rehacer el diseño y migrar el SEO, sin ganar nada que el sitio no haga ya. Principio rector: **KISS**.

## Decisión

1. **El sitio Next.js se mantiene** como vitrina pública, en Vercel. No se toca en este alcance.
2. **Odoo 20.0 Community es solo el back-office** (oficina interna). Módulos: Contactos, Inventario, Compras y Ventas. No se instalan Website, eCommerce ni Blog.
3. **Odoo no recibe tráfico público.** Vive en un subdominio (por ejemplo `erp.caminocol.com`) y **todo el subdominio** va detrás de Cloudflare Access, limitado a los usuarios internos. No hay portal de clientes.
4. **Flujo de pedido:** el cliente escribe por WhatsApp desde el sitio, como hoy. El equipo registra el pedido en Odoo como **cotización**. Se confirma solo cuando el pago está verificado; ahí se reserva stock, se genera la entrega y se factura internamente. Un pedido sin pago nunca afecta inventario ni balance.
5. **Inventario con dos modos:** stock propio (compra a productores, recepción, venta y entrega) y venta bajo pedido (compra al productor al confirmar la venta). Se parte con compra manual y se automatiza más adelante si el volumen lo pide.
6. **Productores como proveedores** (contactos de Odoo), con etiquetas de vereda y municipio y tarifas de compra por producto.
7. **Productos:** los datos de `lib/site.ts` del sitio son la referencia para el catálogo inicial. Los sabores de la crema de cacao son variantes del mismo producto. Cada presentación (250 g, 500 g, 5 libras) es un producto distinto. Se cargan con un script reproducible.
8. **Lo que se mantiene de ADR-0001:** Docker Compose con una imagen única, uv, Postgres, backups diarios fuera del VPS con restauración probada, Cloudflare Tunnel, despliegue con GitHub Actions por tag, y el proveedor del VPS decidido **al final**.
9. **Despliegue al final:** se desarrolla y valida todo en local primero (hitos M1 y M2). El proveedor del VPS se elige en M4. Mientras tanto, la base local es de ensayo: no se registran datos reales de negocio hasta tener producción con backups.

## Consecuencias

- **Positivas:** avance visible más rápido, sin rehacer diseño ni SEO; servidor más pequeño y barato porque no atiende al público; superficie de ataque mínima; se elimina el conflicto de Access con el login de clientes.
- **Negativas:** el sitio y Odoo son dos sistemas, así que precios y disponibilidad pueden desfasarse hasta que se conecten (hito M3, opcional). El registro del pedido en Odoo es manual al inicio.
- **Se descartan:** los addons `camino_theme` y `camino_checkout_whatsapp`, el blog en Odoo y Cloudflare Turnstile.

## Opciones que quedan abiertas

- **Carrito en el sitio** que arme un único mensaje de WhatsApp con varios productos. Se haría en el repo del sitio, sin tocar Odoo.
- **Registro automático** del pedido en Odoo a través de su API, y **disponibilidad real** del stock en el sitio (M3). Se decide con la experiencia de M2.
- **Migrar la web a Odoo** más adelante, si el negocio lo pide.

## Alternativas descartadas

- **Migrar todo el sitio a Odoo** (ADR-0001 y ADR-0002 originales): mucho trabajo antes de ver resultados y pérdida de diseño y SEO ya hechos.
