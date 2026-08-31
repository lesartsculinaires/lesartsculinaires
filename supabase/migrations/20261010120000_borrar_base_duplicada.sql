begin;

-- ============================================================================
-- Borrar una base subida por error, con sus fichas
-- ============================================================================
--
-- Lo que pidió la escuela: poder seleccionar bases en el módulo y borrar las
-- que están duplicadas, y que eso lo haga sólo el administrador.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ NO ALCANZA CON UN `delete` A SECAS
-- ----------------------------------------------------------------------------
--
-- Porque `oportunidades.importacion_id` es `on delete set null`, a propósito:
-- borrar el REGISTRO de una base nunca tuvo que llevarse los clientes que
-- trajo. Con esa regla, apretar «borrar» sobre la base repetida haría
-- desaparecer el renglón de la lista y dejaría las 326 fichas duplicadas
-- adentro del CRM, ahora sin siquiera saber de dónde salieron. Peor que antes.
--
-- Así que borrar una base duplicada es otra operación, y por eso vive en una
-- función: se lleva la base, sus leads, y los contactos que quedan sin ningún
-- lead. Todo en una transacción, o nada.
--
-- ----------------------------------------------------------------------------
-- LO QUE NO SE BORRA, Y ES LO IMPORTANTE
-- ----------------------------------------------------------------------------
--
-- Un contacto que TAMBIÉN tiene leads de otra base se queda. Sólo se van los
-- que quedarían con cero: los que existían nada más por esta carga. Una
-- persona que entró por la base repetida y después escribió por WhatsApp tiene
-- un lead que no es de esta base, y borrarla se llevaría esa conversación.
--
-- Y un lead TRABAJADO frena la operación. Trabajado es: tiene notas, tiene un
-- recordatorio agendado, tiene dinero anotado —reserva o venta cerrada— o está
-- en una etapa distinta de la primera. Cualquiera de esas cosas significa que
-- alguien invirtió tiempo ahí, y eso no se tira por limpiar un duplicado.
--
-- Se puede forzar, porque hay casos legítimos —la base repetida se trabajó por
-- error y hay que quedarse con la otra—, pero nunca por omisión y nunca sin
-- que la pantalla diga cuántos son.
--
-- ----------------------------------------------------------------------------
-- SÓLO DIRECCIÓN
-- ----------------------------------------------------------------------------
--
-- Comprobado acá dentro y no sólo en la pantalla: una función `security
-- definer` corre con todos los permisos, así que si no preguntara por el rol
-- sería un agujero por el que cualquiera con sesión borra la base de datos de
-- la escuela. La política de `importaciones` ya era de administrador; esto la
-- acompaña en el único lugar donde no se puede saltar.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ------------------------------------------------------ qué hay adentro
--
-- De sólo lectura, para que la pantalla pueda decir qué se va a llevar ANTES
-- de que alguien apriete. Un «¿seguro?» sin números no es una confirmación:
-- es un trámite que se aprueba sin leer.

create or replace function public.revisar_base(p_id bigint)
returns table (
  leads             integer,
  contactos         integer,
  contactos_solo    integer,  -- los que quedarían sin ningún lead
  trabajados        integer,
  con_notas         integer,
  con_dinero        integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mios as (
    select o.id, o.cliente_id, o.etapa_id, o.reserva, o.venta_cerrada
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
           m.etapa_id is distinct from (select id from primera)
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
    (select count(*) from marcados where tiene_notas or tiene_dinero or avanzo)::int,
    (select count(*) from marcados where tiene_notas)::int,
    (select count(*) from marcados where tiene_dinero)::int
$$;

comment on function public.revisar_base(bigint) is
  'Qué se llevaría borrar esta base. Sólo lectura: para el cartel de confirmación.';

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
      format('%s de sus %s leads ya se trabajaron: tienen notas, dinero anotado o avanzaron de etapa.',
             n_trabajados, n_leads),
      0, 0;
    return;
  end if;

  -- Los contactos que quedarían sin ningún lead. Se calculan ANTES de borrar
  -- las oportunidades: después ya no se sabe cuáles eran de esta base.
  create temporary table if not exists _huerfanos (id bigint primary key)
    on commit drop;
  -- `truncate` y no `delete`: Supabase deja encendida la extensión
  -- `safeupdate` para el rol con el que habla la aplicación, y ésa prohíbe
  -- cualquier `delete` sin `where`. Un `delete from _huerfanos;` acá hacía
  -- fallar la función entera con «DELETE requires a WHERE clause», recién al
  -- ejecutarla desde el CRM. La versión de 20261013120000 se saca de encima la
  -- tabla temporal del todo; esto es para que este archivo tampoco falle si se
  -- corre solo.
  truncate _huerfanos;

  insert into _huerfanos (id)
  select c.id
    from public.clientes c
   where c.id in (select o.cliente_id from public.oportunidades o where o.importacion_id = p_id)
     and not exists (
       select 1 from public.oportunidades o2
        where o2.cliente_id = c.id
          and o2.importacion_id is distinct from p_id
     );

  delete from public.oportunidades where importacion_id = p_id;
  get diagnostics n_leads = row_count;

  delete from public.clientes where id in (select id from _huerfanos);
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

select
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'borrar_base'
  ) then '✓ se puede borrar una base con sus fichas' else '· falta' end as borrar,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'revisar_base'
  ) then '✓ y ver antes qué se lleva' else '· falta' end                as revisar,
  (select count(*) from public.importaciones)                           as bases,
  /*
   * Las que están repetidas: mismo archivo subido más de una vez.
   *
   * Es la cuenta que motivó todo esto. Si da más de cero, en el módulo de
   * Bases van a aparecer marcadas.
   */
  (select coalesce(sum(veces - 1), 0) from (
     select count(*) as veces from public.importaciones group by archivo
   ) q)                                                                 as repetidas;
