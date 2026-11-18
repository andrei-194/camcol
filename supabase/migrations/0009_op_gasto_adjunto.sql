-- =====================================================================
-- Camino Col · Migración 0009: ops gasto.registrar y adjunto.vincular (T-M1-07, CAM-37)
-- =====================================================================
-- Solo hacia adelante. Registra dos tipos en aplicar_ops (0003). Ambas funcionan sin señal (D-009).
--   * gasto.registrar (RF-PAG-03): categoría, concepto, valor entero en COP (> 0), fecha
--     (por defecto hoy en Bogotá), vínculos opcionales a OC, PV y socio que pagó.
--   * adjunto.vincular (RF-SYN-09): vincula un archivo ya subido a Storage (`soportes`) con una
--     entidad existente. Idempotente por `adjuntos.op_id`.
-- SECURITY INVOKER: la RLS aplica (solo miembros). search_path fijo.
-- =====================================================================

create or replace function op_gasto_registrar(p jsonb) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_id        uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_cat       text := btrim(coalesce(p ->> 'categoria', ''));
  v_concepto  text := nullif(btrim(coalesce(p ->> 'concepto', '')), '');
  v_valor     numeric;
  v_fecha     date;
  v_oc        uuid := (p ->> 'orden_compra_id')::uuid;
  v_pv        uuid := (p ->> 'pedido_venta_id')::uuid;
  v_pagado    uuid := (p ->> 'pagado_por')::uuid;
  v_hoy       date := (now() at time zone 'America/Bogota')::date;
begin
  if v_cat = '' then
    raise exception 'DATOS_INVALIDOS: la categoria es obligatoria';
  end if;

  if p ->> 'valor' is null then
    raise exception 'DATOS_INVALIDOS: el valor es obligatorio';
  end if;
  begin
    v_valor := (p ->> 'valor')::numeric;
  exception when others then
    raise exception 'DATOS_INVALIDOS: el valor debe ser numerico';
  end;
  if v_valor <= 0 then
    raise exception 'DATOS_INVALIDOS: el valor debe ser mayor que cero';
  end if;
  if v_valor <> trunc(v_valor) then
    raise exception 'DATOS_INVALIDOS: el valor es en COP sin decimales';
  end if;

  if nullif(p ->> 'fecha', '') is null then
    v_fecha := v_hoy;
  else
    begin
      v_fecha := (p ->> 'fecha')::date;
    exception when others then
      raise exception 'DATOS_INVALIDOS: fecha invalida (use AAAA-MM-DD)';
    end;
    -- RNF de fechas del cliente: se acepta hasta mañana (desfase de reloj/zona).
    if v_fecha > v_hoy + 1 then
      raise exception 'E_FECHA: la fecha del gasto no puede ser futura';
    end if;
  end if;

  if v_oc is not null then
    perform 1 from ordenes_compra where id = v_oc and deleted_at is null;
    if not found then raise exception 'E_REF: la orden de compra no existe'; end if;
  end if;
  if v_pv is not null then
    perform 1 from pedidos_venta where id = v_pv and deleted_at is null;
    if not found then raise exception 'E_REF: el pedido de venta no existe'; end if;
  end if;
  if v_pagado is not null then
    perform 1 from miembros where user_id = v_pagado;
    if not found then raise exception 'E_REF: el socio que pago no existe'; end if;
  end if;

  -- La idempotencia la da sync_ops (aplicar_ops); el manejador no recibe el op_id, así que
  -- gastos.op_id queda nulo. Un `id` repetido con otro op_id choca con la PK (E_DUPLICADO).
  insert into gastos (id, fecha, categoria, concepto, valor, orden_compra_id, pedido_venta_id, pagado_por)
  values (v_id, v_fecha, v_cat, v_concepto, v_valor, v_oc, v_pv, v_pagado);

  return jsonb_build_object('id', v_id, 'fecha', v_fecha, 'categoria', v_cat, 'concepto', v_concepto,
                            'valor', v_valor, 'orden_compra_id', v_oc, 'pedido_venta_id', v_pv,
                            'pagado_por', v_pagado);
end $$;

create or replace function op_adjunto_vincular(p jsonb) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_id        uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_entidad   text := p ->> 'entidad';
  v_ent_id    uuid := (p ->> 'entidad_id')::uuid;
  v_path      text := btrim(coalesce(p ->> 'path', ''));
  v_mime      text := nullif(btrim(coalesce(p ->> 'mime', '')), '');
  v_existe    boolean;
begin
  if v_entidad is null or v_entidad not in ('pago', 'gasto', 'recepcion', 'orden_compra', 'tercero') then
    raise exception 'DATOS_INVALIDOS: entidad desconocida: %', coalesce(v_entidad, '(vacia)');
  end if;
  if v_ent_id is null then
    raise exception 'DATOS_INVALIDOS: falta entidad_id';
  end if;
  if v_path = '' then
    raise exception 'DATOS_INVALIDOS: falta path';
  end if;

  v_existe := case v_entidad
    when 'pago'         then exists (select 1 from pagos where id = v_ent_id)
    when 'gasto'        then exists (select 1 from gastos where id = v_ent_id and deleted_at is null)
    when 'recepcion'    then exists (select 1 from recepciones where id = v_ent_id)
    when 'orden_compra' then exists (select 1 from ordenes_compra where id = v_ent_id and deleted_at is null)
    when 'tercero'      then exists (select 1 from terceros where id = v_ent_id and deleted_at is null)
  end;
  if not v_existe then
    raise exception 'E_REF: la entidad % no existe', v_entidad;
  end if;

  insert into adjuntos (id, entidad, entidad_id, path, mime)
  values (v_id, v_entidad, v_ent_id, v_path, v_mime);

  return jsonb_build_object('id', v_id, 'entidad', v_entidad, 'entidad_id', v_ent_id, 'path', v_path);
end $$;

insert into tipos_op (tipo, funcion) values
  ('gasto.registrar', 'op_gasto_registrar'),
  ('adjunto.vincular', 'op_adjunto_vincular');
