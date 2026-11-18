-- 0012 · CAM-90 (H-01, D-014): compra de apertura = inventario inicial con costo, no ajuste.
-- Solo hacia adelante.
-- 1) Nueva modalidad.
alter table ordenes_compra drop constraint ordenes_compra_modalidad_check;
alter table ordenes_compra add constraint ordenes_compra_modalidad_check
  check (modalidad in ('inmediata','encargo','apertura'));

-- 2) No es deuda: fuera de cuentas por pagar (misma definición de 0001 + filtro).
create or replace view v_cuentas_por_pagar with (security_invoker = true) as
select o.id as orden_id, o.proveedor_id, t.nombre as proveedor, o.total, o.fecha_vencimiento_pago,
       coalesce(sum(g.valor), 0) as pagado, o.total - coalesce(sum(g.valor), 0) as saldo
  from ordenes_compra o
  join terceros t on t.id = o.proveedor_id
  left join pagos g on g.orden_compra_id = o.id and g.direccion = 'pago'
 where o.estado in ('recibida_parcial','recibida') and o.deleted_at is null
   and o.modalidad <> 'apertura'
 group by o.id, t.nombre
having o.total - coalesce(sum(g.valor), 0) > 0;

-- 3) No es compra del periodo: resumen_periodo (copia de 0001 + filtro y search_path fijo).
create or replace function resumen_periodo(p_desde date, p_hasta date)
returns table (pedidos int, unidades numeric, ventas_lista numeric, descuentos numeric, ventas_netas numeric,
               envio_cobrado numeric, envio_costo numeric, costo_mercancia numeric,
               gastos numeric, utilidad_neta numeric, compras_periodo numeric)
language sql stable set search_path = public as $$
  with v as (
    select * from v_ventas_pedido where dia between p_desde and p_hasta
  ), g as (
    select coalesce(sum(valor), 0) as gastos from gastos
     where fecha between p_desde and p_hasta and deleted_at is null
  ), c as (
    select coalesce(sum(total), 0) as compras from ordenes_compra
     where estado in ('recibida_parcial','recibida') and deleted_at is null and modalidad <> 'apertura'
       and (fecha at time zone 'America/Bogota')::date between p_desde and p_hasta
  )
  select count(v.pedido_id)::int, coalesce(sum(v.unidades), 0), coalesce(sum(v.ventas_lista), 0),
         coalesce(sum(v.descuentos), 0), coalesce(sum(v.ventas_netas), 0),
         coalesce(sum(v.envio_cobrado), 0), coalesce(sum(v.envio_costo), 0), coalesce(sum(v.costo_mercancia), 0),
         (select gastos from g),
         coalesce(sum(v.utilidad_bruta), 0) - (select gastos from g),
         (select compras from c)
    from v;
$$;

-- 4) Una compra de apertura no admite pagos.
create or replace function trg_pagos_no_apertura() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.orden_compra_id is not null and
     exists (select 1 from ordenes_compra where id = new.orden_compra_id and modalidad = 'apertura') then
    raise exception 'RN-COM-04: una compra de apertura no admite pagos';
  end if;
  return new;
end $$;
create trigger pagos_no_apertura before insert or update on pagos
  for each row execute function trg_pagos_no_apertura();

-- 5) La modalidad no cambia una vez creada la orden (evita convertir una deuda en apertura o viceversa).
create or replace function trg_oc_modalidad_fija() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.modalidad is distinct from old.modalidad and (old.modalidad = 'apertura' or new.modalidad = 'apertura')
     and old.estado <> 'borrador' then
    raise exception 'RN-COM-04: no se cambia la modalidad de apertura de una orden ya pedida';
  end if;
  return new;
end $$;
create trigger oc_modalidad_fija before update on ordenes_compra
  for each row execute function trg_oc_modalidad_fija();

-- 6) op orden_compra.registrar (0008) acepta modalidad `apertura` (RN-COM-04): recepción TOTAL obligatoria,
--    sin pagos (E_PAGO) y proveedor genérico «Inventario inicial» (existente o por `proveedor_nuevo`).
--    Se reemplaza con create or replace; 0008 no se edita.
create or replace function op_orden_compra_registrar(p jsonb) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_orden       jsonb := p -> 'orden';
  v_items       jsonb := p -> 'items';
  v_rec         jsonb := nullif(p -> 'recepcion', 'null'::jsonb);
  v_pagos       jsonb := coalesce(nullif(p -> 'pagos', 'null'::jsonb), '[]'::jsonb);
  v_prov_nuevo  jsonb := nullif(p -> 'proveedor_nuevo', 'null'::jsonb);
  v_modalidades text[] := array['inmediata', 'encargo', 'apertura'];
  v_modalidad   text;
  v_oc_id       uuid;
  v_prov        uuid;
  v_tercero     jsonb;
  v_fecha       timestamptz;
  v_limite      timestamptz := now() + interval '1 day';
  v_it          jsonb;
  v_n           int;
  i             int;
  v_ids         uuid[] := '{}';       -- ids de ítems de la orden, en orden
  v_cants       numeric[] := '{}';
  v_art         uuid;
  v_cant        numeric;
  v_costo       numeric;
  v_ref_ids     uuid[] := '{}';       -- recepción: ítem de la orden al que apunta cada fila
  v_ref_cants   numeric[] := '{}';
  v_oi          uuid;
  v_idx         int;
  v_rec_id      uuid;
  v_rec_fecha   timestamptz;
  v_sum         numeric;
  v_total       numeric;
  v_pagado      numeric := 0;
  v_pago_ids    uuid[] := '{}';
  v_pg          jsonb;
  v_pg_id       uuid;
  v_valor       numeric;
  v_pagador     uuid;
  v_pfecha      timestamptz;
  v_estado      text;
begin
  if v_orden is null or jsonb_typeof(v_orden) <> 'object' then
    raise exception 'DATOS_INVALIDOS: falta el objeto orden';
  end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'DATOS_INVALIDOS: la orden necesita al menos un item';
  end if;
  if jsonb_typeof(v_pagos) <> 'array' then
    raise exception 'DATOS_INVALIDOS: pagos debe ser un arreglo';
  end if;

  v_modalidad := coalesce(nullif(v_orden ->> 'modalidad', ''), 'inmediata');
  if not (v_modalidad = any (v_modalidades)) then
    raise exception 'DATOS_INVALIDOS: modalidad desconocida: %', v_modalidad;
  end if;
  if v_modalidad = 'apertura' and jsonb_array_length(v_pagos) > 0 then
    raise exception 'E_PAGO: una compra de apertura no admite pagos (RN-COM-04)';
  end if;
  if coalesce(nullif(v_orden ->> 'condicion_pago', ''), 'contado') <> 'contado' then
    raise exception 'DATOS_INVALIDOS: toda compra es de contado (D-005)';
  end if;

  v_fecha := coalesce(nullif(v_orden ->> 'fecha', '')::timestamptz, now());
  if v_fecha > v_limite then
    raise exception 'E_FECHA: la fecha de la compra no puede ser futura';
  end if;

  v_oc_id := coalesce((v_orden ->> 'id')::uuid, gen_random_uuid());

  -- Ítems: validar (sin escribir todavía)
  v_n := jsonb_array_length(v_items);
  for i in 0 .. v_n - 1 loop
    v_it := v_items -> i;
    if jsonb_typeof(v_it) <> 'object' then
      raise exception 'DATOS_INVALIDOS: item % mal formado', i;
    end if;
    v_art := (v_it ->> 'articulo_id')::uuid;
    v_cant := (v_it ->> 'cantidad')::numeric;
    v_costo := (v_it ->> 'costo_unitario')::numeric;
    if v_art is null or v_cant is null or v_costo is null then
      raise exception 'DATOS_INVALIDOS: item % requiere articulo_id, cantidad y costo_unitario', i;
    end if;
    if v_cant <= 0 then
      raise exception 'DATOS_INVALIDOS: la cantidad del item % debe ser mayor que cero', i;
    end if;
    if v_costo < 0 then
      raise exception 'DATOS_INVALIDOS: el costo del item % no puede ser negativo', i;
    end if;
    perform 1 from articulos where id = v_art and deleted_at is null;
    if not found then raise exception 'E_REF: el articulo del item % no existe', i; end if;
    v_ids := v_ids || coalesce((v_it ->> 'id')::uuid, gen_random_uuid());
    v_cants := v_cants || v_cant;
  end loop;

  -- Recepción: resolver a qué ítem apunta cada fila y validar (sin escribir todavía)
  if v_rec is not null then
    if jsonb_typeof(v_rec) <> 'object' or jsonb_typeof(v_rec -> 'items') is distinct from 'array'
       or jsonb_array_length(v_rec -> 'items') = 0 then
      raise exception 'DATOS_INVALIDOS: la recepcion necesita items';
    end if;
    v_rec_fecha := coalesce(nullif(v_rec ->> 'fecha', '')::timestamptz, v_fecha);
    if v_rec_fecha > v_limite then
      raise exception 'E_FECHA: la fecha de la recepcion no puede ser futura';
    end if;
    for i in 0 .. jsonb_array_length(v_rec -> 'items') - 1 loop
      v_it := (v_rec -> 'items') -> i;
      v_cant := (v_it ->> 'cantidad')::numeric;
      if v_cant is null or v_cant <= 0 then
        raise exception 'DATOS_INVALIDOS: la cantidad recibida del item % debe ser mayor que cero', i;
      end if;
      -- El ítem se indica por su id (orden_item_id) o por su posición (item, base 0)
      if v_it ->> 'orden_item_id' is not null then
        v_oi := (v_it ->> 'orden_item_id')::uuid;
        v_idx := array_position(v_ids, v_oi);
      elsif v_it ->> 'item' is not null then
        v_idx := (v_it ->> 'item')::int + 1;
        if v_idx < 1 or v_idx > v_n then v_idx := null; end if;
      else
        raise exception 'DATOS_INVALIDOS: la fila % de la recepcion no indica el item', i;
      end if;
      if v_idx is null then
        raise exception 'E_REF: la fila % de la recepcion apunta a un item que no es de esta orden', i;
      end if;
      -- Vencimiento obligatorio si el artículo lo controla (RN-COM-02)
      if (select controla_vencimiento from articulos
           where id = ((v_items -> (v_idx - 1)) ->> 'articulo_id')::uuid)
         and nullif(v_it ->> 'fecha_vencimiento', '') is null then
        raise exception 'E_VENCIMIENTO: el articulo de la fila % exige fecha de vencimiento', i;
      end if;
      v_ref_ids := v_ref_ids || v_ids[v_idx];
      v_ref_cants := v_ref_cants || v_cant;
    end loop;
    -- RN-COM-01: no se recibe más de lo pedido
    for i in 1 .. v_n loop
      select coalesce(sum(c), 0) into v_sum from unnest(v_ref_ids, v_ref_cants) as t(it, c) where it = v_ids[i];
      if v_sum > v_cants[i] then
        raise exception 'E_SOBRE_RECEPCION: item % pedido %, recepcion %', i - 1, v_cants[i], v_sum;
      end if;
      if v_modalidad in ('inmediata', 'apertura') and v_sum < v_cants[i] then
        raise exception 'E_RECEPCION: la compra inmediata o de apertura exige recibir todo (item % pedido %, recibido %)',
          i - 1, v_cants[i], v_sum;
      end if;
    end loop;
  elsif v_modalidad in ('inmediata', 'apertura') then
    raise exception 'E_RECEPCION: la compra inmediata o de apertura exige la recepcion';
  end if;

  -- Pagos: validar cada uno (la suma contra el total se verifica abajo)
  for i in 0 .. jsonb_array_length(v_pagos) - 1 loop
    v_pg := v_pagos -> i;
    v_valor := (v_pg ->> 'valor')::numeric;
    if v_valor is null or v_valor <= 0 then
      raise exception 'DATOS_INVALIDOS: el valor del pago % debe ser mayor que cero', i;
    end if;
    v_pfecha := coalesce(nullif(v_pg ->> 'fecha', '')::timestamptz, v_fecha);
    if v_pfecha > v_limite then
      raise exception 'E_FECHA: la fecha del pago % no puede ser futura', i;
    end if;
    v_pagador := (v_pg ->> 'pagado_por')::uuid;
    if v_pagador is not null then
      perform 1 from miembros where user_id = v_pagador;
      if not found then raise exception 'E_REF: el socio que pago no existe'; end if;
    end if;
    v_pagado := v_pagado + v_valor;
  end loop;

  -- Proveedor: existente o nuevo (misma lógica que tercero.crear)
  v_prov := (v_orden ->> 'proveedor_id')::uuid;
  if v_prov is not null and v_prov_nuevo is not null then
    raise exception 'DATOS_INVALIDOS: indique proveedor_id o proveedor_nuevo, no ambos';
  end if;
  if v_prov is null and v_prov_nuevo is null then
    raise exception 'DATOS_INVALIDOS: falta el proveedor';
  end if;
  if v_prov is not null then
    perform 1 from terceros where id = v_prov and deleted_at is null;
    if not found then raise exception 'E_REF: el proveedor no existe'; end if;
  else
    if jsonb_typeof(v_prov_nuevo) <> 'object' then
      raise exception 'DATOS_INVALIDOS: proveedor_nuevo debe ser un objeto';
    end if;
    v_tercero := crear_tercero_desde_payload(
      v_prov_nuevo || jsonb_build_object('es_proveedor', true, 'es_cliente', false));
    if coalesce((v_tercero ->> '_revision')::boolean, false) then
      return v_tercero;                       -- nada se escribió: aplicar_ops devuelve `revision`
    end if;
    v_prov := (v_tercero ->> 'id')::uuid;
  end if;

  -- Escritura
  insert into ordenes_compra (id, proveedor_id, modalidad, estado, fecha, fecha_esperada, condicion_pago, notas)
  values (v_oc_id, v_prov, v_modalidad, 'borrador', v_fecha, nullif(v_orden ->> 'fecha_esperada', '')::date,
          'contado', nullif(v_orden ->> 'notas', ''));

  for i in 1 .. v_n loop
    v_it := v_items -> (i - 1);
    insert into ordenes_compra_items (id, orden_id, articulo_id, cantidad, costo_unitario, unidad_origen, cantidad_origen)
    values (v_ids[i], v_oc_id, (v_it ->> 'articulo_id')::uuid, v_cants[i], (v_it ->> 'costo_unitario')::numeric,
            nullif(v_it ->> 'unidad_origen', ''), (v_it ->> 'cantidad_origen')::numeric);
  end loop;

  select total into v_total from ordenes_compra where id = v_oc_id;     -- lo calcula el trigger
  if v_modalidad = 'inmediata' and v_pagado <> v_total then
    raise exception 'E_PAGO: la compra inmediata se paga completa (total %, pagos %)', v_total, v_pagado;
  end if;
  if v_pagado > v_total then
    raise exception 'E_PAGO: los pagos (%) superan el total (%)', v_pagado, v_total;
  end if;

  update ordenes_compra set estado = 'pedida' where id = v_oc_id;

  if v_rec is not null then
    v_rec_id := coalesce((v_rec ->> 'id')::uuid, gen_random_uuid());
    insert into recepciones (id, orden_id, fecha, notas)
    values (v_rec_id, v_oc_id, v_rec_fecha, nullif(v_rec ->> 'notas', ''));
    for i in 0 .. jsonb_array_length(v_rec -> 'items') - 1 loop
      v_it := (v_rec -> 'items') -> i;
      insert into recepcion_items (id, recepcion_id, orden_item_id, cantidad, lote_codigo, fecha_vencimiento)
      values (coalesce((v_it ->> 'id')::uuid, gen_random_uuid()), v_rec_id, v_ref_ids[i + 1], v_ref_cants[i + 1],
              nullif(v_it ->> 'lote_codigo', ''), nullif(v_it ->> 'fecha_vencimiento', '')::date);
    end loop;
  end if;

  for i in 0 .. jsonb_array_length(v_pagos) - 1 loop
    v_pg := v_pagos -> i;
    v_pg_id := coalesce((v_pg ->> 'id')::uuid, gen_random_uuid());
    insert into pagos (id, direccion, orden_compra_id, medio, valor, fecha, referencia, pagado_por)
    values (v_pg_id, 'pago', v_oc_id, v_pg ->> 'medio', (v_pg ->> 'valor')::numeric,
            coalesce(nullif(v_pg ->> 'fecha', '')::timestamptz, v_fecha),
            nullif(v_pg ->> 'referencia', ''), (v_pg ->> 'pagado_por')::uuid);
    v_pago_ids := v_pago_ids || v_pg_id;
  end loop;

  select estado into v_estado from ordenes_compra where id = v_oc_id;
  return jsonb_build_object('orden_id', v_oc_id, 'proveedor_id', v_prov, 'estado', v_estado,
                            'total', v_total, 'item_ids', to_jsonb(v_ids),
                            'recepcion_id', v_rec_id, 'pago_ids', to_jsonb(v_pago_ids));
end $$;
