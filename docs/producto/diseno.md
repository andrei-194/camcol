# Sistema de diseño de Camino Col

Rediseño premium ([CAM-105](https://linear.app/caminocol/issue/CAM-105)), base en T-D1 ([CAM-106](https://linear.app/caminocol/issue/CAM-106)). La fuente de los valores es `apps/web/src/index.css` (bloques `@font-face` y `@theme`); este documento los explica. La maqueta aprobada por el socio está en https://claude.ai/artifact/Y7jXmELTfp6Baw3wLGBv5X.

## Idea

La app es la oficina de Camino Col y habla el mismo idioma visual que la web: papel cálido, café profundo y el logo de la montaña con el camino. Se usa con una mano, a veces al sol y sin señal: mucho papel para leer, café para la estructura y el texto, y un solo color de acción, el cacao. El rojo existe únicamente para errores, faltantes y acciones destructivas.

Tres rasgos de marca: la cabecera de café con el logo grande recortado, el **disco central** de Inicio con su anillo incompleto, y los números de dinero y stock en Fraunces.

## Estado de implementación

| Hecho en T-D1 (CAM-106) | Objetivo de T-D2 a T-D6 (aún no está en el código) |
|---|---|
| **T-D3:** cabecera de café con logo y filo de trigo, barra de estado de café, barra inferior de cinco destinos con el disco central, menú flotante «+», rutas de Ventas, Compras, Inventario y Más (las tres primeras y las acciones rápidas muestran «llega pronto»). Paleta, tipografía autoalojada, grano de papel, sombra `shadow-papel`, foco y selección en terracota, escala. **T-D2:** botones en pastilla y deshabilitado en arena, tarjetas y campos sobre el papel, `Logo`, `Dinero`, `Segmentos`, `FilaLista` | Tablero de Inicio con gráficos (T-D4); tablero con gráficos (T-D4); pantallas actuales con los rasgos nuevos y filetes punteados (T-D5); color de la barra del teléfono (T-D6) |

Lo descrito más abajo como «navegación», «superficies» de componentes y reglas 4 y 7 es el **objetivo**; cada tarea lo cumple al integrarse.

## Componentes actuales (`apps/web/src/ui/componentes/`)

T-D2 (CAM-107) los rediseña: `Boton` en pastilla con deshabilitado en arena y tinta (sin `opacity-50`), `Tarjeta` en blanco sobre el papel con `shadow-papel`; `CampoTexto` y los selects, también en blanco (`bg-tarjeta`), sin sombra. `BarraSuperior` y `Pagina` los rehace T-D3.

| Componente | Qué es |
|---|---|
| `Pagina` | Barra superior y columna de contenido de 448 px. |
| `BarraSuperior` | Cabecera de café con el único `h1`, el logo en trigo recortado a la derecha y el filo de trigo. |
| `Boton`, `BotonEnlace` | `primario` (cacao), `secundario` (contorno), `peligro`. 48 px de alto. |
| `CampoTexto` | Etiqueta visible, ayuda y error vinculados con `aria-describedby`. |
| `Tarjeta` | Superficie blanca (`bg-tarjeta`) sobre el papel, con borde fino y `shadow-papel`. |
| `EtiquetaEstado`, `Aviso` | Pastilla de estado y mensaje en línea. |
| `Logo` | Montaña con camino aprobada de la web (`marcaCamino.ts`), con `currentColor`; con `titulo` es imagen accesible. |
| `Dinero` | Pesos sin decimales en Fraunces con cifras tabulares; el «$» va menor y en tinta. |
| `Segmentos`, `SelectorPeriodo` | Pastillas de una opción (`aria-pressed`, 48 px); el selector ofrece hoy, semana y mes. |
| `FilaLista` | Fila de lista de 48 px con filete punteado. |
| `BarraInferior`, `MenuAcciones`, `MarcoApp` (`ui/marco/`) | Navegación principal con el disco central, botón «+» con las tres acciones rápidas, y el marco que los pone en toda pantalla con sesión. |

`IndicadoresEstado` y `AvisoActualizacion` usan los mismos tokens; los enlaces dentro de un texto usan `CLASES_ENLACE` (cacao subrayado).

## Paleta

Son los colores de la web (`camino/app/globals.css`), con nombres funcionales para la app. Los nombres de token anteriores se conservaron para no romper pantallas; solo cambió su valor.

| Token (Tailwind) | Valor | Uso |
|---|---|---|
| `fondo` | `#fbf7ee` | papel: fondo de pantalla |
| `superficie` | `#f6efe2` | crema: filas, zonas secundarias |
| `tarjeta` | `#ffffff` | tarjetas y campos sobre el papel |
| `arena` | `#eadfc8` | separadores suaves, botón deshabilitado |
| `borde` / `trigo` | `#d9c7a0` | divisores, detalles sobre el café |
| `texto` / `cafe` | `#3a2418` | texto y cabecera |
| `texto-secundario` | `#6b5647` | tinta: ayudas y datos de apoyo |
| `borde-fuerte` | `#857260` | borde de campos (4,6 contra la tarjeta; mínimo 3) |
| `acento` | `#5a3a2a` | cacao: botón primario, enlaces, estado activo |
| `acento-hover` | `#3a2418` | pulsado |
| `acento-suave` | `#f1e9e4` | fondo de etiquetas de acento |
| `sobre-acento` | `#fbf7ee` | texto sobre el cacao |
| `terracota` | `#b5532f` | **solo** foco del teclado, selección y camino punteado |
| `peligro` / `peligro-suave` | `#b3261e` / `#fcecea` | errores, faltantes, «Descartar» |
| `exito` / `exito-claro` | `#1b6e3c` / `#8fd4a6` | «En línea», cifras que suben / sobre la barra de estado de café |
| `advertencia` / `advertencia-suave` / `advertencia-claro` | `#7a4a00` / `#fbf1de` / `#f0c27a` | sin conexión, pendientes, lo que pide atención / sobre la barra de estado de café |

`index.css` hace `--color-*: initial`: solo existen los tokens de arriba. Regla de proporción: papel y crema dominan; el café es estructura y texto; el cacao aparece en **un solo botón primario por pantalla**; el ámbar marca lo que pide atención.

## Contraste (WCAG AA)

Se calcula y verifica en `apps/web/src/ui/componentes/contraste.test.ts` (lee los valores de `index.css`). Texto normal exige 4,5; componentes de interfaz, 3.

| Par | Razón |
|---|---|
| `texto` sobre `fondo` / `superficie` | 13,6 / 12,7 |
| `texto-secundario` sobre `fondo` / `superficie` | 6,5 / 6,0 |
| `fondo` sobre `cafe` (cabecera) | 13,6 |
| `trigo` sobre `cafe` | 8,7 |
| `acento` sobre `fondo` / `superficie` / `acento-suave` | 9,5 / 8,9 / 8,5 |
| `sobre-acento` sobre `acento` | 9,5 |
| `peligro` sobre `fondo` / `superficie` | 6,1 / 5,7 |
| `exito` sobre `fondo` | 5,9 |
| `exito-claro` / `advertencia-claro` sobre `cafe` | 8,4 / 8,8 |
| `advertencia` sobre `fondo` / `advertencia-suave` | 7,0 / 6,7 |
| `terracota` sobre `fondo` (foco) | 4,6 (mínimo 3) |
| `sobre-acento` sobre `terracota` (texto seleccionado) | 4,6 |
| `peligro` / `exito` sobre `superficie` | 5,7 / 5,5 |
| `texto-secundario` sobre `arena` | 5,2 |

Cada fila de esta tabla tiene su prueba en `contraste.test.ts`.

El color nunca es el único portador del significado: cada estado lleva texto («Faltante», «Sin conexión», «Sin subir»).

## Tipografía

Las de la web, **autoalojadas** para funcionar sin red (`apps/web/src/fonts/`; Fraunces recortada a español con `scripts/subconjunto-fuentes.py` y Work Sans tal como la sirve Google, ya en su subconjunto latino; 125 KB en total, precacheadas por el service worker, `font-display: swap`):

- **Titulares y cifras** (`font-titulo`): Fraunces, pesos 500 a 700. El eje óptico (24 a 144) lo ajusta solo el navegador según el tamaño; no se fija en el CSS. Precios, totales, stock y KPI van aquí, con `tabular-nums`.
- **Nombres de personas** (`.nombre`): Fraunces cursiva, como en la web.
- **Cuerpo** (`font-cuerpo`): Work Sans, pila de respaldo del sistema.

Escala: `text-pequeno` 14 px · `text-cuerpo` 16 px (nunca menos en campos: iOS hace zoom) · `text-seccion` 20 px · `text-titulo` 28 px · `text-marca` 34 px · `text-cifra` 40 px. Cuerpo siempre en peso 400 o más. Líneas de menos de 70 caracteres.

## Superficies

- **Papel:** el fondo lleva el grano de papel de la web (`src/assets/grano-papel.webp`, 12 KB).
- **Sombra** `shadow-papel` (la de «papeles apilados» de la web: plana y corta) en tarjetas y gráficos. `shadow-flotante`, profunda, solo en lo que flota: disco central, botón «+» y menú flotante.
- **Radios:** 8 px en tarjetas y controles; los botones son pastilla (como en la web, donde es lo único redondeado del todo).
- **Filetes punteados** en listas y el **camino punteado** (`.camino-punteado`, terracota) como separador.

## Navegación y pantallas

Barra inferior de cinco destinos, con Inicio en el centro como disco de café con anillo de trigo incompleto:

| Destino | Contiene | Conexión |
|---|---|---|
| Ventas | pedidos por confirmar, esperando pago, por reembolsar, todos; detalle, cobros, documentos | con conexión |
| Compras | compra inmediata y encargo, recibir, necesidades, comprobante | funciona sin señal |
| **Inicio** | tablero (RF-DSH): ventas, ganancia, margen, gráficos, lo que pide atención | conexión o copia «datos al…» |
| Inventario | stock, kardex, lotes, ajustes | stock desde copia local |
| Más | pendientes (con contador), catálogo, clientes y proveedores, gastos, ajustes, cómo instalar | según la función |

Un botón «+» flotante abre Nuevo pedido (primario), Nueva compra y Gasto. No hay gráfico de velas: el negocio no tiene serie de apertura y cierre; ventas contra costo va en área y lo demás en barras.

## Reglas

1. **Contraste AA** en todo texto con los pares de la tabla. No inventar colores fuera de los tokens.
2. **Objetivos táctiles de 48 px** como mínimo, con 8 px entre vecinos.
3. **Viewport de 360 px**: una columna, sin desplazamiento horizontal. Respetar `safe-area` de iOS.
4. **Estados completos**: vacío con una frase que invita a actuar, cargando (`role="status"`) y error que dice qué pasó y qué hacer. El botón deshabilitado se ve «apagado con intención» (arena y tinta), no con `opacity-50`.
5. **Foco visible**: 3 px en terracota (trigo sobre la cabecera de café, clase `sobre-oscuro`). Nunca `outline: none`.
6. **Un acento por pantalla**: la acción principal en cacao; las demás, secundarias. El rojo no es decoración.
7. **Jerarquía numérica**: el dinero y el stock son el elemento más grande de su tarjeta, en Fraunces con cifras tabulares; el «$» va más pequeño y en tinta.
8. **Movimiento**: solo el que responde a una acción; `prefers-reduced-motion` lo apaga.
9. **Sin recursos externos**: ni fuentes, ni íconos, ni imágenes remotas.
10. **Vocabulario**: «productores del campo colombiano», nunca «campesino» (decisión de la web, `docs/DECISION-VOCABULARIO.md` de ese repo). Tuteo cercano.

## Logo y PWA

El logo es el aprobado de la web (`camino-mark.svg`, `currentColor`: trigo sobre el café, cacao sobre el papel). Los íconos 192, 512 y maskable de la app ya son los mismos archivos que los de la web. El color de la barra del teléfono y de la pantalla de arranque pasa al café y al papel en T-D6 ([CAM-111](https://linear.app/caminocol/issue/CAM-111)).
