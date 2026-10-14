-- ============================================================================
-- La columna del Pipeline y el estado del lead, de acuerdo en los dos sentidos
-- ============================================================================
--
-- Lo que pidió la escuela el 14 de octubre de 2026: que lo que se mueve en el
-- Pipeline se vea en el Dashboard y en Clientes, y que cuenten igual.
--
-- EL PROBLEMA, MEDIDO
--
-- El Pipeline ubica cada lead por su ETAPA (la columna). El Dashboard cuenta
-- ganados, perdidos y abiertos por su ESTADO. Ya había dos reglas:
--
--   arrastrar a «Ganado»           pone el estado Ganado     (ganado_por_la_etapa)
--   marcar Ganado/Perdido en ficha  mueve la tarjeta          (etapa_por_el_estado)
--
-- Faltaban las otras tres, y por eso el 14/10 había 771 leads en la columna
-- «Perdido» que el Dashboard contaba como abiertos —un tercio de «En
-- pipeline», 8.873 USD de valor—: 1040 perdidos en el tablero contra 269 en
-- el Dashboard.
--
-- LO QUE AGREGA
--
--   1. Arrastrar a «Perdido» pone el estado Perdido.
--   2. Sacar una tarjeta de «Ganado» o «Perdido» a una columna abierta le
--      devuelve el estado Activo: ya no está ni ganada ni perdida.
--   3. Cambiar en la ficha el estado de un lead ganado o perdido a uno abierto
--      (Activo, Reserva, En pausa) saca la tarjeta de esa columna y la vuelve
--      a la columna donde estaba antes, según el registro de actividad.
--
-- La regla de siempre se mantiene: si la misma escritura cambió la columna Y
-- el estado, manda lo que hizo la persona y ningún disparador lo corrige.

create or replace function public.estado_por_la_etapa()
returns trigger
language plpgsql
as $$
declare
  nueva_etapa  text;
  vieja_etapa  text;
  estado_hoy   text;
  id_estado    bigint;
begin
  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.estado_id is distinct from old.estado_id then
    return new;
  end if;

  select e.nombre into nueva_etapa from public.etapas e where e.id = new.etapa_id;
  select s.nombre into estado_hoy  from public.estados s where s.id = new.estado_id;

  if nueva_etapa = 'Perdido' then
    if coalesce(estado_hoy, '') <> 'Perdido' then
      select id into id_estado from public.estados where nombre = 'Perdido' limit 1;
      if id_estado is not null then
        new.estado_id := id_estado;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and nueva_etapa is distinct from 'Ganado' then
    select e.nombre into vieja_etapa from public.etapas e where e.id = old.etapa_id;
    if vieja_etapa in ('Ganado', 'Perdido') and estado_hoy in ('Ganado', 'Perdido') then
      select id into id_estado from public.estados where nombre = 'Activo' limit 1;
      if id_estado is not null then
        new.estado_id := id_estado;
        new.motivo_perdida_id := null;
      end if;
    end if;
  end if;

  return new;
end $$;

create or replace trigger trg_estado_por_la_etapa
  before insert or update on public.oportunidades
  for each row execute function public.estado_por_la_etapa();

-- La última columna abierta en la que estuvo un lead, según el registro de
-- actividad; si no hay registro, la primera del embudo. Es SECURITY DEFINER
-- porque quien reabre el lead puede no tener permiso para leer todo el
-- registro, y sin él la tarjeta caería siempre en la primera columna.
create or replace function public.columna_abierta_anterior(p_oportunidad bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (a.campos -> 'etapa_id' ->> 'antes')::bigint
       from public.actividad a
       join public.etapas e on e.id = (a.campos -> 'etapa_id' ->> 'antes')::bigint
      where a.entidad = 'oportunidad'
        and a.entidad_id = p_oportunidad
        and a.campos ? 'etapa_id'
        and e.nombre not in ('Ganado', 'Perdido')
      order by a.creado_en desc
      limit 1),
    (select e.id from public.etapas e
      where e.nombre not in ('Ganado', 'Perdido')
      order by e.orden
      limit 1)
  );
$$;

revoke all on function public.columna_abierta_anterior(bigint) from public;
revoke all on function public.columna_abierta_anterior(bigint) from anon;
-- La llama el disparador, que corre como la persona que guarda: tiene que
-- poder ejecutarla. Sólo devuelve el número de una columna del embudo.
grant execute on function public.columna_abierta_anterior(bigint) to authenticated;

-- El camino de vuelta, ahora completo: además de llevar a «Ganado» o
-- «Perdido» la tarjeta que se marcó así, saca de esas columnas la que se
-- reabrió. Vuelve a la última columna abierta en la que estuvo; si no hay
-- registro, a la primera del embudo.
create or replace function public.etapa_por_el_estado()
returns trigger
language plpgsql
as $$
declare
  quiere     text;
  etapa_hoy  text;
  destino    bigint;
begin
  if tg_op = 'UPDATE' and new.estado_id is not distinct from old.estado_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.etapa_id is distinct from old.etapa_id then
    return new;
  end if;

  select s.nombre into quiere from public.estados s where s.id = new.estado_id;

  if quiere in ('Ganado', 'Perdido') then
    select e.id into destino from public.etapas e where e.nombre = quiere limit 1;
    if destino is not null then
      new.etapa_id := destino;
    end if;
    return new;
  end if;

  if tg_op <> 'UPDATE' then
    return new;
  end if;

  select e.nombre into etapa_hoy from public.etapas e where e.id = new.etapa_id;
  if etapa_hoy not in ('Ganado', 'Perdido') then
    return new;
  end if;

  destino := public.columna_abierta_anterior(new.id);

  if destino is not null then
    new.etapa_id := destino;
  end if;
  return new;
end $$;
