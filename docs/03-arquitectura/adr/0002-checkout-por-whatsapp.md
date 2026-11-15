# ADR-0002: Checkout que deriva a WhatsApp y confirma el pago a mano

- **Estado:** Aceptado (2026-11-15). La verificación del flujo real en local queda pendiente para la spec del addon.
- **Fecha:** 2026-11-15
- **Decide:** equipo Camino

## Contexto

Camino compra a los campesinos bajo pedido y vende como vitrina virtual. Las ventas se centralizan por WhatsApp: allí se confirman los datos, el método de pago y se envía el seguimiento. Algunas entregas las hace el equipo mismo en un pueblo cercano.

Riesgo a evitar: que un pedido sin pago verificado afecte el inventario o el balance.

## Decisión

1. El carrito de la web usa el **eCommerce de Odoo Community**.
2. El checkout usa el método de pago nativo **Transferencia bancaria** (Wire Transfer). Al finalizar, Odoo deja la orden en estado **"Cotización enviada"** (no un pedido confirmado). Una cotización no reserva stock, no genera orden de entrega ni factura. Según la documentación de Odoo 20.0, la orden se queda así hasta que el pago se recibe y se confirma a mano.
3. La pantalla final muestra un botón **"Continuar por WhatsApp"** que abre `wa.me/<número>` con un mensaje prellenado: número de cotización, productos, cantidades, total y datos del cliente.
4. El equipo confirma datos y método de pago por WhatsApp. **Solo cuando el pago está verificado**, confirma la cotización en Odoo, lo que genera la orden de entrega y afecta inventario y facturación.
5. El envío es manual: entrega propia o guía de Envía/Servientrega. La guía se registra en la orden de entrega y se envía al cliente por WhatsApp.
6. Las cotizaciones sin pagar **vencen** por fecha de expiración.
7. Se implementa con un addon pequeño, `camino_checkout_whatsapp`, que agrega el botón de WhatsApp a la pantalla final del checkout mediante herencia de plantillas QWeb (XPath), sin tocar el código de Odoo. Se agrega **Cloudflare Turnstile** al checkout contra bots.
8. Se usa el enlace `wa.me`, **no la API de WhatsApp**: sin costo y sin aprobación de Meta.
9. Las compras a los campesinos se crean a mano desde Odoo al inicio. La ruta automática "Comprar bajo pedido" queda para cuando crezca el volumen.

## Verificación

- **Hecho:** la documentación oficial de Odoo 19.0 y 20.0 describe el mismo comportamiento: con transferencia bancaria la orden queda en "Quotation sent" y los productos no se reservan hasta recibir el pago y confirmar el pedido a mano.
- **Pendiente (spec del addon):** probar el flujo real en local con Odoo 20.0 y confirmar el nombre exacto de la plantilla de la página de confirmación de `website_sale`. Si el comportamiento real difiere de la documentación, el addon debe forzarlo.

## Consecuencias

- **Positivas:** el balance y el inventario solo cambian con pagos verificados; sin costos de API; mínimo código propio; si el cliente no abre WhatsApp la cotización igual queda registrada en Odoo.
- **Negativas:** la confirmación y el seguimiento son manuales, lo que limita el volumen que se puede atender. Las cotizaciones falsas son posibles; se mitigan con Turnstile y expiración.

## Alternativas descartadas

- **Pasarela de pago en línea:** no se necesita hoy y puede confirmar pedidos antes de tiempo.
- **API de WhatsApp Business:** costo y complejidad de aprobación que no se justifican con el volumen actual. Se reevalúa más adelante.
- **Dropi:** su modelo está pensado para dropshipping; no encaja con compra a campesinos bajo pedido. Se reevalúa si cambia el modelo.
