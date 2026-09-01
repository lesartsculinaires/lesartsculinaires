-- ===========================================================================
-- QUÉ SON LOS 164 GRUPOS QUE APARECIERON AL JUNTAR LAS FICHAS
-- ===========================================================================
--
-- Al fusionar las fichas repetidas, los leads de las dos quedaron colgando de
-- la misma persona. Antes de eso el CRM no tenía leads repetidos —lo dejamos
-- en cero—; ahora hay 164 pares (persona + programa) con dos leads abiertos.
--
-- No es un error: es trabajo que quedó a la vista. Pero NO son como los que se
-- limpiaron antes.
--
--   LOS DE ANTES     Cascarones vacíos que dejaba el botón de unificar. Sin
--                    programa, sin monto, sin asesora, sin etapa. Juntarlos no
--                    podía perder nada.
--
--   ÉSTOS            Vienen de dos fichas que se trabajaron por separado. Es
--                    probable que los dos lados tengan datos: dos asesoras,
--                    dos etapas, quizá dos montos. Juntar eso a ciegas puede
--                    borrar una venta.
--
-- Por eso este archivo empieza por MIRAR. Corré el PASO 1, y con ese número
-- decidimos: lo que sea claramente seguro lo junta el PASO 3 de
-- `JUNTAR-LEADS-YA-REPETIDOS.sql`; lo demás hay que verlo.
--
-- Ningún paso de este archivo escribe nada.
-- ===========================================================================


-- ===========================================================================
-- PASO 1 — DE QUÉ CLASE SON (no cambia nada)
-- ===========================================================================
--
-- Cada grupo cae en un balde. Los de arriba son seguros; los de abajo hay que
-- mirarlos con alguien que conozca los casos.
-- ===========================================================================
with abiertas as (
  select o.id, o.cliente_id, o.producto_id, o.fecha_registro, o.vendedor_id,
         o.valor_oportunidad, o.venta_cerrada, coalesce(e.orden, 0) as etapa_orden
    from public.oportunidades o
    left join public.estados s on s.id = o.estado_id
    left join public.etapas  e on e.id = o.etapa_id
   where coalesce(s.es_final, false) = false
     and coalesce(o.venta_cerrada, 0) = 0
),
grupos as (
  select cliente_id, coalesce(producto_id, -1) as prog
    from abiertas
   group by cliente_id, coalesce(producto_id, -1)
  having count(*) > 1
),
enGrupo as (
  select a.* from abiertas a
  join grupos g on g.cliente_id = a.cliente_id
               and g.prog = coalesce(a.producto_id, -1)
),
porGrupo as (
  select
    cliente_id,
    coalesce(producto_id, -1)                                        as prog,
    count(*)                                                         as cuantos,
    count(*) filter (where valor_oportunidad is not null)            as con_monto,
    count(distinct vendedor_id) filter (where vendedor_id is not null) as asesoras,
    count(*) filter (where etapa_orden > 1)                          as avanzados,
    max(fecha_registro) - min(fecha_registro)                        as dias
  from enGrupo
  group by cliente_id, coalesce(producto_id, -1)
)
select
  case
    -- Sin plata anotada, sin dos asesoras peleándose el lead y sin trabajo
    -- hecho en el embudo: no hay nada que juntar pueda perder.
    when con_monto = 0 and asesoras <= 1 and avanzados = 0
      then '1. nada que perder: juntar sin mirar'
    -- Igual, pero uno de los dos ya avanzó. Se conserva el más avanzado, así
    -- que tampoco se pierde: sólo conviene saber que pasó.
    when con_monto = 0 and asesoras <= 1
      then '2. con etapa avanzada, misma asesora: casi seguro'
    when asesoras > 1
      then '3. DOS ASESORAS: hay que decidir de quién es'
    when con_monto > 1
      then '4. DOS MONTOS: mirar uno por uno'
    else '5. el resto: mirar'
  end                                as clase,
  count(*)                           as grupos,
  sum(cuantos) - count(*)            as leads_que_desaparecerian,
  min(dias)                          as dias_min,
  max(dias)                          as dias_max
from porGrupo
group by 1
order by 1;


-- ===========================================================================
-- PASO 2 — LOS QUE HAY QUE MIRAR, UNO POR UNO (no cambia nada)
-- ===========================================================================
--
-- Sólo las clases 3, 4 y 5 del paso anterior: las que tienen algo que perder.
-- Las clases 1 y 2 las junta el PASO 3 de `JUNTAR-LEADS-YA-REPETIDOS.sql`.
--
-- Para juntar uno a mano, con el código que quiera conservarse primero:
--
--   select public.fusionar_oportunidades(
--     (select id from public.oportunidades where codigo = 'CRM-XXXX'),
--     array[(select id from public.oportunidades where codigo = 'CRM-YYYY')]::bigint[]
--   );
-- ===========================================================================
with abiertas as (
  select o.id, o.codigo, o.cliente_id, o.producto_id, o.fecha_registro,
         o.vendedor_id, o.valor_oportunidad, coalesce(e.orden, 0) as etapa_orden
    from public.oportunidades o
    left join public.estados s on s.id = o.estado_id
    left join public.etapas  e on e.id = o.etapa_id
   where coalesce(s.es_final, false) = false
     and coalesce(o.venta_cerrada, 0) = 0
),
grupos as (
  select cliente_id, coalesce(producto_id, -1) as prog
    from abiertas group by cliente_id, coalesce(producto_id, -1) having count(*) > 1
),
enGrupo as (
  select a.* from abiertas a
  join grupos g on g.cliente_id = a.cliente_id and g.prog = coalesce(a.producto_id, -1)
),
delicados as (
  select cliente_id, coalesce(producto_id, -1) as prog
    from enGrupo
   group by cliente_id, coalesce(producto_id, -1)
  having count(*) filter (where valor_oportunidad is not null) > 0
      or count(distinct vendedor_id) filter (where vendedor_id is not null) > 1
      or count(*) filter (where etapa_orden > 1) > 0
)
select
  c.nombre                              as contacto,
  coalesce(p.nombre, '(sin programa)')  as programa,
  g.codigo,
  g.fecha_registro,
  coalesce(v.nombre, '(sin asesora)')   as asesora,
  coalesce(e.nombre, '(sin etapa)')     as etapa,
  coalesce(g.valor_oportunidad::text, '—') as valor
from enGrupo g
join delicados d on d.cliente_id = g.cliente_id and d.prog = coalesce(g.producto_id, -1)
join public.clientes c on c.id = g.cliente_id
left join public.productos  p on p.id = g.producto_id
left join public.vendedores v on v.id = g.vendedor_id
left join public.etapas     e on e.orden = g.etapa_orden
order by c.nombre, g.fecha_registro;
