-- =====================================================================
-- Camino Col · Migración 0010: op pedido_venta.crear (T-M1-05, CAM-35)
-- =====================================================================
-- Solo hacia adelante. Registra el tipo `pedido_venta.crear` en aplicar_ops (0003). SOLO CON CONEXIÓN
-- (D-009): el servidor no lo distingue, pero la PWA no lo encola. Una sola op, atómica (el sub-bloque
-- de aplicar_ops deshace todo si algo falla):
--   cliente (existente o `cliente_nuevo`) -> pedido en `recibido` -> ítems (precios y totales del servidor).
--   * No reserva ni mueve stock (RF-VEN-08): el pedido nace `recibido`.
--   * Precios: el servidor calcula `precio_lista = precio_para(artículo, cliente, cantidad)`, que ya
--     incluye el escalón por cantidad ("Llévate 2", D-007, RN-PRE-01), y el pactado
--     `precio_unitario = round(precio_lista · (1 − descuento_pct/100), 2)`. Si el cliente envió
--     `precio_lista` o `precio_unitario` y difieren (> $0,01), se corrige y se devuelve la advertencia
--     `PRECIO_CAMBIO` (RN-PRE-02). Artículo sin precio en la lista del cliente ni en la pública: E_PRECIO.
--   * Impuesto: `tasa_impuesto` de cada ítem sale del artículo en el servidor; lo que envíe el cliente se
--     ignora. Subtotal, impuestos y total los calculan los triggers de 0001.
--   * Advertencia `STOCK` (se acepta igual, [E5], D5): cantidad requerida (suma por artículo) mayor
--     que `v_stock.disponible_para_prometer`.
--   * `cliente_nuevo` reutiliza crear_tercero_desde_payload (0007), forzando es_cliente. Si pide revisión
--     de duplicados, la op devuelve {_revision:true, candidatos} y no escribe nada.
--   * Fecha: hasta mañana (E_FECHA), igual que 0008.
-- Códigos propios: E_PRECIO, E_FECHA, E_REF (más DATOS_INVALIDOS y E_CONSENTIMIENTO de 0007).
-- SECURITY INVOKER (la RLS aplica). search_path fijo.
-- =====================================================================

create or replace function op_pedido_venta_crear(p jsonb) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_ped        jsonb := p -> 'pedido';
  v_items      jsonb := p -> 'items';
  v_nuevo      jsonb := nullif(p -> 'cliente_nuevo', 'null'::jsonb);
  v_pv_id      uuid;
  v_cliente    uuid;
  v_tercero    jsonb;
  v_fecha      timestamptz;
  v_limite     timestamptz := now() + interval '1 day';
  v_n          int;
  i            int;
  v_it         jsonb;
  v_ids        uuid[] := '{}';
  v_arts       uuid[] := '{}';
  v_cants      numeric[] := '{}';
  v_pcts       numeric[] := '{}';
  v_listas     numeric[] := '{}';
  v_unit       numeric[] := '{}';
  v_tasas      numeric[] := '{}';
  v_art        uuid;
  v_cant       numeric;
  v_pct        numeric;
  v_lista      numeric;
  v_precio     numeric;
  v_env_lista  numeric;
  v_env_unit   numeric;
  v_req        numeric;
  v_disp       numeric;
  v_adv        jsonb := '[]'::jsonb;
  v_pv         pedidos_venta;
begin
  if v_ped is null or jsonb_typeof(v_ped) <> 'object' then
    raise exception 'DATOS_INVALIDOS: falta el objeto pedido';
  end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'DATOS_INVALIDOS: el pedido necesita al menos un item';
  end if;

  v_fecha := coalesce(nullif(v_ped ->> 'fecha', '')::timestamptz, now());
  if v_fecha > v_limite then
    raise exception 'E_FECHA: la fecha del pedido no puede ser futura';
  end if;
  if coalesce(nullif(v_ped ->> 'origen', ''), 'manual') not in ('web', 'whatsapp', 'manual') then
    raise exception 'DATOS_INVALIDOS: origen desconocido: %', v_ped ->> 'origen';
  end if;
  if coalesce(nullif(v_ped ->> 'entrega_tipo', ''), 'transportadora') not in ('transportadora', 'propia', 'recoge') then
    raise exception 'DATOS_INVALIDOS: tipo de entrega desconocido: %', v_ped ->> 'entrega_tipo';
  end if;

  v_pv_id := coalesce((v_ped ->> 'id')::uuid, gen_random_uuid());

  -- Ítems: validar forma y referencias (sin escribir todavía; los precios dependen del cliente)
  v_n := jsonb_array_length(v_items);
  for i in 0 .. v_n - 1 loop
    v_it := v_items -> i;
    if jsonb_typeof(v_it) <> 'object' then
      raise exception 'DATOS_INVALIDOS: item % mal formado', i;
    end if;
    v_art := (v_it ->> 'articulo_id')::uuid;
    v_cant := (v_it ->> 'cantidad')::numeric;
    v_pct := coalesce(nullif(v_it ->> 'descuento_pct', '')::numeric, 0);
    if v_art is null or v_cant is null then
      raise exception 'DATOS_INVALIDOS: item % requiere articulo_id y cantidad', i;
    end if;
    if v_cant <= 0 then
      raise exception 'DATOS_INVALIDOS: la cantidad del item % debe ser mayor que cero', i;
    end if;
    if v_pct < 0 or v_pct > 100 then
      raise exception 'DATOS_INVALIDOS: el descuento del item % debe estar entre 0 y 100', i;
    end if;
    select tasa_impuesto into v_precio from articulos where id = v_art and deleted_at is null;
    if not found then raise exception 'E_REF: el articulo del item % no existe', i; end if;
    v_ids := v_ids || coalesce((v_it ->> 'id')::uuid, gen_random_uuid());
    v_arts := v_arts || v_art;
    v_cants := v_cants || v_cant;
    v_pcts := v_pcts || v_pct;
    v_tasas := v_tasas || v_precio;
  end loop;

  -- Cliente: existente o nuevo (misma lógica que tercero.crear)
  v_cliente := (v_ped ->> 'cliente_id')::uuid;
  if v_cliente is not null and v_nuevo is not null then
    raise exception 'DATOS_INVALIDOS: indique cliente_id o cliente_nuevo, no ambos';
  end if;
  if v_cliente is null and v_nuevo is null then
    raise exception 'DATOS_INVALIDOS: falta el cliente';
  end if;
  if v_cliente is not null then
    perform 1 from terceros where id = v_cliente and deleted_at is null;
    if not found then raise exception 'E_REF: el cliente no existe'; end if;
    perform 1 from terceros where id = v_cliente and es_cliente;
    if not found then raise exception 'DATOS_INVALIDOS: el tercero no es cliente'; end if;
  else
    if jsonb_typeof(v_nuevo) <> 'object' then
      raise exception 'DATOS_INVALIDOS: cliente_nuevo debe ser un objeto';
    end if;
    v_tercero := crear_tercero_desde_payload(
      v_nuevo || jsonb_build_object('es_cliente', true, 'es_proveedor', false));
    if coalesce((v_tercero ->> '_revision')::boolean, false) then
      return v_tercero;                       -- nada se escribió: aplicar_ops devuelve `revision`
    end if;
    v_cliente := (v_tercero ->> 'id')::uuid;
  end if;

  -- Precios del servidor (lista del cliente o pública, escalón por cantidad) y advertencias de precio
  for i in 1 .. v_n loop
    v_it := v_items -> (i - 1);
    v_lista := precio_para(v_arts[i], v_cliente, v_cants[i]);
    if v_lista is null then
      raise exception 'E_PRECIO: el articulo del item % no tiene precio en la lista del cliente ni en la publica', i - 1;
    end if;
    v_precio := round(v_lista * (1 - v_pcts[i] / 100), 2);
    v_env_lista := nullif(v_it ->> 'precio_lista', '')::numeric;
    v_env_unit := nullif(v_it ->> 'precio_unitario', '')::numeric;
    if v_env_lista is not null and abs(v_env_lista - v_lista) > 0.01 then
      v_adv := v_adv || jsonb_build_object('codigo', 'PRECIO_CAMBIO', 'item', i - 1, 'articulo_id', v_arts[i],
        'campo', 'precio_lista', 'precio_enviado', v_env_lista, 'precio_actual', v_lista);
    elsif v_env_unit is not null and abs(v_env_unit - v_precio) > 0.01 then
      v_adv := v_adv || jsonb_build_object('codigo', 'PRECIO_CAMBIO', 'item', i - 1, 'articulo_id', v_arts[i],
        'campo', 'precio_unitario', 'precio_enviado', v_env_unit, 'precio_actual', v_precio);
    end if;
    v_listas := v_listas || v_lista;
    v_unit := v_unit || v_precio;
  end loop;

  -- Advertencia de stock (se acepta igual, E5): suma por artículo contra lo disponible para prometer
  for i in 1 .. v_n loop
    if array_position(v_arts, v_arts[i]) = i then        -- primera aparición del artículo
      select coalesce(sum(c), 0) into v_req from unnest(v_arts, v_cants) as t(a, c) where a = v_arts[i];
      select coalesce(disponible_para_prometer, 0) into v_disp from v_stock where articulo_id = v_arts[i];
      if v_req > coalesce(v_disp, 0) then
        v_adv := v_adv || jsonb_build_object('codigo', 'STOCK', 'item', i - 1, 'articulo_id', v_arts[i],
          'requerido', v_req, 'disponible', coalesce(v_disp, 0));
      end if;
    end if;
  end loop;

  -- Escritura (estado `recibido`: sin reserva ni movimientos)
  insert into pedidos_venta (id, cliente_id, origen, estado, fecha, referencia_origen, fecha_entrega_estimada,
                             entrega_tipo, direccion_entrega, municipio_entrega, envio_cobrado, envio_costo,
                             descuento_valor, notas)
  values (v_pv_id, v_cliente, coalesce(nullif(v_ped ->> 'origen', ''), 'manual'), 'recibido', v_fecha,
          nullif(v_ped ->> 'referencia_origen', ''), nullif(v_ped ->> 'fecha_entrega_estimada', '')::date,
          coalesce(nullif(v_ped ->> 'entrega_tipo', ''), 'transportadora'),
          nullif(v_ped ->> 'direccion_entrega', ''), nullif(v_ped ->> 'municipio_entrega', ''),
          coalesce(nullif(v_ped ->> 'envio_cobrado', '')::numeric, 0),
          coalesce(nullif(v_ped ->> 'envio_costo', '')::numeric, 0),
          coalesce(nullif(v_ped ->> 'descuento_valor', '')::numeric, 0),
          nullif(v_ped ->> 'notas', ''));

  for i in 1 .. v_n loop
    insert into pedidos_venta_items (id, pedido_id, articulo_id, cantidad, precio_lista, descuento_pct,
                                     precio_unitario, tasa_impuesto)
    values (v_ids[i], v_pv_id, v_arts[i], v_cants[i], v_listas[i], v_pcts[i], v_unit[i], v_tasas[i]);
  end loop;

  select * into v_pv from pedidos_venta where id = v_pv_id;       -- totales calculados por los triggers
  if v_pv.descuento_valor > v_pv.subtotal then
    raise exception 'DATOS_INVALIDOS: el descuento (%) supera el subtotal (%)', v_pv.descuento_valor, v_pv.subtotal;
  end if;

  return jsonb_build_object('pedido_id', v_pv_id, 'cliente_id', v_cliente, 'estado', v_pv.estado,
                            'subtotal', v_pv.subtotal, 'impuestos', v_pv.impuestos, 'total', v_pv.total,
                            'item_ids', to_jsonb(v_ids), 'advertencias', v_adv);
end $$;

insert into tipos_op (tipo, funcion) values ('pedido_venta.crear', 'op_pedido_venta_crear');
