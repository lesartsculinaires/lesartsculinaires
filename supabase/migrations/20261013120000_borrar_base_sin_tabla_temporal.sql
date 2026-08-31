begin;

-- ============================================================================
-- Borrar una base: sacar la tabla temporal, y decir POR QUÉ un lead cuenta
-- como trabajado
-- ============================================================================
--
-- Requiere que antes se haya corrido 20261010120000_borrar_base_duplicada.sql.
-- Reemplaza las dos funciones de ese archivo. Se puede correr con gente
-- adentro y no toca ni una fila de datos.
--
-- ----------------------------------------------------------------------------
-- 1. EL ERROR: «DELETE requires a WHERE clause»
-- ----------------------------------------------------------------------------
--
-- Apretar «Borrar 325 leads» en el módulo de Bases devolvía eso y no borraba
-- nada. El mensaje no viene del CRM ni de PostgREST: lo tira Postgres, por una
-- extensión que Supabase deja encendida —`safeupdate`— y que prohíbe cualquier
-- `delete` o `update` sin `where`. Es una red de seguridad excelente: impide
-- que un descuido en el editor de SQL vacíe una tabla entera.
--
-- Y `borrar_base` tenía exactamente eso, en una línea que parecía inofensiva:
--
--     delete from _huerfanos;
--
-- `_huerfanos` era una tabla temporal para anotar qué contactos iban a quedar
-- sin ningún lead. Vaciarla al principio de cada llamada es correcto —la
-- función se puede llamar dos veces en la misma sesión— pero se hacía sin
-- `where`, así que la extensión frenaba la función entera antes de tocar nada.
--
-- No es un problema de permisos ni de la migración: la función estaba bien
-- creada. Fallaba recién al ejecutarse, que es la peor forma de fallar, porque
-- todo parecía instalado.
--
-- LA SOLUCIÓN es no usar tabla temporal. Los huérfanos ahora van en un arreglo
-- de la propia función. Es más simple, no deja rastros entre llamadas, y no
-- hay ningún `delete` que vaciar: el arreglo nace vacío cada vez.
--
-- ----------------------------------------------------------------------------
-- 2. «325 DE ESOS LEADS YA SE TRABAJARON», SOBRE 325 LEADS
-- ----------------------------------------------------------------------------
--
-- El cartel avisaba que TODOS los leads de la base repetida estaban
-- trabajados. Un aviso que se enciende siempre no avisa de nada: se aprende a
-- tildar la casilla sin leer, que es justo lo contrario de lo que un freno así
-- tiene que lograr.
--
-- La cuenta salía de esto:
--
--     m.etapa_id is distinct from (select id from primera)   as avanzo
--
-- O sea: «está en una etapa que no es la primera». Dos problemas.
--
--   UN LEAD SIN ETAPA CONTABA     `is distinct from` con `null` da verdadero,
--                                 así que un lead al que nadie le puso etapa
--                                 —muy común en una carga de Excel— figuraba
--                                 como avanzado. Nadie lo avanzó: nunca tuvo.
--
--   LA ETAPA DE LA CARGA NO ES    Una planilla puede traer su propia columna
--   TRABAJO                       de etapa, y entonces los 325 entran
--                                 directamente en «Contactado» o donde diga el
--                                 archivo. Eso no es trabajo de nadie: es el
--                                 dato que venía adentro.
--
-- Se arregla lo primero —sin etapa ya no cuenta— y, sobre todo, se separa la
-- cuenta en sus partes: cuántos por notas, cuántos por dinero, cuántos por
-- estar cerrados y cuántos sólo por la etapa. El cartel puede entonces decir
-- qué hay de verdad ahí adentro, y quien decide decide mirando eso y no un
-- número que lo tapa todo.
--
-- Se agrega además «cerrados» —con fecha de cierre o en un estado final—, que
-- es trabajo de verdad y antes no se miraba: una venta ganada o perdida es
-- alguien que llegó hasta el final con esa persona.

-- ------------------------------------------------------ qué hay adentro
--
-- Se tira y se vuelve a crear porque cambia lo que devuelve, y eso `create or
-- replace` no lo permite.

drop function if exists public.revisar_base(bigint);

create or replace function public.revisar_base(p_id bigint)
returns table (
  leads             integer,
  contactos         integer,
  contactos_solo    integer,  -- los que quedarían sin ningún lead
  trabajados        integer,  -- cualquiera de las cuatro de abajo
  con_notas         integer,
  con_dinero        integer,
  con_cierre        integer,  -- ganados o perdidos: alguien llegó al final
  con_etapa         integer   -- sólo movidos de etapa, sin nada más
)
language sql
stable
security definer
set search_path = ''
as $$
  with mios as (
    select o.id, o.cliente_id, o.etapa_id, o.estado_id, o.fecha_cierre,
           o.reserva, o.venta_cerrada
      from public.oportunidades o
     where o.importacion_id = p_id
  ),
  primera as (
    select id from public.etapas order by orden limit 1
  ),
  marcados as (
    select m.id,
           m.cliente_id,
           exists (select 1 from public.oportunidad_notas n where n.oportunidad_id = m.id)
             as tiene_notas,
           coalesce(m.reserva, 0) > 0 or coalesce(m.venta_cerrada, 0) > 0
             as tiene_dinero,
           m.fecha_cierre is not null
             or exists (select 1 from public.estados e
                         where e.id = m.estado_id and e.es_final)
             as cerrado,
           /*
            * Movido de etapa.
            *
            * `is not null` primero, y ahí está el arreglo: sin eso, un lead al
            * que nadie le puso etapa contaba como avanzado, porque comparar
            * null con cualquier cosa usando `is distinct from` da verdadero.
            */
           m.etapa_id is not null
             and m.etapa_id is distinct from (select id from primera)
             as avanzo
      from mios m
  )
  select
    (select count(*) from mios)::int,
    (select count(distinct cliente_id) from mios)::int,
    (select count(*) from (
       select c.id
         from public.clientes c
        where c.id in (select cliente_id from mios)
          and not exists (
            select 1 from public.oportunidades o2
             where o2.cliente_id = c.id
               and o2.importacion_id is distinct from p_id
          )
     ) q)::int,
    (select count(*) from marcados
      where tiene_notas or tiene_dinero or cerrado or avanzo)::int,
    (select count(*) from marcados where tiene_notas)::int,
    (select count(*) from marcados where tiene_dinero)::int,
    (select count(*) from marcados where cerrado)::int,
    -- Sólo los que están ahí POR la etapa y por nada más. Es el número que
    -- distingue «hay trabajo de verdad» de «la planilla traía una columna de
    -- etapa», y sumado a los otros tres no da de más.
    (select count(*) from marcados
      where avanzo and not tiene_notas and not tiene_dinero and not cerrado)::int
$$;

comment on function public.revisar_base(bigint) is
  'Qué se llevaría borrar esta base, y por qué cuenta como trabajado cada lead.';

-- ------------------------------------------------------------ y borrarla

create or replace function public.borrar_base(
  p_id     bigint,
  p_forzar boolean default false
)
returns table (
  ok                boolean,
  motivo            text,
  leads_borrados    integer,
  contactos_borrados integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_trabajados int;
  n_leads      int;
  n_contactos  int;
  /*
   * Los contactos que van a quedar sin ningún lead.
   *
   * Un arreglo y no una tabla temporal. La tabla obligaba a vaciarla al
   * empezar —la función se puede llamar dos veces en la misma sesión— y ese
   * `delete` sin `where` es lo que hacía fallar todo con «DELETE requires a
   * WHERE clause». Un arreglo nace vacío cada vez y no hay nada que limpiar.
   */
  huerfanos bigint[];
begin
  if not public.es_admin() then
    raise exception 'Sólo dirección puede borrar una base.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.importaciones where id = p_id) then
    return query select false, 'Esa base ya no existe. Recargá la pantalla.', 0, 0;
    return;
  end if;

  select r.trabajados, r.leads into n_trabajados, n_leads
    from public.revisar_base(p_id) r;

  /*
   * El freno.
   *
   * Se devuelve en vez de tirar excepción para que la pantalla pueda mostrar
   * el número y ofrecer forzar. Una excepción obligaría a leer un mensaje de
   * base de datos y no dejaría seguir.
   */
  if n_trabajados > 0 and not p_forzar then
    return query select
      false,
      format('%s de sus %s leads ya se trabajaron: tienen notas, dinero anotado, están cerrados o avanzaron de etapa.',
             n_trabajados, n_leads),
      0, 0;
    return;
  end if;

  -- Se calculan ANTES de borrar las oportunidades: después ya no se sabe
  -- cuáles eran de esta base.
  select coalesce(array_agg(c.id), '{}'::bigint[])
    into huerfanos
    from public.clientes c
   where c.id in (select o.cliente_id from public.oportunidades o where o.importacion_id = p_id)
     and not exists (
       select 1 from public.oportunidades o2
        where o2.cliente_id = c.id
          and o2.importacion_id is distinct from p_id
     );

  delete from public.oportunidades where importacion_id = p_id;
  get diagnostics n_leads = row_count;

  -- Con el arreglo vacío no borra nada, que es lo correcto: todos los
  -- contactos de esta base tienen además leads de otra.
  delete from public.clientes where id = any(huerfanos);
  get diagnostics n_contactos = row_count;

  delete from public.importaciones where id = p_id;

  return query select true, null::text, n_leads, n_contactos;
end $$;

comment on function public.borrar_base(bigint, boolean) is
  'Borra una base subida por error con sus leads y los contactos que quedan sin nada. Sólo dirección.';

revoke execute on function public.revisar_base(bigint)          from anon;
revoke execute on function public.borrar_base(bigint, boolean)  from anon;
grant  execute on function public.revisar_base(bigint)          to authenticated;
grant  execute on function public.borrar_base(bigint, boolean)  to authenticated;

commit;

-- ------------------------------------------------------------- cómo quedó
--
-- Además de comprobar que las funciones estén, muestra qué diría el cartel
-- para la base repetida que hay ahora. Si «sólo_por_etapa» es igual a «leads»,
-- lo que frenaba el borrado era nada más la columna de etapa de la planilla.

select
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'borrar_base'
  ) then '✓ se puede borrar' else '· falta' end                         as borrar,
  case when (
    select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'revisar_base'
  ) = 1 then '✓ y ver antes qué se lleva, con el detalle' else '⚠ REVISAR' end
                                                                        as revisar,
  r.leads,
  r.con_notas,
  r.con_dinero,
  r.con_cierre,
  r.con_etapa                                                           as solo_por_etapa,
  r.trabajados
  from (
    select (
      select i.id from public.importaciones i
       where exists (select 1 from public.importaciones j
                      where j.archivo = i.archivo and j.id <> i.id)
       order by i.creado_en desc
       limit 1
    ) as id
  ) repetida
  -- `left join` para que la fila salga igual aunque no haya ninguna base
  -- repetida: sin eso la consulta no devolvería nada y parecería que la
  -- migración no hizo nada.
  left join lateral public.revisar_base(repetida.id) r on true;
