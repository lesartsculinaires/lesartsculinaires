-- «Solo sus envíos»: un rol que arma envíos masivos y no contesta chats (12/11/2026).
--
-- Pedido para HC: Karla (y el rol «Asesores») ve solo los clientes a los que
-- ella les manda masivos; los chats los atienden Alexandra y Estefany.
--
-- Quien tiene la casilla ve:
--   · lo asignado a su ficha y lo que no es de nadie (la regla de siempre sin
--     «Ve todo»: de los sin asignar elige a quién mandar), y
--   · los clientes a los que ÉL les mandó un envío masivo, aunque ya los
--     atienda otra persona.
-- Y no contesta: el CRM no le deja escribirle al cliente (eso lo frenan las
-- acciones del servidor, porque los envíos masivos guardan sus mensajes igual
-- que una respuesta). Puede dejar notas internas.
--
-- La misma migración en LAC y en HC. Sólo agrega: nadie cambia de permisos
-- hasta que se marque la casilla (en HC, abajo, para «Asesores»).

begin;

alter table public.roles
  add column if not exists solo_sus_envios boolean not null default false;

comment on column public.roles.solo_sus_envios is
  'Ve lo suyo, lo sin asignar y los clientes de sus envíos masivos; no contesta chats (sólo notas internas).';

-- ¿El rol de quien pide tiene la casilla?
create or replace function public.solo_sus_envios()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.solo_sus_envios and not r.es_admin
      from public.usuarios u
      join public.roles r on r.id = u.rol_id
     where u.id = (select auth.uid()) and u.activo
  ), false);
$$;

-- ¿Puede escribirle a un cliente? Todos menos los de «solo sus envíos».
create or replace function public.puede_contestar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.solo_sus_envios();
$$;

-- ¿Este cliente recibió un envío masivo armado por quien pide?
create or replace function public.es_de_mis_envios(p_cliente bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_cliente is not null and exists (
    select 1
      from public.envio_destinatarios d
      join public.envios e on e.id = d.envio_id
     where d.cliente_id = p_cliente
       and e.creado_por = (select auth.uid())
  );
$$;

revoke execute on function public.solo_sus_envios() from public, anon;
revoke execute on function public.puede_contestar() from public, anon;
revoke execute on function public.es_de_mis_envios(bigint) from public, anon;
grant execute on function public.solo_sus_envios() to authenticated;
grant execute on function public.puede_contestar() to authenticated;
grant execute on function public.es_de_mis_envios(bigint) to authenticated;

-- La que usan las notas, adjuntos y demás piezas de la ficha.
create or replace function public.puede_ver_oportunidad(p_oportunidad bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.ve_todo() or exists (
    select 1 from public.oportunidades o
     where o.id = p_oportunidad
       and (
         o.vendedor_id is null
         or o.vendedor_id = public.mi_vendedor_id()
         or (public.solo_sus_envios() and public.es_de_mis_envios(o.cliente_id))
       )
  );
$$;

-- Las reglas de lectura: las de siempre, más «los de mis envíos» para la casilla.
alter policy oportunidades_ver on public.oportunidades
  using (
    (select public.ve_todo())
    or vendedor_id is null
    or vendedor_id = (select public.mi_vendedor_id())
    or ((select public.solo_sus_envios()) and public.es_de_mis_envios(cliente_id))
  );

alter policy conversaciones_ver on public.conversaciones
  using (
    (select public.ve_todo())
    or vendedor_id is null
    or vendedor_id = (select public.mi_vendedor_id())
    or ((select public.solo_sus_envios()) and public.es_de_mis_envios(cliente_id))
  );

alter policy mensajes_ver on public.mensajes
  using (
    exists (
      select 1 from public.conversaciones c
       where c.id = mensajes.conversacion_id
         and (
           (select public.ve_todo())
           or c.vendedor_id is null
           or c.vendedor_id = (select public.mi_vendedor_id())
           or ((select public.solo_sus_envios()) and public.es_de_mis_envios(c.cliente_id))
         )
    )
  );

commit;
