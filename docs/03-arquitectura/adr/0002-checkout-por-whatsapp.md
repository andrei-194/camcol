# ADR-0002: Checkout que deriva a WhatsApp y confirma el pago a mano

- **Estado:** Propuesto
- **Fecha:** 2026-11-15
- **Decide:** equipo Camino

## Contexto

Camino compra a los campesinos bajo pedido y vende como vitrina virtual. Las ventas se centralizan por WhatsApp: allí se confirman los datos, el método de pago y se envía el seguimiento. Algunas entregas las hace el equipo mismo en un pueblo cercano.

Riesgo a evitar: que un pedido sin pago verificado afecte el inventario o el balance.

## Decisión

1. El carrito de la web usa el **eCommerce de Odoo Community**.
2. Al finalizar el checkout, Odoo crea una **cotización** (no un pedido confirmado). Una cotización no reserva stock, no genera orden de entrega ni factura.
3. La pantalla final muestra un botón **"Continuar por WhatsApp"** que abre `wa.me/<número>` con un mensaje prellenado: número de cotización, productos, cantidades, total y datos del cliente.
4. El equipo confirma datos y método de pago por WhatsApp. **Solo cuando el pago está verificado**, confirma la cotización en Odoo, lo que genera la orden de entrega y afecta inventario y facturación.
5. El envío es manual: entrega propia o guía de Envía/Servientrega. La guía se registra en la orden de entrega y se envía al cliente por WhatsApp.
6. Las cotizaciones sin pagar **vencen** por fecha de expiración.
7. Se implementa con un addon pequeño, `camino_checkout_whatsapp`, que reemplaza la pantalla final del checkout. Se agrega **Cloudflare Turnstile** al checkout contra bots.
8. Se usa el enlace `wa.me`, **no la API de WhatsApp**: sin costo y sin aprobación de Meta.
9. Las compras a los campesinos se crean a mano desde Odoo al inicio. La ruta automática "Comprar bajo pedido" queda para cuando crezca el volumen.

## Verificación pendiente

La spec debe comprobar, en la versión exacta de Odoo elegida, que el checkout sin pasarela de pago deja la orden en estado de cotización y no confirma el pedido ni reserva stock. Si el comportamiento por defecto difiere, el addon debe forzarlo.

## Consecuencias

- **Positivas:** el balance y el inventario solo cambian con pagos verificados; sin costos de API; mínimo código propio; si el cliente no abre WhatsApp la cotización igual queda registrada en Odoo.
- **Negativas:** la confirmación y el seguimiento son manuales, lo que limita el volumen que se puede atender. Las cotizaciones falsas son posibles; se mitigan con Turnstile y expiración.

## Alternativas descartadas

- **Pasarela de pago en línea:** no se necesita hoy y puede confirmar pedidos antes de tiempo.
- **API de WhatsApp Business:** costo y complejidad de aprobación que no se justifican con el volumen actual. Se reevalúa más adelante.
- **Dropi:** su modelo está pensado para dropshipping; no encaja con compra a campesinos bajo pedido. Se reevalúa si cambia el modelo.
