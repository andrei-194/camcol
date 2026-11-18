-- =====================================================================
-- Camino Col · Migración 0015: validaciones del servidor (T-M1-15, CAM-94; hallazgos H-05, H-07, H-08; D-015)
-- =====================================================================
-- Solo hacia adelante. El servidor decide (regla 3): la app avisará antes, pero aquí se rechaza.
-- Todo son triggers INVOKER con search_path fijo: valen para cualquier ruta de escritura (op, RPC o SQL).
-- No se conceden privilegios: las funciones nuevas heredan los default privileges de 0014.
--
-- 1) RF-VEN-03 / H-05. Al finalizar, el descuento no supera el subtotal y el total no es negativo.
--    (`pedido_venta.crear` ya rechaza el descuento mayor que el subtotal desde 0010; esto cubre el
--    camino de editar el pedido abierto y finalizarlo sin nada que cobrar.)
-- 2) RF-VEN-05 / H-07. Pasar a `cancelado` o `devuelto` exige motivo (no vacío). Finalizar con entrega
--    `transportadora` exige `envio_costo` > 0 (0 es el valor por defecto de la columna: significa "sin dato").
-- 3) RN-DOC-02, RF-DOC-04 / H-07. Anular un documento exige motivo también por UPDATE directo, y el
--    motivo de una anulación no se cambia después.
-- 4) H-08. Una sola vía para el costo del flete de una venta: `pedidos_venta.envio_costo` (alimenta
--    la utilidad bruta, RN-COS-03). Un gasto vinculado a un pedido de venta no puede ser de categoría
--    flete/envío/transporte/transportadora (contaría el flete dos veces). Un flete de compra
--    (vinculado a una orden de compra) o un gasto suelto no se ven afectados.
-- Ya cubiertos antes y solo se prueban de nuevo: ajuste y merma exigen motivo (0013, RF-INV-03).
-- =====================================================================

-- 1) y 2) Validaciones al cambiar de estado. Nombre `pv_a_validar` para correr antes que `pv_estado`
--    (que borra motivo_estado) y que `pv_totales` (por eso el total se calcula aquí con los valores nuevos).
create or replace function trg_pv_validar() returns trigger
language plpgsql set search_path = public as $$
declare v_total numeric;
begin
  if new.estado is not distinct from old.estado then return new; end if;

  if new.estado in ('cancelado', 'devuelto') and btrim(coalesce(new.motivo_estado, '')) = '' then
    raise exception 'RF-VEN-05: pasar a % exige motivo', new.estado;
  end if;

  if new.estado = 'finalizado' then
    v_total := new.subtotal - new.descuento_valor + new.impuestos + new.envio_cobrado;
    if new.descuento_valor > new.subtotal then
      raise exception 'RF-VEN-03: el descuento (%) supera el subtotal (%)', new.descuento_valor, new.subtotal;
    end if;
    if v_total < 0 then
      raise exception 'RF-VEN-03: el total del pedido no puede ser negativo (%)', v_total;
    end if;
    if new.entrega_tipo = 'transportadora' and coalesce(new.envio_costo, 0) <= 0 then
      raise exception 'RF-VEN-05: finalizar con transportadora exige envio_costo (mayor que cero)';
    end if;
  end if;
  return new;
end $$;
create trigger pv_a_validar before update of estado on pedidos_venta
  for each row execute function trg_pv_validar();

-- 3) Anulación de documentos con motivo
create or replace function trg_doc_motivo() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.anulado_en is null and new.anulado_en is not null
     and btrim(coalesce(new.motivo_anulacion, '')) = '' then
    raise exception 'RN-DOC-02: anular un documento exige motivo';
  end if;
  if old.anulado_en is not null and new.motivo_anulacion is distinct from old.motivo_anulacion then
    raise exception 'RN-DOC-02: el motivo de una anulación no se modifica';
  end if;
  return new;
end $$;
create trigger documentos_a_motivo before update on documentos
  for each row execute function trg_doc_motivo();

-- 4) Flete: una sola vía (envio_costo del pedido)
create or replace function trg_gasto_flete_unico() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.pedido_venta_id is not null
     and translate(lower(btrim(new.categoria)), 'áéíóú', 'aeiou')
         in ('flete', 'fletes', 'envio', 'envios', 'transporte', 'transportadora') then
    raise exception 'E_FLETE: el costo del flete de una venta va en el envio_costo del pedido, no como gasto vinculado';
  end if;
  return new;
end $$;
create trigger gastos_flete_unico before insert or update of categoria, pedido_venta_id on gastos
  for each row execute function trg_gasto_flete_unico();
