# Catálogo de productos

Estructura de lo que vende Camino, para cargar el catálogo inicial (T-M3-04). Sale de dos fuentes:

- **Sitio web** (`lib/site.ts` del repo `camino`, datos del 31 oct al 12 nov 2026): nombres, presentaciones, precios públicos y orígenes.
- **Costeo oficial** ([costeo-oficial.pdf](costeo-oficial.pdf), 17 nov 2026): costo de compra de tres productos y precios finales de esos tres.

Los socios confirmaron el 17 nov 2026 lo que está aquí (ver [DECISIONS](../DECISIONS.md), D-007).

## Cómo encaja en el modelo

| Concepto de la spec | En Camino | Ejemplo |
|---|---|---|
| **Producto** | Nombre comercial que ve el cliente | Café Jardín |
| **Artículo** | Lo que se compra, se guarda y se vende: una presentación (y un sabor, si aplica). Cada artículo tiene su propio stock | Café Jardín 500 g |
| **Unidad** | `g`, `lb` (= 500 g) | 5 lb = 2.500 g |
| **Lista pública** | Los precios de venta | $38.000 |
| **Escalón por cantidad** | La promo "llévate 2" | 2 und a $37.000 c/u |

## Artículos y precios (lista pública)

| SKU | Producto | Presentación | Precio | "Llévate 2" | Costo de compra |
|---|---|---|---|---|---|
| `CJ-500` | Café Jardín | 500 g | $38.000 | $74.000 | sin dato |
| `CJ-5LB` | Café Jardín | 5 lb (cafeterías) | $170.000 | no | sin dato |
| `CVL-250` | Café Villa Luz | 250 g | $20.000 | $38.000 | $13.000 |
| `CMC-250` | Café Montañero de Ceilán (alias "Café Laras") | 250 g | $15.000 | $28.000 | sin dato |
| `CMC-5LB` | Café Montañero de Ceilán | 5 lb (cafeterías) | $120.000 | no | sin dato |
| `CC-ORI` | Crema de cacao, cacao original | 200 g | $22.000 | no | $13.000 |
| `CC-MAN` | Crema de cacao, maní | 200 g | $22.000 | no | $13.000 |
| `CC-NAR` | Crema de cacao, naranja | 200 g | $22.000 | no | $13.000 |
| `CC-CAF` | Crema de cacao, café | 200 g | $22.000 | no | $13.000 |
| `PCH-125` | Pastillas de chocolate | 125 g | $17.000 | no | $12.000 |

- **"Llévate 2":** precio de 2 = 2 × precio − $2.000, es decir, cada unidad baja $1.000. Se modela como un escalón de `cantidad_minima = 2` con precio unitario = precio − $1.000 (RF-CAT-02, RN-PRE-01). Aplica solo a los tres cafés de bolsa pequeña.
- **Crema de cacao:** $22.000 es el precio vigente (costeo). La web todavía muestra $25.000 y debe actualizarse en su propio repositorio; no es parte de este proyecto.
- **Pastillas de chocolate:** se venden y se manejan en inventario, aunque aún no aparecen en la web.
- **Presentación de 5 libras:** los proveedores ya la entregan empacada así. Es un artículo con stock propio, igual que cualquier otro.
- **Grano o molido:** no es un artículo distinto. Se le pregunta al cliente por WhatsApp y se anota en las **notas del pedido**.
- **Café Jardín y Café Montañero de Ceilán:** usan el precio de la web. Su costo se conocerá con la primera compra que se registre.
- **Costo de compra:** el de las filas con dato es el precio a partir de 20 unidades; con menos, cuesta más. El sistema usa el costo real de cada compra (promedio ponderado), así que no hay que cargar estos valores como definitivos.
- **Envío:** gratis en Zarzal (entrega propia); en el resto del país lo cotiza la transportadora y varía (D6 de la spec). Se captura en cada pedido.
- **Lotes y vencimiento:** hoy no hay perecederos. Todos los artículos arrancan sin control de lote ni vencimiento; se activa por artículo si hace falta.

## Referencia: margen según el costeo oficial

El costeo calculó el margen sumando empaque, mermas, trabajo y costo fijo. El sistema **no** usa esos conceptos (D-008): el empaque se registra como gasto y el margen del dashboard es precio menos costo de compra.

| Artículo | Precio | Margen según el costeo |
|---|---|---|
| `CVL-250` | $20.000 | 16,1 % |
| `CC-*` | $22.000 | 25,1 % |
| `PCH-125` | $17.000 | 9,4 % |
