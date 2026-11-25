-- ============================================================================
-- Lo vendido día por día, para la proyección de la meta
-- ============================================================================
--
-- Pedido el 25/11/2026 para las dos marcas: en el Dashboard, en el Tablero y
-- como primer bloque del sitio de Dirección, una barra con la meta del mes que
-- pone Dirección, cuánto se lleva y a qué porcentaje, las asesoras con lo suyo,
-- y lo vendido por semana y por mes.
--
-- Cuenta lo mismo que la «Venta nueva» del Tablero:
--   · diplomados y cursos cortos GANADOS, el día de su fecha de cierre, con el
--     monto cerrado (o el valor de la oportunidad si no se cargó el cerrado);
--   · el corporativo, que Ventas llena a mano por semana, en el jueves de esa
--     semana (la misma regla con la que el Tablero reparte las semanas en meses).
-- Certificaciones, workshops y ganados sin programa no cuentan, como en el Tablero.
--
-- Tres piezas, como las demás del Tablero:
--   1. tablero_ventas_calculo — el cálculo, sin preguntar permiso;
--   2. tablero_ventas — lo que llama el CRM: con permiso para ver el Tablero, todo;
--      sin él, el total del equipo con sólo el nombre de quien pregunta (las demás
--      ventas van sin vendedora, para no mostrar lo de cada compañera);
--   3. tablero_del_sitio — el sitio de Dirección suma la clave «ventas».
--
-- Sólo crea y reemplaza funciones. No toca datos.

begin;

create or replace function public.tablero_ventas_calculo(p_desde date, p_hasta date)
returns table (fecha date, vendedor_id bigint, categoria text, cantidad integer, monto numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.fecha_cierre,
         o.vendedor_id,
         case p.categoria when 'Diplomado' then 'diplomado' else 'curso_corto' end,
         count(*)::integer,
         sum(coalesce(o.venta_cerrada, o.valor_oportunidad, 0))
    from public.oportunidades o
    join public.estados es on es.id = o.estado_id
    join public.productos p on p.id = o.producto_id
   where es.nombre ilike 'ganad%'
     and p.categoria in ('Diplomado', 'Curso corto')
     and o.fecha_cierre between p_desde and p_hasta
   group by 1, 2, 3
  union all
  select (s.semana + 3), null::bigint, 'corporativo', 0, s.valor
    from public.tablero_semanal s
   where s.campo = 'ventas.corporativo_monto'
     and s.valor is not null and s.valor <> 0
     and (s.semana + 3) between p_desde and p_hasta;
$$;

revoke execute on function public.tablero_ventas_calculo(date, date) from public, anon, authenticated;

create or replace function public.tablero_ventas(p_desde date, p_hasta date)
returns table (fecha date, vendedor_id bigint, categoria text, cantidad integer, monto numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_yo bigint := public.mi_vendedor_id();
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 450 then
    raise exception 'Rango de fechas no válido.' using errcode = '22023';
  end if;
  if public.puede('tablero', 'ver') then
    return query select * from public.tablero_ventas_calculo(p_desde, p_hasta);
  else
    -- Sin permiso del Tablero: el total del equipo y lo propio con nombre.
    return query
      select c.fecha, case when c.vendedor_id = v_yo then c.vendedor_id end, c.categoria, c.cantidad, c.monto
        from public.tablero_ventas_calculo(p_desde, p_hasta) c;
  end if;
end $$;

revoke execute on function public.tablero_ventas(date, date) from public, anon;
grant  execute on function public.tablero_ventas(date, date) to authenticated;

-- La meta de venta de cada mes, para cualquiera con sesión: es la meta del
-- equipo y se muestra en el Dashboard. Las demás metas del Tablero siguen
-- viéndose sólo con el permiso del Tablero.
create or replace function public.tablero_metas_de_venta(p_desde date, p_hasta date)
returns table (mes date, valor numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select m.mes, m.valor
    from public.tablero_metas m
   where m.clave = 'venta_nueva' and m.mes between p_desde and p_hasta and m.valor is not null;
$$;

revoke execute on function public.tablero_metas_de_venta(date, date) from public, anon;
grant  execute on function public.tablero_metas_de_venta(date, date) to authenticated;

-- El sitio de Dirección: lo mismo de antes, más «ventas» de los últimos seis meses
-- hasta el fin del mes que se mira.
create or replace function public.tablero_del_sitio(p_llave text, p_desde date, p_hasta date, p_mes date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_llave is null or length(p_llave) < 40 or not exists (
       select 1 from public.tablero_llaves_del_sitio l
        where l.activa and l.huella = encode(sha256(convert_to(p_llave, 'UTF8')), 'hex')) then
    raise exception 'Llave del sitio no válida.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_mes is null or p_hasta < p_desde or p_hasta - p_desde > 450 then
    raise exception 'Rango de fechas no válido.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'semanal', coalesce((
      select jsonb_agg(jsonb_build_object('semana', s.semana, 'campo', s.campo, 'valor', s.valor) order by s.semana, s.campo)
        from public.tablero_semanal s where s.semana between p_desde and p_hasta), '[]'::jsonb),
    'crm_semanal', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.tablero_crm_semanal_calculo(p_desde, p_hasta) c), '[]'::jsonb),
    'metas', coalesce((
      select jsonb_agg(jsonb_build_object('mes', m.mes, 'clave', m.clave, 'valor', m.valor))
        from public.tablero_metas m), '[]'::jsonb),
    'grupos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'programa', g.programa, 'grupo', g.grupo, 'dias', g.dias, 'horario', g.horario,
               'duracion_meses', g.duracion_meses, 'inicio', g.inicio, 'matricula_1', g.matricula_1,
               'matricula_2', g.matricula_2, 'mensualidad', g.mensualidad, 'graduacion', g.graduacion,
               'mensualidad_preventa', g.mensualidad_preventa, 'cupo', g.cupo, 'reservas', g.reservas,
               'inscritos', g.inscritos) order by g.inicio, g.grupo)
        from public.tablero_grupos g where g.activo), '[]'::jsonb),
    'acciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'tipo', a.tipo, 'accion', a.accion, 'responsable', a.responsable, 'persona', a.persona,
               'fecha', a.fecha, 'estado', a.estado, 'costo', a.costo, 'leads_esperados', a.leads_esperados,
               'leads_obtenidos', a.leads_obtenidos, 'inscritos', a.inscritos, 'venta', a.venta) order by a.fecha, a.id)
        from public.tablero_acciones a where a.fecha is null or a.fecha >= p_desde), '[]'::jsonb),
    'actividad', coalesce((
      select jsonb_agg(jsonb_build_object('semana', x.semana, 'vendedor_id', x.vendedor_id, 'campo', x.campo, 'valor', x.valor))
        from public.tablero_actividad x where x.semana between p_desde and p_hasta), '[]'::jsonb),
    'crm_actividad', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.tablero_crm_actividad_calculo(p_desde, p_hasta) c), '[]'::jsonb),
    'ventas_persona', coalesce((
      select jsonb_agg(jsonb_build_object('vendedor_id', v.vendedor_id, 'campo', v.campo, 'valor', v.valor))
        from public.tablero_ventas_persona v where v.mes = p_mes), '[]'::jsonb),
    'crm_ventas_persona', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.tablero_crm_ventas_persona_calculo(p_mes) c), '[]'::jsonb),
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object('hoja', k.hoja, 'texto', k.texto, 'actualizado_en', k.actualizado_en))
        from public.tablero_comentarios k where k.mes = p_mes), '[]'::jsonb),
    'vendedores', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'nombre', v.nombre, 'activo', v.activo) order by v.nombre)
        from public.vendedores v), '[]'::jsonb),
    'ventas', coalesce((
      select jsonb_agg(to_jsonb(c))
        from public.tablero_ventas_calculo(
               (date_trunc('month', p_mes) - interval '5 months')::date,
               (date_trunc('month', p_mes) + interval '1 month - 1 day')::date) c), '[]'::jsonb)
  );
end $$;

revoke execute on function public.tablero_del_sitio(text, date, date, date) from public;
grant  execute on function public.tablero_del_sitio(text, date, date, date) to anon, authenticated;

commit;
