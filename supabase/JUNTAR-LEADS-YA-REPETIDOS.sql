-- ===========================================================================
-- JUNTAR LOS LEADS QUE YA QUEDARON REPETIDOS
-- ===========================================================================
--
-- El CRM ya no los crea: unificar un contacto ahora completa el lead que la
-- persona ya tenía en vez de abrirle otro, y una importación deja un lead por
-- persona y programa en vez de uno por fila.
--
-- Pero eso arregla de acá en adelante. Los que ya están —CRM-2625 y CRM-2626 de
-- Yolanda, y los que se hayan hecho igual— siguen ahí. Esto los junta.
--
-- ---------------------------------------------------------------------------
-- CÓMO SE USA
-- ---------------------------------------------------------------------------
--
-- En el SQL Editor de Supabase, de a un paso, en orden. El PASO 1 y el PASO 2
-- NO CAMBIAN NADA: son para mirar. El PASO 3 es el que escribe.
--
-- Conviene hacerlo así y no todo junto: el PASO 2 muestra exactamente qué se
-- va a unir con qué, y eso se puede leer antes de decidir.
--
-- ---------------------------------------------------------------------------
-- QUÉ SE JUNTA Y QUÉ NO
-- ---------------------------------------------------------------------------
--
-- La misma regla que aplica ahora el CRM, para que lo viejo quede como habría
-- quedado si hubiera existido antes:
--
--   SE JUNTAN     Leads del MISMO contacto, ninguno cerrado, y del mismo
--                 programa o sin programa. Queda el más avanzado —el que tiene
--                 el trabajo hecho— y el otro le entrega lo que tenga.
--
--   NO SE JUNTAN  Programas distintos: son dos ventas con dos montos, y
--                 juntarlas perdería una.
--
--                 Nada que esté cerrado —Ganado, Perdido, o con plata
--                 anotada—. Eso es historia y no se toca: unirlo movería las
--                 cuentas de un mes que ya se cerró.
--
--                 Leads de contactos distintos, aunque se llamen igual. Si son
--                 la misma persona con dos fichas, primero hay que unir las
--                 fichas con `fusionar_contactos`; esto no lo hace.
--
-- No se pierde nada de lo que estaba: `fusionar_oportunidades` se lleva al lead
-- que queda las notas, los adjuntos, los eventos, los links de pago, los
-- recordatorios, los seguimientos y los canales del que se va, y deja escrito
-- en la bitácora qué se unió.
--
-- Hay que estar conectado como dirección: la función lo exige.
-- ===========================================================================


-- ===========================================================================
-- PASO 1 — ¿CUÁNTOS HAY? (no cambia nada)
-- ===========================================================================
with junta as (
  select
    o.cliente_id,
    -- Los leads sin programa cuentan como un grupo aparte del de cada
    -- programa; abajo, en el paso 2, se resuelve a cuál se suman.
    coalesce(o.producto_id, -1) as programa,
    count(*) as cuantos
  from public.oportunidades o
  left join public.estados s on s.id = o.estado_id
  where coalesce(s.es_final, false) = false
    and coalesce(o.venta_cerrada, 0) = 0
  group by 1, 2
  having count(*) > 1
)
select
  count(*)                        as grupos_repetidos,
  sum(cuantos)                    as leads_involucrados,
  sum(cuantos) - count(*)         as leads_que_desaparecerian,
  count(distinct cliente_id)      as personas_afectadas
from junta;


-- ===========================================================================
-- PASO 2 — QUÉ SE UNIRÍA CON QUÉ (no cambia nada)
-- ===========================================================================
--
-- Una fila por grupo. `se_conserva` es el lead que queda; `se_absorben` los
-- que le entregan lo suyo y desaparecen.
--
-- Se conserva el más avanzado: primero el que llegó más lejos en el embudo,
-- después el que tiene monto, y al final el más viejo —que es el que tiene el
-- código más bajo y por el que la gente lo busca—.
-- ===========================================================================
with abiertas as (
  select o.*, coalesce(e.orden, 0) as etapa_orden
    from public.oportunidades o
    left join public.estados s on s.id = o.estado_id
    left join public.etapas  e on e.id = o.etapa_id
   where coalesce(s.es_final, false) = false
     and coalesce(o.venta_cerrada, 0) = 0
),
ordenadas as (
  select
    a.*,
    row_number() over (
      partition by a.cliente_id, coalesce(a.producto_id, -1)
      order by a.etapa_orden desc,
               (a.valor_oportunidad is not null) desc,
               a.fecha_registro asc,
               a.id asc
    ) as puesto
  from abiertas a
)
select
  c.nombre                                                as contacto,
  coalesce(p.nombre, '(sin programa)')                    as programa,
  max(case when o.puesto = 1 then o.codigo end)           as se_conserva,
  string_agg(case when o.puesto > 1 then o.codigo end,
             ', ' order by o.codigo)                      as se_absorben,
  count(*)                                                as eran,
  max(case when o.puesto = 1 then o.id end)               as id_conservar,
  array_agg(o.id) filter (where o.puesto > 1)             as ids_absorber
from ordenadas o
join public.clientes c on c.id = o.cliente_id
left join public.productos p on p.id = o.producto_id
group by c.nombre, coalesce(p.nombre, '(sin programa)'), o.cliente_id, coalesce(o.producto_id, -1)
having count(*) > 1
order by count(*) desc, c.nombre;


-- ===========================================================================
-- PASO 3 — JUNTARLOS (ESTE SÍ ESCRIBE)
-- ===========================================================================
--
-- Corre exactamente lo que mostró el paso 2, grupo por grupo. Al terminar dice
-- cuántos juntó.
--
-- Si algo saliera mal a mitad de camino, lo que ya se unió queda unido: cada
-- grupo es su propia operación. Volver a correrlo es seguro —lo que ya está
-- junto no aparece más en la lista—.
-- ===========================================================================
do $$
declare
  fila    record;
  hechos  int := 0;
  leads   int := 0;
begin
  for fila in
    with abiertas as (
      select o.*, coalesce(e.orden, 0) as etapa_orden
        from public.oportunidades o
        left join public.estados s on s.id = o.estado_id
        left join public.etapas  e on e.id = o.etapa_id
       where coalesce(s.es_final, false) = false
         and coalesce(o.venta_cerrada, 0) = 0
    ),
    ordenadas as (
      select
        a.*,
        row_number() over (
          partition by a.cliente_id, coalesce(a.producto_id, -1)
          order by a.etapa_orden desc,
                   (a.valor_oportunidad is not null) desc,
                   a.fecha_registro asc,
                   a.id asc
        ) as puesto
      from abiertas a
    )
    select
      max(case when o.puesto = 1 then o.id end)   as conservar,
      array_agg(o.id) filter (where o.puesto > 1) as absorber
    from ordenadas o
    group by o.cliente_id, coalesce(o.producto_id, -1)
    having count(*) > 1
  loop
    perform public.fusionar_oportunidades(fila.conservar, fila.absorber);
    hechos := hechos + 1;
    leads  := leads + array_length(fila.absorber, 1);
  end loop;

  raise notice 'Se juntaron % grupos; desaparecieron % leads repetidos.', hechos, leads;
end $$;


-- ===========================================================================
-- PASO 4 — COMPROBAR (no cambia nada)
-- ===========================================================================
-- Tiene que dar cero. Si no da cero, lo que quedó es de programas distintos o
-- está cerrado, que es lo que NO se junta a propósito.
-- ===========================================================================
select count(*) as grupos_que_quedan
from (
  select o.cliente_id
    from public.oportunidades o
    left join public.estados s on s.id = o.estado_id
   where coalesce(s.es_final, false) = false
     and coalesce(o.venta_cerrada, 0) = 0
   group by o.cliente_id, coalesce(o.producto_id, -1)
  having count(*) > 1
) q;
