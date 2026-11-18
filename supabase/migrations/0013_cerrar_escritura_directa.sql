-- 0013 · CAM-89 (H-03): cerrar la escritura directa (AGENTS regla 4; RN-DOC-01, RN-COS-01, RN-INV-03/04, RF-INV-03).
-- Solo hacia adelante. Todo por trigger (INVOKER) para que valga también para superusuario/PGlite.

-- 1) Los agregados nacen en su estado inicial; el resto lo hacen las transiciones.
create or replace function trg_pv_nace_recibido() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.estado <> 'recibido' or new.finalizado_en is not null then
    raise exception 'AGENTS-4: el pedido de venta nace en recibido (estado=%, finalizado_en=%)', new.estado, new.finalizado_en;
  end if;
  return new;
end $$;
create trigger pv_nace_recibido before insert on pedidos_venta
  for each row execute function trg_pv_nace_recibido();

create or replace function trg_oc_nace_borrador() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.estado <> 'borrador' then
    raise exception 'AGENTS-4: la orden de compra nace en borrador (estado=%)', new.estado;
  end if;
  return new;
end $$;
create trigger oc_nace_borrador before insert on ordenes_compra
  for each row execute function trg_oc_nace_borrador();

-- 2) Consecutivos: solo los incrementa emitir_documento (marca transaccional).
create or replace function trg_consecutivos_candado() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'RN-DOC-01: los consecutivos no se borran'; end if;
  if coalesce(current_setting('camino.emitiendo', true), '') <> '1' or new.ultimo <> old.ultimo + 1 then
    raise exception 'RN-DOC-01: los consecutivos solo avanzan de a uno al emitir un documento';
  end if;
  return new;
end $$;
create trigger consecutivos_candado before update or delete on consecutivos
  for each row execute function trg_consecutivos_candado();

-- emitir_documento: copia de 0001 con la marca transaccional alrededor del incremento (y search_path fijo, 0004).
create or replace function emitir_documento(p_tipo text, p_pedido uuid default null, p_orden uuid default null)
returns documentos language plpgsql set search_path = public as $$
declare d documentos; pv pedidos_venta; oc ordenes_compra;
        v_pref text; v_cons bigint; v_tercero jsonb; v_lineas jsonb; v_tot jsonb;
begin
  if p_tipo in ('confirmacion','remision','factura_interna') then
    if p_pedido is null then raise exception 'Falta el pedido'; end if;
    select * into pv from pedidos_venta where id = p_pedido;
    if not found then raise exception 'El pedido no existe'; end if;
    if p_tipo in ('remision','factura_interna') then
      if pv.estado <> 'finalizado' then
        raise exception 'Solo se emite % de pedidos finalizados', p_tipo;
      end if;
      if exists (select 1 from documentos where tipo = p_tipo and pedido_venta_id = p_pedido and anulado_en is null) then
        raise exception 'Ya existe un % vigente para este pedido', p_tipo;
      end if;
    end if;
    select jsonb_build_object('id', t.id, 'nombre', t.nombre, 'tipo_documento', t.tipo_documento,
             'numero_documento', t.numero_documento, 'telefono', t.telefono,
             'direccion', coalesce(pv.direccion_entrega, t.direccion),
             'municipio', coalesce(pv.municipio_entrega, t.municipio))
      into v_tercero from terceros t where t.id = pv.cliente_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'articulo_id', a.id, 'descripcion', a.nombre,
             'presentacion', a.presentacion_cantidad::text || ' ' || a.presentacion_unidad,
             'cantidad', i.cantidad, 'precio_lista', i.precio_lista, 'descuento_pct', i.descuento_pct,
             'precio_unitario', i.precio_unitario, 'tasa_impuesto', i.tasa_impuesto,
             'total_linea', round(i.cantidad * i.precio_unitario, 2)) order by a.nombre), '[]'::jsonb)
      into v_lineas
      from pedidos_venta_items i join articulos a on a.id = i.articulo_id where i.pedido_id = pv.id;
    v_tot := jsonb_build_object('subtotal', pv.subtotal, 'descuento', pv.descuento_valor,
                'impuestos', pv.impuestos, 'envio', pv.envio_cobrado, 'total', pv.total, 'moneda', 'COP');

  elsif p_tipo = 'comprobante_compra' then
    if p_orden is null then raise exception 'Falta la orden de compra'; end if;
    select * into oc from ordenes_compra where id = p_orden;
    if not found then raise exception 'La orden no existe'; end if;
    if oc.estado not in ('recibida_parcial','recibida') then
      raise exception 'Solo se emite comprobante de órdenes con mercancía recibida';
    end if;
    if exists (select 1 from documentos where tipo = p_tipo and orden_compra_id = p_orden and anulado_en is null) then
      raise exception 'Ya existe un comprobante vigente para esta orden';
    end if;
    select jsonb_build_object('id', t.id, 'nombre', t.nombre, 'tipo_documento', t.tipo_documento,
             'numero_documento', t.numero_documento, 'telefono', t.telefono,
             'municipio', t.municipio, 'vereda', t.vereda)
      into v_tercero from terceros t where t.id = oc.proveedor_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'articulo_id', a.id, 'descripcion', a.nombre,
             'presentacion', a.presentacion_cantidad::text || ' ' || a.presentacion_unidad,
             'cantidad', i.cantidad_recibida, 'costo_unitario', i.costo_unitario,
             'total_linea', round(i.cantidad_recibida * i.costo_unitario, 2)) order by a.nombre), '[]'::jsonb)
      into v_lineas
      from ordenes_compra_items i join articulos a on a.id = i.articulo_id
     where i.orden_id = oc.id and i.cantidad_recibida > 0;
    v_tot := jsonb_build_object('total',
               (select coalesce(sum(round(cantidad_recibida * costo_unitario, 2)), 0)
                  from ordenes_compra_items where orden_id = oc.id), 'moneda', 'COP');
  else
    raise exception 'Tipo de documento desconocido: %', p_tipo;
  end if;

  if p_tipo <> 'confirmacion' then
    perform set_config('camino.emitiendo', '1', true);
    update consecutivos set ultimo = ultimo + 1 where tipo = p_tipo returning prefijo, ultimo into v_pref, v_cons;
    perform set_config('camino.emitiendo', '', true);
  end if;

  insert into documentos (tipo, prefijo, consecutivo, pedido_venta_id, orden_compra_id, tercero, lineas, totales)
    values (p_tipo, v_pref, v_cons, p_pedido, p_orden, v_tercero, v_lineas, v_tot)
    returning * into d;
  return d;
end $$;

-- 3) costo_promedio solo lo mueve el libro de movimientos (trigger anidado, profundidad > 1).
create or replace function trg_art_costo_candado() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.costo_promedio is distinct from old.costo_promedio and pg_trigger_depth() <= 1 then
    raise exception 'RN-COS-01: el costo promedio no se edita; lo fijan las compras recibidas';
  end if;
  return new;
end $$;
create trigger art_costo_candado before update on articulos
  for each row execute function trg_art_costo_candado();

-- 4) Recepciones: no se borran (el stock no se reversa).
create or replace function trg_recepcion_no_borra() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'RN-INV-04: las recepciones no se borran; corrija con un movimiento de ajuste'; end $$;
create trigger recepciones_no_borra before delete on recepciones
  for each row execute function trg_recepcion_no_borra();
create trigger recepcion_items_no_borra before delete on recepcion_items
  for each row execute function trg_recepcion_no_borra();

-- 5) Pedido finalizado/devuelto no se archiva.
create or replace function trg_pv_no_archiva() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.deleted_at is distinct from old.deleted_at and old.estado in ('finalizado','devuelto') then
    raise exception 'RN-INV-03: un pedido % no se archiva', old.estado;
  end if;
  return new;
end $$;
create trigger pv_no_archiva before update on pedidos_venta
  for each row execute function trg_pv_no_archiva();

-- 6) Ajuste y merma exigen motivo.
create or replace function trg_mov_motivo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tipo in ('ajuste','merma') and btrim(coalesce(new.motivo, '')) = '' then
    raise exception 'RF-INV-03: un % exige motivo', new.tipo;
  end if;
  return new;
end $$;
create trigger mov_motivo before insert on movimientos_inventario
  for each row execute function trg_mov_motivo();

-- Los privilegios de las funciones nuevas los fijan los default privileges de 0014 (CAM-92).
