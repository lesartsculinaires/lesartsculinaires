-- ============================================================================
-- La cartera de cada integrante: que el chat siga al lead, traspasarla entera
-- y revisar todos los días que nadie quede afuera
-- ============================================================================
--
-- Lo pidió la escuela el 14/10/2026, a raíz de Estefany: al entrar ella se le
-- pasaron leads a mano uno por uno (54), dos quedaron a nombre de Alexandra, y
-- los chats no acompañaron a los leads. A la vez Katya estaba dada de baja con
-- 9 leads abiertos y 327 chats a su nombre que ya nadie veía como propios.
--
-- Tres piezas:
--
--   1. trg_chat_sigue_al_lead — cuando un lead abierto cambia de asesora, el
--      chat de ese cliente se va con él. Es el camino inverso de «asignar» en
--      el Inbox, que ya pasaba los leads abiertos con el chat.
--   2. traspasar_cartera(de, a) — dirección pasa de una vez los leads
--      abiertos, los chats y las citas por venir de una asesora a otra. Los
--      leads ya ganados o perdidos no se tocan: son la historia de quien los
--      trabajó y cuentan en sus números.
--   3. revision_del_equipo() — la lista de lo que está desparejo, para la
--      pantalla de Equipos y para la revisión diaria.
--
-- Sólo crea funciones y un disparador. No borra nada y se puede correr con
-- gente trabajando, y dos veces.

-- ---------------------------------------------------------------------------
-- 1. El chat sigue al lead
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER porque quien pasa su lead a otra asesora puede no tener
-- permiso para escribir el chat (si estaba a nombre de una tercera, como los
-- de Katya). Sólo cambia una cosa: el dueño de los chats de ese mismo cliente,
-- al mismo dueño que acaba de quedar en el lead.
create or replace function public.chat_sigue_al_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vendedor_id is null
     or new.cliente_id is null
     or new.fecha_cierre is not null
     or new.vendedor_id is not distinct from old.vendedor_id then
    return null;
  end if;

  update public.conversaciones c
     set vendedor_id = new.vendedor_id
   where c.cliente_id = new.cliente_id
     and c.vendedor_id is distinct from new.vendedor_id;

  return null;
end $$;

revoke all on function public.chat_sigue_al_lead() from public;
revoke all on function public.chat_sigue_al_lead() from anon;
revoke all on function public.chat_sigue_al_lead() from authenticated;

create or replace trigger trg_chat_sigue_al_lead
  after update of vendedor_id on public.oportunidades
  for each row
  execute function public.chat_sigue_al_lead();

-- ---------------------------------------------------------------------------
-- 2. Traspasar la cartera entera
-- ---------------------------------------------------------------------------
--
-- Corre como quien la pide y además exige dirección: los cambios quedan en el
-- historial (actividad) con su nombre, igual que si los hubiera hecho a mano.
-- Todo o nada: si algo falla no queda una cartera partida al medio.
create or replace function public.traspasar_cartera(p_de bigint, p_a bigint)
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_leads integer;
  v_chats integer;
  v_citas integer;
begin
  if not public.es_admin() then
    raise exception 'Sólo dirección puede traspasar una cartera.' using errcode = '42501';
  end if;
  if p_de is null or p_a is null or p_de = p_a then
    raise exception 'Elegí a quién se le pasa la cartera.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vendedores v where v.id = p_a and v.activo) then
    raise exception 'La cartera sólo se le puede pasar a alguien activo.' using errcode = '22023';
  end if;

  -- Se cuentan antes: parte de los chats los mueve el disparador al pasar
  -- los leads, y el resto el update de abajo.
  select count(*) into v_chats from public.conversaciones c where c.vendedor_id = p_de;

  -- Los abiertos, con el mismo criterio que «asignar» en el Inbox.
  update public.oportunidades o
     set vendedor_id = p_a
   where o.vendedor_id = p_de
     and o.fecha_cierre is null;
  get diagnostics v_leads = row_count;

  -- Los chats de clientes sin lead abierto, que el disparador no tocó: también
  -- son conversaciones que alguien tiene que atender.
  update public.conversaciones c
     set vendedor_id = p_a
   where c.vendedor_id = p_de;

  -- Las citas que vienen; las pasadas son de quien las tuvo.
  update public.eventos e
     set vendedor_id = p_a
   where e.vendedor_id = p_de
     and e.inicia_en >= now();
  get diagnostics v_citas = row_count;

  return json_build_object('leads', v_leads, 'conversaciones', v_chats, 'citas', v_citas);
end $$;

revoke all on function public.traspasar_cartera(bigint, bigint) from public;
revoke all on function public.traspasar_cartera(bigint, bigint) from anon;
grant execute on function public.traspasar_cartera(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lo que está desparejo en el equipo
-- ---------------------------------------------------------------------------
--
-- Una fila por problema y por persona. Corre como quien la pide: dirección ve
-- todo; a cualquier otra persona no le devuelve nada.
--
--   baja_con_leads     dada de baja (o con la cuenta apagada) y con leads abiertos
--   baja_con_chats     dada de baja y con chats sin archivar
--   chat_de_otra       chats suyos cuyo cliente tiene el lead abierto con otra
--   cuenta_sin_ficha   entra al CRM con un rol que recibe leads, pero no tiene
--                      ficha de vendedor activa: no entra al reparto
--   ficha_sin_cuenta   ficha activa sin cuenta activa: no puede entrar a ver
--                      lo que tiene ni entra al reparto
create or replace function public.revision_del_equipo()
returns table (tipo text, vendedor_id bigint, nombre text, cantidad bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with es as (select public.es_admin() as admin),
  abiertas as (
    select o.id, o.vendedor_id, o.cliente_id, o.fecha_registro
      from public.oportunidades o
      left join public.estados s on s.id = o.estado_id
     where o.fecha_cierre is null and not coalesce(s.es_final, false)
  ),
  fichas as (
    select v.id, v.nombre, v.activo and coalesce(u.activo, false) as trabaja, v.usuario_id, u.activo as cuenta_activa
      from public.vendedores v
      left join public.usuarios u on u.id = v.usuario_id
  )
  select * from (
    select 'baja_con_leads'::text, f.id, f.nombre, count(*)
      from fichas f join abiertas a on a.vendedor_id = f.id
     where not f.trabaja
     group by f.id, f.nombre
    union all
    select 'baja_con_chats', f.id, f.nombre, count(*)
      from fichas f join public.conversaciones c on c.vendedor_id = f.id
     where not f.trabaja and not coalesce(c.archivada, false)
     group by f.id, f.nombre
    union all
    select 'chat_de_otra', f.id, f.nombre, count(*)
      from public.conversaciones c
      join fichas f on f.id = c.vendedor_id
     where not coalesce(c.archivada, false)
       and c.cliente_id is not null
       and exists (
         select 1 from abiertas a
          where a.cliente_id = c.cliente_id
            and a.vendedor_id is not null
            and a.vendedor_id <> c.vendedor_id
       )
     group by f.id, f.nombre
    union all
    select 'cuenta_sin_ficha', null::bigint, coalesce(u.nombre, u.correo), 1::bigint
      from public.usuarios u
      join public.roles r on r.id = u.rol_id
     where u.activo and r.recibe_leads
       and not exists (
         select 1 from public.vendedores v where v.usuario_id = u.id and v.activo
       )
    union all
    select 'ficha_sin_cuenta', f.id, f.nombre, 1::bigint
      from public.vendedores v
      join fichas f on f.id = v.id
     where v.activo and (f.usuario_id is null or not coalesce(f.cuenta_activa, false))
  ) x
  where (select admin from es)
  order by 1, 4 desc;
$$;

revoke all on function public.revision_del_equipo() from public;
revoke all on function public.revision_del_equipo() from anon;
grant execute on function public.revision_del_equipo() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Poner cada chat con la dueña de su lead
-- ---------------------------------------------------------------------------
--
-- Para los «chat_de_otra» que ya existían antes del disparador. Cada chat se
-- va con quien tiene el lead abierto más reciente de ese cliente. Sólo
-- dirección. Los chats archivados se dejan como están.
create or replace function public.alinear_chats_con_leads()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.es_admin() then
    raise exception 'Sólo dirección puede reasignar chats en bloque.' using errcode = '42501';
  end if;

  update public.conversaciones c
     set vendedor_id = d.vendedor_id
    from (
      select distinct on (o.cliente_id) o.cliente_id, o.vendedor_id
        from public.oportunidades o
        left join public.estados s on s.id = o.estado_id
       where o.fecha_cierre is null and not coalesce(s.es_final, false)
         and o.vendedor_id is not null and o.cliente_id is not null
       order by o.cliente_id, o.fecha_registro desc nulls last, o.id desc
    ) d
   where c.cliente_id = d.cliente_id
     and not coalesce(c.archivada, false)
     and c.vendedor_id is distinct from d.vendedor_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.alinear_chats_con_leads() from public;
revoke all on function public.alinear_chats_con_leads() from anon;
grant execute on function public.alinear_chats_con_leads() to authenticated;
