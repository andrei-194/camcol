-- =====================================================================
-- Camino Col · Migración 0007: op tercero.crear (T-M1-04, CAM-34)
-- =====================================================================
-- Solo hacia adelante. Registra el tipo `tercero.crear` en aplicar_ops (0003).
--   * Valida nombre, teléfono, roles y consentimiento (RF-TER-01/05).
--   * Antes de crear llama a detectar_duplicados_tercero (RF-TER-04). Con candidatos
--     y sin `resolucion` devuelve {_revision: true, candidatos} (RF-SYN-06, [E14]).
--   * resolucion: {tipo:'crear_igual'} | {tipo:'usar_existente', tercero_id}.
-- Reutilizable: `crear_tercero_desde_payload` la usarán pedido_venta.crear (cliente_nuevo)
-- y orden_compra.registrar (proveedor_nuevo).
-- SECURITY INVOKER: la RLS de terceros aplica (solo miembros).
-- =====================================================================

-- Devuelve {id, existente?} o {_revision:true, candidatos:[...]}.
create or replace function crear_tercero_desde_payload(p jsonb) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_id         uuid;
  v_nombre     text := btrim(coalesce(p ->> 'nombre', ''));
  v_tel        text := nullif(btrim(coalesce(p ->> 'telefono', '')), '');
  v_tel_n      text;
  v_cliente    boolean := coalesce((p ->> 'es_cliente')::boolean, false);
  v_proveedor  boolean := coalesce((p ->> 'es_proveedor')::boolean, false);
  v_consent    boolean := coalesce((p ->> 'consentimiento_datos')::boolean, false);
  v_consent_en timestamptz;
  v_res        jsonb := p -> 'resolucion';
  v_res_tipo   text;
  v_exist      uuid;
  v_cand       jsonb;
begin
  if v_nombre = '' then
    raise exception 'DATOS_INVALIDOS: el nombre es obligatorio';
  end if;
  if not (v_cliente or v_proveedor) then
    raise exception 'DATOS_INVALIDOS: debe ser cliente o proveedor';
  end if;
  if v_tel is not null then
    v_tel_n := normalizar_telefono(v_tel);
    if v_tel ~ '[A-Za-z]' or length(v_tel_n) < 7 or length(v_tel_n) > 15 then
      raise exception 'DATOS_INVALIDOS: telefono invalido';
    end if;
  end if;
  if v_cliente and not v_consent then
    raise exception 'E_CONSENTIMIENTO: el cliente nuevo exige consentimiento de tratamiento de datos';
  end if;

  v_id := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_consent_en := case when v_consent
    then coalesce((p ->> 'consentimiento_en')::timestamptz, now()) end;

  -- Resolución explícita del usuario (se reenvía la misma op con ella)
  if v_res is not null and v_res <> 'null'::jsonb then
    if jsonb_typeof(v_res) <> 'object' then
      raise exception 'DATOS_INVALIDOS: resolucion debe ser un objeto';
    end if;
    v_res_tipo := v_res ->> 'tipo';
    if v_res_tipo not in ('crear_igual', 'usar_existente') then
      raise exception 'DATOS_INVALIDOS: resolucion desconocida: %', coalesce(v_res_tipo, '(vacia)');
    end if;
  end if;

  if v_res_tipo = 'usar_existente' then
    v_exist := (v_res ->> 'tercero_id')::uuid;
    perform 1 from terceros where id = v_exist and deleted_at is null;
    if not found then
      raise exception 'E_REF: el tercero existente no existe o fue eliminado';
    end if;
    -- Si el existente no tenía el rol que se pedía, se le suma.
    update terceros
       set es_cliente   = es_cliente   or v_cliente,
           es_proveedor = es_proveedor or v_proveedor
     where id = v_exist
       and ((v_cliente and not es_cliente) or (v_proveedor and not es_proveedor));
    return jsonb_build_object('id', v_exist, 'existente', true);
  end if;

  if v_res_tipo is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'nombre', d.nombre, 'telefono', d.telefono,
             'municipio', d.municipio, 'motivo', d.motivo) order by d.nombre), '[]'::jsonb)
      into v_cand
      from detectar_duplicados_tercero(v_tel, p ->> 'numero_documento', v_nombre) d;
    if jsonb_array_length(v_cand) > 0 then
      return jsonb_build_object('_revision', true, 'candidatos', v_cand);
    end if;
  end if;

  insert into terceros (
    id, nombre, tipo_documento, numero_documento, telefono, email, direccion,
    municipio, vereda, latitud, longitud, es_cliente, es_proveedor,
    productos_ofrecidos, notas, consentimiento_datos, consentimiento_en
  ) values (
    v_id, v_nombre, nullif(p ->> 'tipo_documento', ''), nullif(p ->> 'numero_documento', ''),
    v_tel, nullif(p ->> 'email', ''), nullif(p ->> 'direccion', ''),
    nullif(p ->> 'municipio', ''), nullif(p ->> 'vereda', ''),
    (p ->> 'latitud')::numeric, (p ->> 'longitud')::numeric, v_cliente, v_proveedor,
    nullif(p ->> 'productos_ofrecidos', ''), nullif(p ->> 'notas', ''), v_consent, v_consent_en
  );
  return jsonb_build_object('id', v_id);
end $$;

create or replace function op_tercero_crear(datos jsonb) returns jsonb
language plpgsql set search_path = public, extensions as $$
begin
  return crear_tercero_desde_payload(datos);
end $$;

insert into tipos_op (tipo, funcion) values ('tercero.crear', 'op_tercero_crear');
