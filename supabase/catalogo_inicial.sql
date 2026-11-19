-- Carga inicial del catálogo (CAM-53, T-M3-04, D-007). Fuente: docs/negocio/catalogo.md.
-- NO es una migración (las migraciones son esquema). Se carga a mano: `npm run db:catalogo`.
-- Idempotente: solo inserta lo que falta; nunca pisa nombres ni precios que los socios ya editaron.
-- NO cargar en producción hasta cumplir la regla 14 de AGENTS.md (backups y restauración probada).

-- Productos (lo que ve el cliente)
insert into productos (nombre, categoria) values
  ('Café Jardín',                  'Café'),
  ('Café Villa Luz',               'Café'),
  ('Café Montañero de Ceilán',     'Café'),
  ('Crema de cacao',               'Cacao'),
  ('Pastillas de chocolate',       'Cacao')
on conflict (nombre) do nothing;

-- Artículos (lo que se compra, guarda y vende; cada uno con su stock). La 5 lb es un artículo propio.
with datos (codigo, producto, nombre, variante, cantidad, unidad) as (values
  ('CJ-500',  'Café Jardín',              'Café Jardín 500 g',                           null,            500, 'g'),
  ('CJ-5LB',  'Café Jardín',              'Café Jardín 5 lb',                            null,            5,   'lb'),
  ('CVL-250', 'Café Villa Luz',           'Café Villa Luz 250 g',                        null,            250, 'g'),
  ('CMC-250', 'Café Montañero de Ceilán', 'Café Montañero de Ceilán 250 g',              null,            250, 'g'),
  ('CMC-5LB', 'Café Montañero de Ceilán', 'Café Montañero de Ceilán 5 lb',               null,            5,   'lb'),
  ('CC-ORI',  'Crema de cacao',           'Crema de cacao original 200 g',               'Cacao original', 200, 'g'),
  ('CC-MAN',  'Crema de cacao',           'Crema de cacao con maní 200 g',               'Maní',           200, 'g'),
  ('CC-NAR',  'Crema de cacao',           'Crema de cacao con naranja 200 g',            'Naranja',        200, 'g'),
  ('CC-CAF',  'Crema de cacao',           'Crema de cacao con café 200 g',               'Café',           200, 'g'),
  ('PCH-125', 'Pastillas de chocolate',   'Pastillas de chocolate 125 g',                null,            125, 'g')
)
insert into articulos (producto_id, codigo, nombre, variante, presentacion_cantidad, presentacion_unidad)
select p.id, d.codigo, d.nombre, d.variante, d.cantidad, d.unidad
  from datos d join productos p on p.nombre = d.producto
on conflict (codigo) do nothing;

-- Lista pública (la crea 0001; por si acaso) y sus precios. «Llévate 2» = escalón de 2 unidades a precio − 1.000.
insert into listas_precio (nombre, descripcion, es_publica)
select 'Público', 'Precios de caminocol.com', true
 where not exists (select 1 from listas_precio where es_publica)
   and not exists (select 1 from listas_precio where nombre = 'Público');

with datos (codigo, minima, precio) as (values
  ('CJ-500', 1, 38000), ('CJ-500', 2, 37000),
  ('CJ-5LB', 1, 170000),
  ('CVL-250', 1, 20000), ('CVL-250', 2, 19000),
  ('CMC-250', 1, 15000), ('CMC-250', 2, 14000),
  ('CMC-5LB', 1, 120000),
  ('CC-ORI', 1, 22000), ('CC-MAN', 1, 22000), ('CC-NAR', 1, 22000), ('CC-CAF', 1, 22000),
  ('PCH-125', 1, 17000)
)
insert into precios (lista_id, articulo_id, cantidad_minima, precio)
select (select id from listas_precio where es_publica), a.id, d.minima, d.precio
  from datos d join articulos a on a.codigo = d.codigo
on conflict (lista_id, articulo_id, cantidad_minima) do nothing;
