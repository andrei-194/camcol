-- =====================================================================
-- Camino Col · Migración 0003: aplicar_ops, infraestructura (T-M1-03, CAM-33)
-- =====================================================================
-- Solo hacia adelante. Núcleo de la ruta única de escritura (RF-SYN-01):
--   * sync_ops   : bitácora de ops aplicadas (op_id único = idempotencia).
--   * tipos_op   : registro de tipos -> función manejadora. T-M1-04..07 añaden
--                  sus ops con un INSERT aquí + su función, sin tocar el núcleo.
--   * aplicar_ops: ejecuta el arreglo en orden, cada op en su sub-bloque.
-- Sin estado "bloqueada" (D-009): el resultado trae detener_cola y el cliente
-- detiene su cola. Corre como SECURITY INVOKER (RLS aplica).
-- =====================================================================

-- sync_ops ya existe desde 0001 (op_id pk, device_id, tipo, aplicado_en, resultado),
-- con RLS y política solo_miembros. Aquí solo se le añade estado: se registran
-- únicamente las ops aplicadas con éxito.
alter table sync_ops add column estado text not null default 'ok' check (estado = 'ok');
alter table sync_ops alter column resultado set default '{}'::jsonb;
create index sync_ops_aplicado_en_idx on sync_ops (aplicado_en);

-- Contrato del manejador: función(datos jsonb) returns jsonb, en el esquema public.
--   * Éxito: devuelve el resultado (p. ej. los ids creados).
--   * Revisión (p. ej. posible duplicado): devuelve un objeto con "_revision": true;
--     no se registra como aplicada y detiene la cola.
--   * Rechazo: RAISE EXCEPTION 'CODIGO: mensaje' (CODIGO en MAYÚSCULAS_Y_GUION_BAJO).
create table tipos_op (
  tipo    text primary key,
  funcion text not null check (funcion ~ '^[a-z_][a-z0-9_]*$')
);

alter table tipos_op enable row level security;
-- tipos_op: lectura para miembros; se escribe solo desde migraciones.
create policy tipos_op_lectura on tipos_op for select using (es_miembro());

-- ---------------------------------------------------------------------
-- aplicar_ops(ops jsonb) -> jsonb
--   ops: [{ "op_id": uuid, "tipo": text, "datos": object }]
--   salida: { "detener_cola": bool,
--             "resultados": [{ op_id, status, resultado?, error?: {codigo, mensaje} }] }
--   status: ok | ya_aplicada | revision | error
-- Códigos de error: TIPO_DESCONOCIDO, DATOS_INVALIDOS, NO_AUTORIZADO, ERROR_INTERNO
-- y los que definan los manejadores (E_* de PLAN §4.3).
-- ---------------------------------------------------------------------
create or replace function aplicar_ops(ops jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_op        jsonb;
  v_idx       int := 0;
  v_res       jsonb := '[]'::jsonb;
  v_item      jsonb;
  v_detener   boolean := false;
  v_op_id     uuid;
  v_tipo      text;
  v_datos     jsonb;
  v_funcion   text;
  v_previo    jsonb;
  v_salida    jsonb;
  v_codigo    text;
  v_msg       text;
  v_sqlstate  text;
begin
  if ops is null or jsonb_typeof(ops) <> 'array' then
    raise exception 'DATOS_INVALIDOS: ops debe ser un arreglo' using errcode = 'P0001';
  end if;

  for v_op in select value from jsonb_array_elements(ops) loop
    v_idx := v_idx + 1;
    v_op_id := null; v_item := null;

    -- Cada op en su sub-bloque: si falla, se deshace solo ella (savepoint implícito).
    begin
      if not es_miembro() then
        raise exception 'NO_AUTORIZADO: solo los miembros pueden escribir' using errcode = 'P0001';
      end if;
      if jsonb_typeof(v_op) <> 'object' then
        raise exception 'DATOS_INVALIDOS: la operacion debe ser un objeto' using errcode = 'P0001';
      end if;

      begin
        v_op_id := (v_op ->> 'op_id')::uuid;
      exception when others then
        raise exception 'DATOS_INVALIDOS: op_id invalido' using errcode = 'P0001';
      end;
      if v_op_id is null then
        raise exception 'DATOS_INVALIDOS: falta op_id' using errcode = 'P0001';
      end if;

      v_tipo  := v_op ->> 'tipo';
      v_datos := v_op -> 'datos';
      if v_tipo is null or v_tipo = '' then
        raise exception 'DATOS_INVALIDOS: falta tipo' using errcode = 'P0001';
      end if;
      if v_datos is null or jsonb_typeof(v_datos) <> 'object' then
        raise exception 'DATOS_INVALIDOS: datos debe ser un objeto' using errcode = 'P0001';
      end if;

      -- Idempotencia: ya aplicada -> devolver el resultado guardado.
      select resultado into v_previo from sync_ops where op_id = v_op_id;
      if found then
        v_item := jsonb_build_object('op_id', v_op_id, 'status', 'ya_aplicada', 'resultado', v_previo);
      else
        select funcion into v_funcion from tipos_op where tipo = v_tipo;
        if not found then
          raise exception 'TIPO_DESCONOCIDO: tipo de operacion no registrado: %', v_tipo using errcode = 'P0001';
        end if;

        execute format('select %I($1)', v_funcion) into v_salida using v_datos;
        v_salida := coalesce(v_salida, '{}'::jsonb);

        if coalesce((v_salida ->> '_revision')::boolean, false) then
          v_item := jsonb_build_object('op_id', v_op_id, 'status', 'revision', 'resultado', v_salida - '_revision');
          v_detener := true;
        else
          insert into sync_ops (op_id, tipo, resultado, aplicado_en)
            values (v_op_id, v_tipo, v_salida, clock_timestamp());
          v_item := jsonb_build_object('op_id', v_op_id, 'status', 'ok', 'resultado', v_salida);
        end if;
      end if;
    exception
      when unique_violation then
        -- Carrera: otra transacción registró este op_id entre la consulta y el insert.
        -- (Solo se interpreta así si la op ya consta; si no, es un error del manejador.)
        select resultado into v_previo from sync_ops where op_id = v_op_id;
        if found then
          v_item := jsonb_build_object('op_id', v_op_id, 'status', 'ya_aplicada', 'resultado', v_previo);
        else
          v_item := jsonb_build_object('op_id', v_op_id, 'status', 'error',
            'error', jsonb_build_object('codigo', 'E_DUPLICADO', 'mensaje', sqlerrm));
          v_detener := true;
        end if;
      when others then
        get stacked diagnostics v_msg = message_text, v_sqlstate = returned_sqlstate;
        if v_msg ~ '^[A-Z][A-Z0-9_]*(:|$)' then
          v_codigo := substring(v_msg from '^([A-Z][A-Z0-9_]*)');
          v_msg := btrim(regexp_replace(v_msg, '^[A-Z][A-Z0-9_]*:?', ''));
        elsif v_sqlstate = '42501' then
          v_codigo := 'NO_AUTORIZADO';
        elsif v_sqlstate like '22%' or v_sqlstate like '23%' then
          v_codigo := 'DATOS_INVALIDOS';      -- tipos, nulos, checks, llaves foráneas
        else
          v_codigo := 'ERROR_INTERNO';
        end if;
        v_item := jsonb_build_object('op_id', v_op_id, 'status', 'error',
          'error', jsonb_build_object('codigo', v_codigo, 'mensaje', v_msg));
        v_detener := true;
    end;

    v_res := v_res || jsonb_build_array(v_item);
  end loop;

  return jsonb_build_object('detener_cola', v_detener, 'resultados', v_res);
end $$;
