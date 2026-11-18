-- 0011 · CAM-88 (H-02): un pedido finalizado/devuelto no se reescribe (RN-VEN-03, RN-COS-02, RN-PAG-01).
-- Solo hacia adelante. Triggers INVOKER; el flujo legítimo de finalizar no se ve afectado porque
-- en ese momento el padre aún está en 'confirmado' (BEFORE UPDATE de pedidos_venta).

-- 1) Cabecera: el dinero no cambia una vez finalizado/devuelto.
create or replace function trg_pv_candado() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.estado in ('finalizado','devuelto') and
     (new.descuento_valor, new.subtotal, new.impuestos, new.total, new.envio_cobrado, new.envio_costo)
     is distinct from
     (old.descuento_valor, old.subtotal, old.impuestos, old.total, old.envio_cobrado, old.envio_costo)
  then
    raise exception 'RN-VEN-03: un pedido % no se reescribe (dinero de la cabecera)', old.estado;
  end if;
  return new;
end $$;
create trigger pv_candado before update on pedidos_venta
  for each row execute function trg_pv_candado();

-- 2) Ítems: costo_unitario inmutable cuando el pedido ya está finalizado/devuelto.
--    (Al finalizar, el padre todavía se ve 'confirmado': trg_pv_estado puede fijarlo.)
create or replace function trg_pvi_candado() returns trigger
language plpgsql set search_path = public as $$
declare v_estado text;
begin
  if new.costo_unitario is distinct from old.costo_unitario then
    select estado into v_estado from pedidos_venta where id = old.pedido_id;
    if v_estado in ('finalizado','devuelto') then
      raise exception 'RN-COS-02: el costo de un pedido % no se modifica', v_estado;
    end if;
  end if;
  return new;
end $$;
create trigger pvi_candado before update on pedidos_venta_items
  for each row execute function trg_pvi_candado();

-- 3) Cobros: sin altas, cambios ni bajas sobre pedidos finalizados/devueltos.
create or replace function trg_pagos_candado() returns trigger
language plpgsql set search_path = public as $$
declare v_estado text; v_id uuid;
begin
  for v_id in select x from unnest(array[
      case when tg_op in ('UPDATE','DELETE') and old.direccion = 'cobro' then old.pedido_venta_id end,
      case when tg_op in ('INSERT','UPDATE') and new.direccion = 'cobro' then new.pedido_venta_id end]) x where x is not null loop
    select estado into v_estado from pedidos_venta where id = v_id;
    if v_estado in ('finalizado','devuelto') then
      raise exception 'RN-PAG-01: el pedido % ya está % y sus cobros no se modifican', v_id, v_estado;
    end if;
  end loop;
  return coalesce(new, old);
end $$;
create trigger pagos_candado before insert or update or delete on pagos
  for each row execute function trg_pagos_candado();

