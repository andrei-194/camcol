-- =====================================================================
-- Camino Col · Migración 0017: reembolsos y control de sobrepago (T-M1-18, CAM-97 · H-06, D-015)
-- =====================================================================
-- Solo hacia adelante: no se edita 0001 ni ninguna migración previa.
-- Cierra RF-PAG-04/05/06, RN-PAG-02..07, [E16], [E17], [E18] (SPEC) y el contrato `pago.reembolsar` (PLAN §4.3).
--   1. `pagos.direccion` admite 'reembolso'; columna `motivo`; CHECK con nombre.
--   2. Triggers de `pagos`: inmutabilidad y tope del reembolso (RN-PAG-03/04/05) y control de sobrepago de
--      cobros (RN-PAG-02). Valen para cualquier ruta (op, RPC, SQL directo). Postgres dispara los BEFORE por
--      orden alfabético: pagos_candado (0011) < pagos_reembolso_candado < pagos_sobrepago.
--      Ambos toman primero `select ... from pedidos_venta ... for update`: dos cobros o reembolsos
--      simultáneos no se suman por encima del tope (se prueba con dos conexiones en tests/integration).
--   3. `pv_totales` rechaza con E_TOTAL dejar `total < cobrado neto`.
--   4. Op `pago.reembolsar` (solo con conexión, D-009), vista `v_por_reembolsar`, `resumen_periodo` con la
--      columna `reembolsos` y `sync_pull` con los reembolsos dentro del arreglo `pagos` de cada pedido.
-- El ID de la regla (RN-PAG-nn) va dentro del mensaje, no como prefijo: aplicar_ops solo reconoce como código
-- lo que cumple ^[A-Z][A-Z0-9_]*:. Los privilegios de las funciones nuevas los fijan los default privileges de 0014.
-- =====================================================================

-- 1) CHECK de pagos. Los de 0001 son anónimos: se buscan por definición (contype 'c' que mencione `direccion`).
alter table pagos add column motivo text;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.pagos'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%direccion%' loop
    execute format('alter table pagos drop constraint %I', c.conname);
  end loop;
end $$;

alter table pagos
  add constraint pagos_direccion_chk check (direccion in ('cobro','pago','reembolso')),
  add constraint pagos_ligadura_chk check (
    (direccion in ('cobro','reembolso') and pedido_venta_id is not null and orden_compra_id is null) or
    (direccion = 'pago'                 and orden_compra_id is not null and pedido_venta_id is null)),
  add constraint pagos_motivo_chk check (direccion <> 'reembolso' or btrim(coalesce(motivo, '')) <> '');

-- 2) Reembolsos: tope e inmutabilidad (RN-PAG-03/04/05).
create or replace function trg_pagos_reembolso_candado() returns trigger
language plpgsql set search_path = public as $$
declare v_estado text; v_neto numeric;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.direccion = 'reembolso' or (tg_op = 'UPDATE' and new.direccion = 'reembolso') then
      raise exception 'E_PAGO_INMUTABLE: un reembolso no se edita ni se borra (RN-PAG-05)';
    end if;
    return coalesce(new, old);
  end if;

  if new.direccion <> 'reembolso' then return new; end if;

  select estado into v_estado from pedidos_venta where id = new.pedido_venta_id for update;
  if not found then return new; end if;          -- la FK y pagos_ligadura_chk lo rechazan
  if v_estado not in ('cancelado', 'devuelto') then
    raise exception 'E_ESTADO: solo se reembolsa un pedido cancelado o devuelto, no uno %  (RN-PAG-03)', v_estado;
  end if;
  if btrim(coalesce(new.motivo, '')) = '' then
    raise exception 'DATOS_INVALIDOS: el reembolso exige motivo (RN-PAG-05)';
  end if;
  select coalesce(sum(valor) filter (where direccion = 'cobro'), 0)
       - coalesce(sum(valor) filter (where direccion = 'reembolso'), 0)
    into v_neto from pagos where pedido_venta_id = new.pedido_venta_id;
  if new.valor > v_neto then
    raise exception 'E_SOBREPAGO: el reembolso (%) supera lo cobrado neto (%) (RN-PAG-04)', new.valor, v_neto;
  end if;
  return new;
end $$;
create trigger pagos_reembolso_candado before insert or update or delete on pagos
  for each row execute function trg_pagos_reembolso_candado();

-- 3) Cobros: sobrepago y estados (RN-PAG-02). 'finalizado'/'devuelto' los frena antes pagos_candado (0011).
create or replace function trg_pagos_sobrepago() returns trigger
language plpgsql set search_path = public as $$
declare v_estado text; v_total numeric; v_neto numeric;
begin
  -- baja o cambio de un cobro existente: no en un PV cancelado/devuelto (dejaría fuera 0 <= neto <= total)
  if tg_op in ('UPDATE', 'DELETE') and old.direccion = 'cobro' then
    select estado into v_estado from pedidos_venta where id = old.pedido_venta_id for update;
    if v_estado in ('cancelado', 'devuelto') then
      raise exception 'E_ESTADO: los cobros de un pedido % no se editan ni se borran (RN-PAG-02)', v_estado;
    end if;
  end if;
  if tg_op = 'DELETE' or new.direccion <> 'cobro' then return coalesce(new, old); end if;

  select estado, total into v_estado, v_total from pedidos_venta where id = new.pedido_venta_id for update;
  if not found then return new; end if;
  if v_estado = 'cancelado' then
    raise exception 'E_ESTADO: no se registran cobros en un pedido cancelado (RN-PAG-02)';
  end if;
  if v_estado in ('recibido', 'confirmado') then
    select coalesce(sum(valor) filter (where direccion = 'cobro'), 0)
         - coalesce(sum(valor) filter (where direccion = 'reembolso'), 0)
      into v_neto from pagos
     where pedido_venta_id = new.pedido_venta_id and (tg_op = 'INSERT' or id <> old.id);
    if v_neto + new.valor > v_total then
      raise exception 'E_SOBREPAGO: el cobro (%) deja lo cobrado neto por encima del total (%) (RN-PAG-02)', new.valor, v_total;
    end if;
  end if;
  return new;
end $$;
create trigger pagos_sobrepago before insert or update or delete on pagos
  for each row execute function trg_pagos_sobrepago();

-- 4) pv_totales (0001) + regla E_TOTAL: el total no baja del cobrado neto (RN-PAG-02).
create or replace function trg_pv_totales() returns trigger language plpgsql set search_path = public as $$
declare v_neto numeric;
begin
  new.total := new.subtotal - new.descuento_valor + new.impuestos + new.envio_cobrado;
  if tg_op = 'UPDATE' and new.total is distinct from old.total then
    select coalesce(sum(valor) filter (where direccion = 'cobro'), 0)
         - coalesce(sum(valor) filter (where direccion = 'reembolso'), 0)
      into v_neto from pagos where pedido_venta_id = new.id;
    if new.total < v_neto then
      raise exception 'E_TOTAL: el total (%) no puede quedar por debajo de lo cobrado neto (%) (RN-PAG-02)', new.total, v_neto;
    end if;
  end if;
  return new;
end $$;

-- 5) Op pago.reembolsar (PLAN §4.3). Solo con conexión: la PWA no la encola (D-009).
create or replace function op_pago_reembolsar(p jsonb) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_id      uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_pedido  uuid := (p ->> 'pedido_id')::uuid;
  v_valor   numeric;
  v_medio   text := p ->> 'medio';
  v_motivo  text := btrim(coalesce(p ->> 'motivo', ''));
  v_ref     text := nullif(btrim(coalesce(p ->> 'referencia', '')), '');
  v_pagado  uuid := (p ->> 'pagado_por')::uuid;
  v_fecha   timestamptz := now();
  v_dia     date;
  v_hoy     date := (now() at time zone 'America/Bogota')::date;
  v_estado  text;
  v_neto    numeric;
begin
  if v_pedido is null then raise exception 'DATOS_INVALIDOS: pedido_id es obligatorio'; end if;
  if p ->> 'valor' is null then raise exception 'DATOS_INVALIDOS: el valor es obligatorio'; end if;
  begin
    v_valor := (p ->> 'valor')::numeric;
  exception when others then
    raise exception 'DATOS_INVALIDOS: el valor debe ser numerico';
  end;
  if v_valor <= 0 then raise exception 'DATOS_INVALIDOS: el valor debe ser mayor que cero'; end if;
  if v_valor <> trunc(v_valor) then raise exception 'DATOS_INVALIDOS: el valor es en COP sin decimales'; end if;
  if v_medio is null or v_medio not in ('efectivo','nequi','daviplata','transferencia','tarjeta','otro') then
    raise exception 'DATOS_INVALIDOS: medio de pago invalido';
  end if;
  if v_motivo = '' then raise exception 'DATOS_INVALIDOS: el reembolso exige motivo (RN-PAG-05)'; end if;

  if nullif(p ->> 'fecha', '') is not null then
    begin
      v_dia := (p ->> 'fecha')::date;
    exception when others then
      raise exception 'DATOS_INVALIDOS: fecha invalida (use AAAA-MM-DD)';
    end;
    if v_dia > v_hoy + 1 then raise exception 'E_FECHA: la fecha del reembolso no puede ser futura'; end if;
    v_fecha := v_dia::timestamp at time zone 'America/Bogota';   -- medianoche de Bogotá: no corre el día
  end if;

  if v_pagado is not null then
    perform 1 from miembros where user_id = v_pagado;
    if not found then raise exception 'E_REF: el socio que puso el dinero no existe'; end if;
  end if;

  select estado into v_estado from pedidos_venta where id = v_pedido and deleted_at is null for update;
  if not found then raise exception 'E_REF: el pedido de venta no existe'; end if;
  if v_estado not in ('cancelado', 'devuelto') then
    raise exception 'E_ESTADO: solo se reembolsa un pedido cancelado o devuelto, no uno % (RN-PAG-03)', v_estado;
  end if;

  select coalesce(sum(valor) filter (where direccion = 'cobro'), 0)
       - coalesce(sum(valor) filter (where direccion = 'reembolso'), 0)
    into v_neto from pagos where pedido_venta_id = v_pedido;
  if v_valor > v_neto then
    raise exception 'E_SOBREPAGO: el reembolso (%) supera lo cobrado neto (%) (RN-PAG-04)', v_valor, v_neto;
  end if;

  -- La idempotencia la da sync_ops (aplicar_ops); pagos.op_id queda nulo como en 0008 a 0010.
  insert into pagos (id, direccion, pedido_venta_id, medio, valor, fecha, referencia, motivo, pagado_por)
  values (v_id, 'reembolso', v_pedido, v_medio, v_valor, v_fecha, v_ref, v_motivo, v_pagado);

  return jsonb_build_object('pago_id', v_id, 'pedido_id', v_pedido, 'valor', v_valor,
                            'cobrado_neto_restante', v_neto - v_valor, 'por_reembolsar', (v_neto - v_valor) > 0);
end $$;
insert into tipos_op (tipo, funcion) values ('pago.reembolsar', 'op_pago_reembolsar');

-- 6) Vista por reembolsar (RF-PAG-06): PV cancelado/devuelto con cobrado neto > 0. Se lee online.
create view v_por_reembolsar with (security_invoker = true) as
select p.id as pedido_id, p.cliente_id, t.nombre as cliente, p.estado, p.total,
       coalesce(sum(g.valor) filter (where g.direccion = 'cobro'), 0)     as cobrado,
       coalesce(sum(g.valor) filter (where g.direccion = 'reembolso'), 0) as reembolsado,
       coalesce(sum(g.valor) filter (where g.direccion = 'cobro'), 0)
         - coalesce(sum(g.valor) filter (where g.direccion = 'reembolso'), 0) as por_reembolsar
  from pedidos_venta p
  join terceros t on t.id = p.cliente_id
  left join pagos g on g.pedido_venta_id = p.id
 where p.estado in ('cancelado', 'devuelto') and p.deleted_at is null
 group by p.id, t.nombre
having coalesce(sum(g.valor) filter (where g.direccion = 'cobro'), 0)
     - coalesce(sum(g.valor) filter (where g.direccion = 'reembolso'), 0) > 0;

-- 7) resumen_periodo (versión de 0012) + columna `reembolsos` (informativa: no resta de la utilidad, RN-PAG-06).
drop function resumen_periodo(date, date);
create function resumen_periodo(p_desde date, p_hasta date)
returns table (pedidos int, unidades numeric, ventas_lista numeric, descuentos numeric, ventas_netas numeric,
               envio_cobrado numeric, envio_costo numeric, costo_mercancia numeric,
               gastos numeric, utilidad_neta numeric, compras_periodo numeric, reembolsos numeric)
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
  ), r as (
    select coalesce(sum(valor), 0) as reembolsos from pagos
     where direccion = 'reembolso' and (fecha at time zone 'America/Bogota')::date between p_desde and p_hasta
  )
  select count(v.pedido_id)::int, coalesce(sum(v.unidades), 0), coalesce(sum(v.ventas_lista), 0),
         coalesce(sum(v.descuentos), 0), coalesce(sum(v.ventas_netas), 0),
         coalesce(sum(v.envio_cobrado), 0), coalesce(sum(v.envio_costo), 0), coalesce(sum(v.costo_mercancia), 0),
         (select gastos from g),
         coalesce(sum(v.utilidad_bruta), 0) - (select gastos from g),
         (select compras from c),
         (select reembolsos from r)
    from v;
$$;

-- 8) sync_pull (versión de 0005): el arreglo `pagos` de cada pedido incluye reembolsos (campo `direccion`).
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
                                from pagos g where g.pedido_venta_id = p.id and g.direccion in ('cobro','reembolso')), '[]')
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
