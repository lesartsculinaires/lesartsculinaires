-- Lo que el Tablero Comercial saca solo del CRM (9/11/2026).
--
-- La plantilla de la Dirección hacía escribir a mano datos que el CRM ya
-- tiene: cuántos leads llegaron y por dónde, cuántos se contactaron y en
-- cuánto tiempo, cuántos se inscribieron. Estas funciones los calculan, semana
-- por semana, con los mismos nombres de campo que guarda `tablero_semanal`.
-- Si el área escribe un número, manda el del área: ver `lib/tablero/campos.ts`.
--
-- ============================================================================
-- CÓMO SE CUENTA CADA COSA
-- ============================================================================
--
--   Lead          Una oportunidad nueva, por su fecha de registro. Las que
--                 vinieron de una base importada no son leads nuevos: son
--                 contactos viejos, y entran sólo si contestan (recontacto).
--
--   Canal         El de la tabla `tablero_canales` (los nueve de la
--                 plantilla). Un chat que llegó desde un anuncio de Meta —el
--                 CRM lo sabe por el bloque `referral` de WhatsApp— cuenta
--                 como pauta de Meta aunque su canal diga «Whatsapp».
--
--   Contactado    Al lead se le escribió, se le llamó por el CRM o alguien
--                 le anotó un seguimiento. En menos de 24 h: eso pasó dentro
--                 del día siguiente a que entró.
--
--   Inscrito      Lead ganado de un diplomado, por su fecha de cierre.
--   Curso corto   Lead ganado de un curso corto, por su fecha de cierre.
--
--   Recontacto    Respuestas a los envíos masivos, más los inscritos que
--                 salieron de una base importada.
--
-- La semana es la del lunes, en hora de El Salvador.

begin;

-- ------------------------------------------------- los canales de la plantilla

-- Qué canal del CRM es cuál de los nueve de la plantilla. Es una tabla y no
-- un «case» escrito en la función porque la Dirección todavía tiene que
-- confirmarlo, y cambiarlo tiene que ser una fila y no una migración.
create table if not exists public.tablero_canales (
  canal   text primary key check (canal = lower(canal)),
  destino text not null check (destino in (
    'meta', 'tiktok', 'google', 'organico', 'colegios', 'alianzas', 'clases', 'referidos', 'recontacto'
  ))
);

comment on table public.tablero_canales is
  'Canal del CRM (en minúsculas) → canal de la plantilla del Tablero Comercial. Sin fila: orgánico.';

-- Propuesta inicial, a confirmar con la Dirección.
insert into public.tablero_canales (canal, destino) values
  ('whatsapp',      'organico'),
  ('instagram',     'organico'),
  ('facebook',      'organico'),
  ('messenger',     'organico'),
  ('organico',      'organico'),
  ('pagina web',    'organico'),
  ('tiktok',        'tiktok'),
  ('google',        'google'),
  ('feria',         'colegios'),
  ('colegio',       'colegios'),
  ('alianza',       'alianzas'),
  ('empresa',       'alianzas'),
  ('clase muestra', 'clases'),
  ('open house',    'clases'),
  ('referido',      'referidos'),
  ('ex-alumnos',    'referidos'),
  ('alumna activa', 'referidos')
on conflict (canal) do nothing;

alter table public.tablero_canales enable row level security;
drop policy if exists tablero_canales_ver    on public.tablero_canales;
drop policy if exists tablero_canales_editar on public.tablero_canales;
create policy tablero_canales_ver on public.tablero_canales for select to authenticated
  using ((select public.puede('tablero', 'ver')));
create policy tablero_canales_editar on public.tablero_canales for all to authenticated
  using ((select public.puede_llenar_tablero('metas'))) with check ((select public.puede_llenar_tablero('metas')));

-- ----------------------------------------------------- el canal de cada lead

-- Uno de los nueve, con la regla de arriba. Aparte para que lo usen igual los
-- leads y los inscritos.
create or replace function public.tablero_canal_del_lead(p_oportunidad bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.importacion_id is not null then 'recontacto'
    when tc.destino in ('tiktok', 'google') then tc.destino
    when exists (
      select 1 from public.conversaciones c
       where c.cliente_id = o.cliente_id and c.origen ->> 'red' = 'anuncio'
    ) then 'meta'
    else coalesce(tc.destino, 'organico')
  end
  from public.oportunidades o
  left join public.canales ca on ca.id = o.canal_id
  left join public.tablero_canales tc on tc.canal = lower(trim(ca.nombre))
  where o.id = p_oportunidad;
$$;

revoke execute on function public.tablero_canal_del_lead(bigint) from public, anon;

-- ------------------------------------------------------ los datos de la semana

create or replace function public.tablero_crm_semanal(p_desde date, p_hasta date)
returns table (semana date, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede('tablero', 'ver') then
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

-- ---------------------------------------------- la actividad de cada persona

create or replace function public.tablero_crm_actividad(p_desde date, p_hasta date)
returns table (semana date, vendedor_id bigint, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede('tablero', 'ver') then
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

-- ------------------------------------------- lo vendido por persona en el mes

create or replace function public.tablero_crm_ventas_persona(p_mes date)
returns table (vendedor_id bigint, campo text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede('tablero', 'ver') then
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

commit;

-- ------------------------------------------------------------- cómo quedó

select
  (select count(*) from public.tablero_canales)                                  as canales_asignados,
  (select count(*) from pg_proc where proname like 'tablero_crm_%')               as funciones;
