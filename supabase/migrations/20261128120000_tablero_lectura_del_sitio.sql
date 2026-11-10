-- El sitio de Dirección lee el Tablero de HC con la llave de servicio (10/11/2026).
--
-- El sitio aparte (repositorio `tablero-comercial`) junta LAC y HC para la
-- Dirección. Se entra con la cuenta de LAC, así que en HC no hay sesión: lo de
-- HC se lee desde el servidor del sitio con la llave de servicio, después de
-- comprobar en LAC que quien entra tiene permiso.
--
-- La llave de servicio ya pasa por encima de las políticas de las tablas, pero
-- las tres funciones que cuentan lo del CRM preguntan `puede('tablero','ver')`,
-- y eso mira el rol del usuario: con la llave de servicio no hay usuario y
-- contestaba que no. Acá la pregunta pasa a `puede_ver_tablero()`, que dice
-- que sí a quien tenga el Tablero (como antes) o a la llave de servicio.
--
-- Nada más cambia: lo que cuentan y cómo lo cuentan es lo mismo que en
-- `20261126120000_tablero_datos_del_crm.sql`. Va igual en los dos CRM para
-- que sigan siendo el mismo código; en LAC no lo usa nadie todavía.

begin;

-- ¿Puede ver el Tablero quien pide? Un usuario con el permiso, o la llave de
-- servicio (que sólo vive en servidores: el del CRM y el del sitio).
create or replace function public.puede_ver_tablero()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.puede('tablero', 'ver')
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
$$;

revoke execute on function public.puede_ver_tablero() from public, anon;
grant  execute on function public.puede_ver_tablero() to authenticated, service_role;

-- ------------------------------------------------------ los datos de la semana

create or replace function public.tablero_crm_semanal(p_desde date, p_hasta date)
returns table (semana date, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_ver_tablero() then
    raise exception 'Sin permiso para ver el Tablero Comercial.' using errcode = '42501';
  end if;

  return query
  with
  leads as (
    select o.id, o.cliente_id, o.created_at,
           date_trunc('week', coalesce(o.fecha_registro, (o.created_at at time zone 'America/El_Salvador')::date))::date as lunes,
           public.tablero_canal_del_lead(o.id) as canal
      from public.oportunidades o
     where o.importacion_id is null
       and coalesce(o.fecha_registro, (o.created_at at time zone 'America/El_Salvador')::date) between p_desde and p_hasta
  ),
  contacto as (
    select l.id, l.lunes, l.created_at,
           least(
             (select min(m.creado_en)
                from public.mensajes m
                join public.conversaciones c on c.id = m.conversacion_id
               where c.cliente_id = l.cliente_id
                 and m.direccion = 'saliente'
                 and m.creado_en >= l.created_at - interval '1 hour'
                 and not exists (select 1 from public.envio_destinatarios d where d.wa_id = m.wa_id)),
             (select min(n.created_at)
                from public.oportunidad_notas n
               where n.oportunidad_id = l.id and n.autor_id is not null and n.origen in ('comentario', 'inbox')),
             (select min(ll.creado_en)
                from public.llamadas ll
                join public.conversaciones c on c.id = ll.conversacion_id
               where c.cliente_id = l.cliente_id and ll.direccion = 'saliente'
                 and ll.creado_en >= l.created_at - interval '1 hour')
           ) as cuando
      from leads l
  ),
  ganados as (
    select date_trunc('week', o.fecha_cierre)::date as lunes,
           p.categoria,
           public.tablero_canal_del_lead(o.id) as canal,
           coalesce(o.venta_cerrada, o.valor_oportunidad, 0) as monto
      from public.oportunidades o
      join public.estados es on es.id = o.estado_id
      left join public.productos p on p.id = o.producto_id
     where es.nombre ilike 'ganad%'
       and o.fecha_cierre between p_desde and p_hasta
  ),
  citas as (
    select date_trunc('week', (e.inicia_en at time zone 'America/El_Salvador')::date)::date as lunes
      from public.eventos e
      join public.tipos_evento te on te.id = e.tipo_id
     where e.estado = 'Realizado'
       and (te.nombre ilike '%visita%' or te.nombre ilike '%clase%' or te.nombre ilike '%cita%')
       and (e.inicia_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
  ),
  respuestas as (
    select date_trunc('week', (d.respondio_en at time zone 'America/El_Salvador')::date)::date as lunes
      from public.envio_destinatarios d
     where d.respondio_en is not null
       and (d.respondio_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
  )
  select l.lunes, 'mk.leads_' || l.canal, count(*)::numeric from leads l
   where l.canal <> 'recontacto' group by 1, 2
  union all
  select r.lunes, 'mk.leads_recontacto', count(*)::numeric from respuestas r group by 1
  union all
  select c.lunes, 'ventas.contactados', count(*)::numeric from contacto c where c.cuando is not null group by 1
  union all
  select c.lunes, 'ventas.contactados_24h', count(*)::numeric from contacto c
   where c.cuando is not null and c.cuando <= c.created_at + interval '24 hours' group by 1
  union all
  select ci.lunes, 'ventas.citas', count(*)::numeric from citas ci group by 1
  union all
  select g.lunes, 'ventas.inscritos_' || g.canal, count(*)::numeric from ganados g
   where g.categoria = 'Diplomado' group by 1, 2
  union all
  select g.lunes, 'ventas.cursos_cortos', count(*)::numeric from ganados g
   where g.categoria = 'Curso corto' group by 1
  union all
  -- Referencias: el área escribe el monto; esto sólo se muestra al lado.
  select g.lunes, 'ventas.cobrado_nuevos', sum(g.monto) from ganados g
   where g.categoria = 'Diplomado' group by 1
  union all
  select g.lunes, 'ventas.cursos_cortos_monto', sum(g.monto) from ganados g
   where g.categoria = 'Curso corto' group by 1;
end $$;

revoke execute on function public.tablero_crm_semanal(date, date) from public, anon;
grant  execute on function public.tablero_crm_semanal(date, date) to authenticated;
grant  execute on function public.tablero_crm_semanal(date, date) to service_role;

-- ---------------------------------------------- la actividad de cada persona

create or replace function public.tablero_crm_actividad(p_desde date, p_hasta date)
returns table (semana date, vendedor_id bigint, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_ver_tablero() then
    raise exception 'Sin permiso para ver el Tablero Comercial.' using errcode = '42501';
  end if;

  return query
  -- Mensajes escritos por la persona. Los de un envío masivo no son seguimiento.
  select date_trunc('week', (m.creado_en at time zone 'America/El_Salvador')::date)::date,
         v.id, 'mensajes'::text, count(*)::numeric
    from public.mensajes m
    join public.vendedores v on v.usuario_id = m.enviado_por
   where m.direccion = 'saliente'
     and (m.creado_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
     and not exists (select 1 from public.envio_destinatarios d where d.wa_id = m.wa_id)
   group by 1, 2
  union all
  select date_trunc('week', (l.creado_en at time zone 'America/El_Salvador')::date)::date,
         l.vendedor_id, 'llamadas', count(*)::numeric
    from public.llamadas l
   where l.direccion = 'saliente' and l.vendedor_id is not null
     and (l.creado_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
   group by 1, 2
  union all
  select date_trunc('week', (e.created_at at time zone 'America/El_Salvador')::date)::date,
         e.vendedor_id, 'citas_agendadas', count(*)::numeric
    from public.eventos e
   where e.vendedor_id is not null and e.estado <> 'Cancelado'
     and (e.created_at at time zone 'America/El_Salvador')::date between p_desde and p_hasta
   group by 1, 2
  union all
  select date_trunc('week', (e.inicia_en at time zone 'America/El_Salvador')::date)::date,
         e.vendedor_id, 'citas_realizadas', count(*)::numeric
    from public.eventos e
   where e.vendedor_id is not null and e.estado = 'Realizado'
     and (e.inicia_en at time zone 'America/El_Salvador')::date between p_desde and p_hasta
   group by 1, 2
  union all
  select date_trunc('week', o.fecha_cierre)::date, o.vendedor_id, 'ventas_cerradas', count(*)::numeric
    from public.oportunidades o
    join public.estados es on es.id = o.estado_id
   where es.nombre ilike 'ganad%' and o.vendedor_id is not null
     and o.fecha_cierre between p_desde and p_hasta
   group by 1, 2;
end $$;

revoke execute on function public.tablero_crm_actividad(date, date) from public, anon;
grant  execute on function public.tablero_crm_actividad(date, date) to authenticated;
grant  execute on function public.tablero_crm_actividad(date, date) to service_role;

-- ------------------------------------------- lo vendido por persona en el mes

create or replace function public.tablero_crm_ventas_persona(p_mes date)
returns table (vendedor_id bigint, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_ver_tablero() then
    raise exception 'Sin permiso para ver el Tablero Comercial.' using errcode = '42501';
  end if;

  return query
  select o.vendedor_id,
         case p.categoria when 'Diplomado' then 'diplomados' else 'cursos_cortos' end,
         count(*)::numeric
    from public.oportunidades o
    join public.estados es on es.id = o.estado_id
    join public.productos p on p.id = o.producto_id
   where es.nombre ilike 'ganad%' and o.vendedor_id is not null
     and p.categoria in ('Diplomado', 'Curso corto')
     and o.fecha_cierre >= date_trunc('month', p_mes)::date
     and o.fecha_cierre <  (date_trunc('month', p_mes) + interval '1 month')::date
   group by 1, 2;
end $$;

revoke execute on function public.tablero_crm_ventas_persona(date) from public, anon;
grant  execute on function public.tablero_crm_ventas_persona(date) to authenticated;
grant  execute on function public.tablero_crm_ventas_persona(date) to service_role;

commit;
