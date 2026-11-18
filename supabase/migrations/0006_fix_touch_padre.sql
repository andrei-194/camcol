-- 0006 · CAM-86: finalizar un pedido fallaba con 0002 aplicada.
-- trg_pv_estado (BEFORE UPDATE de pedidos_venta) fija costo_unitario en los ítems; el touch de
-- cada ítem intentaba entonces actualizar el pedido que ya se estaba modificando en el mismo
-- comando ("tuple to be updated was already modified by an operation triggered by the current command").
-- Si en un ítem de pedido solo cambió costo_unitario, el pedido se está actualizando por su propio
-- trigger: no hace falta tocarlo (su updated_at ya lo fija set_updated_at).

create or replace function touch_padre() returns trigger
language plpgsql set search_path = public as $$
declare v_padre uuid := (to_jsonb(coalesce(new, old)) ->> tg_argv[1])::uuid;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'pedidos_venta_items'
     and (to_jsonb(new) - 'costo_unitario' - 'updated_at') = (to_jsonb(old) - 'costo_unitario' - 'updated_at') then
    return null;
  end if;
  execute format('update %I set updated_at = now() where id = $1', tg_argv[0]) using v_padre;
  return null;
end $$;
