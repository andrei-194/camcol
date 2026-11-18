-- =====================================================================
-- Camino Col · Migración 0005: sync_pull simple (T-M1-08, CAM-38 · RF-SYN-08)
-- =====================================================================
-- Solo hacia adelante. Un solo cursor (updated_at) y un snapshot en una
-- respuesta (D-009): sin cursores por tabla ni has_more.
--
-- sync_pull(desde) -> jsonb
--   desde = null : snapshot inicial (catálogo, terceros, configuración, pedidos
--                  abiertos o finalizados en los últimos 90 días, compras abiertas
--                  o de los últimos 90 días).
--   desde = c    : solo lo que cambió después de c (updated_at > c), sin filtro de
--                  ventana: si un pedido viejo cambia, llega.
-- Los hijos viajan dentro del padre (pedido: items, pagos; compra: items,
-- recepciones con sus items, pagos). Un cambio en un ítem mueve el updated_at del
-- padre (touch_padre, 0002). Pagos no tocan al padre, así que se miran aparte.
-- El stock es derivado (v_stock): siempre va completo, sin cursor.
-- Borrado lógico: las filas con deleted_at viajan marcadas.
-- cursor = máximo updated_at devuelto (o el recibido si no hubo cambios).
-- SECURITY INVOKER: la RLS aplica; quien no es miembro recibe todo vacío.
-- =====================================================================

create or replace function sync_pull(desde timestamptz default null) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_ventana  timestamptz := now() - interval '90 days';
  v_prod jsonb; v_art jsonb; v_lis jsonb; v_pre jsonb; v_uni jsonb; v_ter jsonb; v_cfg jsonb;
  v_ped jsonb; v_oc jsonb; v_stock jsonb;
  m_prod timestamptz; m_art timestamptz; m_lis timestamptz; m_pre timestamptz; m_uni timestamptz;
  m_ter timestamptz; m_cfg timestamptz; m_ped timestamptz; m_oc timestamptz;
  v_cursor timestamptz;
begin
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'), max(t.updated_at) into v_prod, m_prod
    from productos t where desde is null or t.updated_at > desde;
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'), max(t.updated_at) into v_art, m_art
    from articulos t where desde is null or t.updated_at > desde;
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'), max(t.updated_at) into v_lis, m_lis
    from listas_precio t where desde is null or t.updated_at > desde;
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'), max(t.updated_at) into v_pre, m_pre
    from precios t where desde is null or t.updated_at > desde;
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'), max(t.updated_at) into v_uni, m_uni
    from unidades t where desde is null or t.updated_at > desde;
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'), max(t.updated_at) into v_ter, m_ter
    from terceros t where desde is null or t.updated_at > desde;
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'), max(t.updated_at) into v_cfg, m_cfg
    from configuracion t where desde is null or t.updated_at > desde;

  -- Pedidos de venta: cabecera + items + pagos (cobros)
  select coalesce(jsonb_agg((to_jsonb(p) - 'cambio_en') || jsonb_build_object(
           'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.id)
                                from pedidos_venta_items i where i.pedido_id = p.id), '[]'),
           'pagos', coalesce((select jsonb_agg(to_jsonb(g) order by g.fecha, g.id)
                                from pagos g where g.pedido_venta_id = p.id and g.direccion = 'cobro'), '[]')
         )), '[]'),
         max(p.cambio_en)
    into v_ped, m_ped
    from (select pv.*, greatest(pv.updated_at, (select max(g.updated_at) from pagos g
                                                 where g.pedido_venta_id = pv.id)) as cambio_en
            from pedidos_venta pv) p
   where case when desde is null
              then p.estado in ('recibido','confirmado') or p.finalizado_en >= v_ventana
              else p.cambio_en > desde end;

  -- Órdenes de compra: cabecera + items + recepciones (con sus items) + pagos
  select coalesce(jsonb_agg((to_jsonb(o) - 'cambio_en') || jsonb_build_object(
           'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.id)
                                from ordenes_compra_items i where i.orden_id = o.id), '[]'),
           'recepciones', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object(
                                 'items', coalesce((select jsonb_agg(to_jsonb(ri) order by ri.id)
                                                      from recepcion_items ri where ri.recepcion_id = r.id), '[]'))
                                 order by r.fecha, r.id)
                                from recepciones r where r.orden_id = o.id), '[]'),
           'pagos', coalesce((select jsonb_agg(to_jsonb(g) order by g.fecha, g.id)
                                from pagos g where g.orden_compra_id = o.id and g.direccion = 'pago'), '[]')
         )), '[]'),
         max(o.cambio_en)
    into v_oc, m_oc
    from (select oc.*, greatest(oc.updated_at, (select max(g.updated_at) from pagos g
                                                 where g.orden_compra_id = oc.id)) as cambio_en
            from ordenes_compra oc) o
   where case when desde is null
              then o.estado in ('borrador','pedida','recibida_parcial') or o.fecha >= v_ventana
              else o.cambio_en > desde end;

  -- Stock por artículo (derivado de movimientos; siempre completo)
  select coalesce(jsonb_agg((to_jsonb(s) - 'nombre') || jsonb_build_object('costo_promedio', a.costo_promedio)
                            order by s.articulo_id), '[]')
    into v_stock
    from v_stock s join articulos a on a.id = s.articulo_id;

  v_cursor := greatest(desde, m_prod, m_art, m_lis, m_pre, m_uni, m_ter, m_cfg, m_ped, m_oc);

  return jsonb_build_object(
    'server_time', now(),
    'cursor', to_char(v_cursor at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'catalogo', jsonb_build_object('productos', v_prod, 'articulos', v_art, 'listas_precio', v_lis,
                                   'precios', v_pre, 'unidades', v_uni),
    'terceros', v_ter,
    'configuracion', v_cfg,
    'stock', v_stock,
    'pedidos_venta', v_ped,
    'ordenes_compra', v_oc
  );
end $$;
