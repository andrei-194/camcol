# Sistema de diseño de Camino Col

Tarea T-M3-00 ([CAM-101](https://linear.app/caminocol/issue/CAM-101)). La fuente de los valores es `apps/web/src/index.css` (bloque `@theme`); este documento los explica. Las capturas a 360 px están en `docs/producto/capturas/`.

## Idea

Blanco, negro y el café de la marca. La app es una herramienta de trabajo que se usa con una mano, a veces al sol y sin señal: mucho blanco para leer, negro para la estructura (la barra superior y el texto) y un solo color de acento, el café cacao de la vitrina, para lo que se puede tocar. El rojo existe únicamente para errores y acciones destructivas; no es color de marca.

El detalle de marca es el filo café bajo la barra negra de cada pantalla y los títulos en serifa de papel.

## Paleta y proporción 60 / 30 / 10

| Grupo | Token (Tailwind) | Valor | Uso |
|---|---|---|---|
| Blanco (~60 %) | `fondo` | `#ffffff` | fondo de pantalla, tarjetas, listas |
| | `superficie` | `#f7f5f3` | fondo apenas distinto para zonas secundarias |
| | `borde` | `#ddd8d3` | divisores y bordes decorativos |
| Negro (~30 %) | `texto` | `#111111` | texto, barra superior, contorno de botones secundarios |
| | `texto-secundario` | `#4d4d4d` | ayudas y texto de apoyo |
| | `borde-fuerte` | `#7d7570` | borde de campos (3:1 contra el blanco) |
| Café (~10 %) | `acento` | `#5a3a2a` | botón primario, enlaces, filo de la barra, foco, estado activo |
| | `acento-hover` | `#3a2418` | café oscuro: hover y pulsado del acento |
| | `acento-suave` | `#f1e9e4` | fondo de etiquetas de acento |
| | `sobre-acento` | `#ffffff` | texto sobre el café |
| Rojo (solo error o destructivo) | `peligro` | `#b3261e` | errores, «Descartar», «Sí, descartar» |
| | `peligro-suave` / `sobre-peligro` | `#fcecea` / `#ffffff` | fondo de error / texto sobre rojo |
| Estados mínimos | `exito` | `#1b6e3c` | solo el indicador «En línea» |
| | `advertencia` / `advertencia-suave` | `#7a4a00` / `#fbf1de` | sin conexión, pendientes, avisos que piden atención |

`index.css` hace `--color-*: initial`: las clases de color por defecto de Tailwind (`emerald`, `stone`…) no existen; solo se pueden usar los tokens de arriba. No se usan crema, kraft ni terracota de la vitrina.

### Cómo comprobar las proporciones

Las proporciones son una guía de peso visual, no un número exacto. Para revisarlas: tomar la captura a 360 px de la pantalla, y contar píxeles por familia (blanco, negro, café). Con las capturas de esta tarea el blanco ocupa entre 64 % y 83 % del área, el negro entre 9 % y 14 % y el café entre 1 % y 8 %. El orden blanco > negro > café se cumple siempre; el negro queda por debajo de 30 % del área porque casi todo es texto fino y la barra superior, y eso es lo esperado. Regla práctica: si un café ocupa más área que el negro en una pantalla (por ejemplo varios botones primarios juntos), hay demasiados acentos; dejar uno primario por pantalla.

## Contraste (WCAG AA)

Razón de luminancia, calculada y verificada en `apps/web/src/ui/componentes/contraste.test.ts` (lee los valores de `index.css`; si cambia un color y rompe AA, la prueba falla). Texto normal exige 4,5; componentes de interfaz, 3.

| Par | Razón |
|---|---|
| `texto` sobre `fondo` | 18,88 |
| `texto` sobre `superficie` | 17,36 |
| `texto-secundario` sobre `fondo` / `superficie` | 8,45 / 7,77 |
| blanco sobre la barra negra | 18,88 |
| `acento` sobre `fondo` (enlaces) / `superficie` / `acento-suave` | 10,13 / 9,31 / 8,45 |
| `sobre-acento` sobre `acento` / `acento-hover` (botón primario) | 10,13 / 14,53 |
| `peligro` sobre `fondo` / `peligro-suave` | 6,54 / 5,70 |
| `sobre-peligro` sobre `peligro` (botón de peligro) | 6,54 |
| `exito` sobre `fondo` | 6,28 |
| `advertencia` sobre `fondo` / `advertencia-suave` | 7,48 / 6,68 |
| `borde-fuerte` sobre `fondo` (campos) | 4,52 (mínimo 3) |

El color nunca es el único portador del significado: cada estado lleva texto («Sin subir», «Error», «Sin conexión»).

## Tipografía

La vitrina usa Fraunces y Work Sans, que se sirven desde Google Fonts. La app debe funcionar sin red y no puede cargar fuentes externas, así que se usan pilas del sistema que conservan el carácter:

- **Titulares** (`font-titulo`): serifa de papel. `'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Noto Serif', serif`. En iPhone sale Iowan; en Android, la serifa del sistema.
- **Cuerpo** (`font-cuerpo`, por defecto): `system-ui, -apple-system, 'Segoe UI', Roboto, …`, la fuente del teléfono.

Escala: `text-pequeno` 14 px (ayudas, etiquetas) · `text-cuerpo` 16 px (nunca menos en campos: iOS hace zoom con menos) · `text-seccion` 20 px (subtítulos) · `text-titulo` 28 px (título de pantalla) · `text-marca` 36 px (inicio y acceso). Títulos en peso 600, sin mayúsculas sostenidas. Líneas de menos de 70 caracteres: la columna mide 448 px como máximo.

## Componentes (`apps/web/src/ui/componentes/`)

| Componente | Qué es |
|---|---|
| `Pagina` | Barra superior + columna de contenido de 448 px. Toda pantalla nueva empieza aquí. |
| `BarraSuperior` | Banda negra con filo café, «Volver» opcional y el único `h1` de la pantalla. `marca` agranda el título. |
| `Boton`, `BotonEnlace` | `primario` (café), `secundario` (contorno negro), `peligro` (rojo). 48 px de alto mínimo. Un solo primario por pantalla. |
| `CampoTexto` | Etiqueta visible, ayuda y error vinculados con `aria-describedby`; error con `role="alert"` y `aria-invalid`. |
| `Tarjeta` | Superficie blanca con borde fino y sombra mínima. No se anidan. |
| `EtiquetaEstado` | Pastilla con texto: `neutro`, `acento`, `advertencia`, `peligro`, `exito`. |
| `Aviso` | Mensaje en línea: `info`, `advertencia`, `error` (este con `role="alert"`). |

`IndicadoresEstado` (barra pegada arriba: conexión, pendientes, «Datos al…») y `AvisoActualizacion` usan los mismos tokens. Las clases de un enlace dentro de un texto están en `CLASES_ENLACE` (café subrayado).

Radios: `rounded-control` 8 px (botones, campos, avisos) y `rounded-tarjeta` 12 px. Sombras: `shadow-tarjeta` (reposo, casi plana) y `shadow-flotante` (solo el aviso de actualización).

## Reglas

1. **Contraste AA** en todo texto, con los pares de la tabla. No inventar colores fuera de los tokens.
2. **Objetivos táctiles de 48 px** como mínimo (botones, campos, filas de lista, enlaces sueltos). Los enlaces dentro de un párrafo se rodean de espacio.
3. **Viewport de 360 px**: una columna, sin desplazamiento horizontal; todo se prueba a 360 × 740.
4. **Estados**: cada lista o pantalla de datos define vacío («No tienes nada pendiente.»), cargando («Cargando…», `role="status"`) y error (`Aviso` de error, dice qué pasó y qué hacer).
5. **Foco visible**: contorno de 3 px en café (blanco sobre la barra negra, clase `sobre-oscuro`). Nunca `outline: none`.
6. **Un acento por pantalla**: la acción principal va en café; las demás, en contorno negro. El rojo no se usa como decoración.
7. **Movimiento**: solo el que responde a una acción; `prefers-reduced-motion` lo apaga.
8. **Sin recursos externos**: ni fuentes, ni íconos, ni imágenes remotas.

## PWA

`theme_color` y `background_color` del manifest y la meta `theme-color` son blancos (`#ffffff`): la barra de estado del teléfono y la pantalla de arranque coinciden con la barra de indicadores de la app, que siempre está arriba y es blanca. Los íconos son provisionales y no cambian en esta tarea.
