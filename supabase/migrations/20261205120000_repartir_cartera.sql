-- ============================================================================
-- Repartir al azar la cartera de una persona entre varias
-- ============================================================================
--
-- Lo pidió la escuela el 23/11/2026: al sacar a alguien de ventas desde
-- «Usuarios y Roles», poder pasarle sus leads a otra persona (eso ya existía:
-- `traspasar_cartera`) o repartirlos al azar entre varias.
--
-- «Al azar» quiere decir sin elegir quién se queda con cuál, pero parejo: los
-- clientes se barajan y se reparten por turnos, así que cada persona recibe
-- la misma cantidad, con una de diferencia como mucho. Un sorteo lead por lead
-- podía darle 30 a una y 10 a otra.
--
-- Mismo criterio que `traspasar_cartera`:
--   · sólo los leads ABIERTOS; los ganados y perdidos son la historia de quien
--     los trabajó y cuentan en sus números;
--   · los leads de un mismo cliente van juntos a la misma persona, y su chat
--     los sigue (lo hace `trg_chat_sigue_al_lead`);
--   · los chats que no tienen lead abierto también se reparten;
--   · las citas por venir van con su lead; las pasadas no se tocan.
--
-- Corre como quien la pide y exige dirección, así que cada cambio queda en el
-- historial con su nombre. Todo o nada. Sólo crea una función.

create or replace function public.repartir_cartera(p_de bigint, p_entre bigint[])
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entre bigint[];
  v_n     integer;
  v_leads integer := 0;
  v_chats integer := 0;
  v_citas integer := 0;
  v_extra integer := 0;
  v_por   json;
begin
  if not public.es_admin() then
    raise exception 'Sólo dirección puede repartir una cartera.' using errcode = '42501';
  end if;
  if p_de is null then
    raise exception 'Falta de quién es la cartera.' using errcode = '22023';
  end if;

  -- Las personas, barajadas: así el primer turno no le toca siempre a la misma.
  select array_agg(v.id order by random())
    into v_entre
    from public.vendedores v
   where v.id = any (coalesce(p_entre, '{}'))
     and v.id <> p_de
     and v.activo;
  v_n := coalesce(array_length(v_entre, 1), 0);

  if v_n = 0 then
    raise exception 'Elegí al menos una persona activa para repartir.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_entre) x
     where x <> p_de and not (x = any (v_entre))
  ) then
    raise exception 'Sólo se puede repartir entre personas activas.' using errcode = '22023';
  end if;

  -- Se cuentan antes: parte los mueve el disparador al pasar los leads.
  select count(*) into v_chats from public.conversaciones c where c.vendedor_id = p_de;

  -- Los leads abiertos, por cliente y por turnos.
  with grupos as (
    select coalesce(o.cliente_id, -o.id) as k
      from public.oportunidades o
     where o.vendedor_id = p_de
       and o.fecha_cierre is null
     group by 1
  ),
  turnos as (
    select g.k, ((row_number() over (order by random()) - 1) % v_n) + 1 as t
      from grupos g
  ),
  movidos as (
    update public.oportunidades o
       set vendedor_id = v_entre[t.t]
      from turnos t
     where o.vendedor_id = p_de
       and o.fecha_cierre is null
       and coalesce(o.cliente_id, -o.id) = t.k
    returning o.vendedor_id
  )
  select coalesce(sum(x.n), 0)::integer,
         coalesce(json_agg(json_build_object('id', x.vendedor_id, 'leads', x.n)), '[]'::json)
    into v_leads, v_por
    from (select m.vendedor_id, count(*) as n from movidos m group by 1) x;

  -- Los chats que quedaron (clientes sin lead abierto), también por turnos.
  with turnos as (
    select c.id, ((row_number() over (order by random()) - 1) % v_n) + 1 as t
      from public.conversaciones c
     where c.vendedor_id = p_de
  )
  update public.conversaciones c
     set vendedor_id = v_entre[t.t]
    from turnos t
   where c.id = t.id;

  -- Las citas por venir, con quien quedó su lead.
  update public.eventos e
     set vendedor_id = o.vendedor_id
    from public.oportunidades o
   where e.oportunidad_id = o.id
     and e.vendedor_id = p_de
     and e.inicia_en >= now()
     and o.vendedor_id = any (v_entre);
  get diagnostics v_citas = row_count;

  -- Y las de leads que no se movieron (ya cerrados): por turnos.
  with turnos as (
    select e.id, ((row_number() over (order by random()) - 1) % v_n) + 1 as t
      from public.eventos e
     where e.vendedor_id = p_de
       and e.inicia_en >= now()
  )
  update public.eventos e
     set vendedor_id = v_entre[t.t]
    from turnos t
   where e.id = t.id;
  get diagnostics v_extra = row_count;

  return json_build_object(
    'leads', v_leads,
    'conversaciones', v_chats,
    'citas', v_citas + v_extra,
    'por_persona', v_por
  );
end $$;

revoke all on function public.repartir_cartera(bigint, bigint[]) from public;
revoke all on function public.repartir_cartera(bigint, bigint[]) from anon;
grant execute on function public.repartir_cartera(bigint, bigint[]) to authenticated;
