-- 0016 · CAM-95 (H-16, D-015): los movimientos de inventario que mueven costo o stock por una operación
-- (compra, venta, devoluciones) nacen solo de los triggers internos; a mano solo se admiten ajuste y merma.
-- Solo hacia adelante. Mismo patrón que 0013 (costo_promedio): trigger INVOKER con pg_trigger_depth(),
-- así que también vale para superusuario y PGlite. Un insert directo corre a profundidad 1; los de recepción
-- (recepcion_items), finalización y devolución (pedidos_venta) corren dentro de otro trigger (profundidad >= 2).

create or replace function trg_mov_solo_internos() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tipo not in ('ajuste','merma') and pg_trigger_depth() <= 1 then
    raise exception 'H-16: un movimiento % no se inserta a mano; nace de una recepción, finalización o devolución (a mano solo ajuste y merma)', new.tipo;
  end if;
  return new;
end $$;
create trigger mov_solo_internos before insert on movimientos_inventario
  for each row execute function trg_mov_solo_internos();

-- Los privilegios de la función nueva los fijan los default privileges de 0014 (CAM-92).
