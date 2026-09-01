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
-- OJO: LA PRIMERA VERSIÓN DE ESTO DABA CERO Y NO ERA CIERTO
-- ---------------------------------------------------------------------------
--
-- Agrupaba por `coalesce(producto_id, -1)`, o sea que trataba «sin programa»
-- como un programa más. Con eso, el caso más común de todos —un lead con
-- programa y otro vacío al lado— caía en dos grupos de uno y no lo veía.
--
-- Yolanda lo mostró: el paso 4 decía 0 y ella seguía con CRM-2626 colgando.
-- El CRM sí lo junta, porque su regla es que un lead sin programa no
-- contradice a ninguno y se suma al que haya. Acá faltaba esa mitad.
--
-- ---------------------------------------------------------------------------
-- QUÉ SE JUNTA Y QUÉ NO
-- ---------------------------------------------------------------------------
--
-- La misma regla que aplica ahora el CRM, para que lo viejo quede como habría
-- quedado si hubiera existido antes:
--
--   SE JUNTAN     Leads del MISMO contacto, ninguno cerrado, del mismo
--                 programa; y los que no tienen programa se suman al que sí
--                 lo tiene. Queda el más avanzado —el que tiene el trabajo
--                 hecho— y el otro le entrega lo que tenga.
--
--   NO SE JUNTAN  Programas distintos: son dos ventas con dos montos, y
--                 juntarlas perdería una.
--
--                 Nada que esté cerrado —Ganado, Perdido, o con plata
--                 anotada—. Eso es historia y no se toca: unirlo movería las
--                 cuentas de un mes que ya se cerró.
--
--                 Un lead sin programa cuando la persona tiene VARIOS
--                 programas abiertos: no hay forma de saber a cuál va sin
--                 adivinar, y en una corrida masiva adivinar mal se nota
--                 tarde. Queda para mirarlo a mano.
--
--                 Leads de contactos distintos, aunque se llamen igual. Si son
--                 la misma persona con dos fichas, primero hay que unir las
--                 fichas con `fusionar_contactos`; esto no lo hace.
--
-- ---------------------------------------------------------------------------
-- Y DOS FRENOS QUE NO ESTABAN, PUESTOS DESPUÉS DE MIRAR LA BASE DE VERDAD
-- ---------------------------------------------------------------------------
--
-- Al correrlo sobre los 1896 leads salieron 293 candidatos. Mirándolos:
--
--   290 eran cascarones vacíos    Sin programa, sin monto, sin asesor y sin
--                                 etapa. Exactamente lo que dejaba el botón de
--                                 unificar. Juntarlos no puede perder nada.
--
--   3 tenían trabajo hecho        Asesor y etapa avanzada. Uno de ellos
--                                 —Georgina Lino— tenía el lead absorbido MÁS
--                                 avanzado que el que se conservaba, y con año
--                                 y medio de diferencia. Ése no es un
--                                 duplicado, es otra consulta.
--
-- Así que el PASO 3 junta sólo los vacíos, y sólo cuando están a menos de un
-- mes del lead que se queda. Lo demás lo lista el PASO 5 para decidirlo
-- mirando, que es lo que corresponde cuando hay algo que perder.
--
-- No se pierde nada de lo que estaba: `fusionar_oportunidades` se lleva al lead
-- que queda las notas, los adjuntos, los eventos, los links de pago, los
-- recordatorios, los seguimientos y los canales del que se va, y deja escrito
-- en la bitácora qué se unió.
--
-- Hay que estar conectado como dirección: la función lo exige.
-- ===========================================================================



-- ===========================================================================
-- EL GRUPO AL QUE PERTENECE CADA LEAD ABIERTO
-- ===========================================================================
--
-- Los cuatro pasos usan esta misma vista, así que la regla está escrita una
-- sola vez. Se crea temporal: se va sola al cerrar la sesión del editor.
-- ===========================================================================
create or replace temp view leads_agrupados as
with abiertas as (
  select o.id, o.codigo, o.cliente_id, o.producto_id, o.fecha_registro,
         o.valor_oportunidad, o.vendedor_id, coalesce(e.orden, 0) as etapa_orden
    from public.oportunidades o
    left join public.estados s on s.id = o.estado_id
    left join public.etapas  e on e.id = o.etapa_id
   -- Lo cerrado es historia y no entra: ni Ganado ni Perdido ni con plata.
   where coalesce(s.es_final, false) = false
     and coalesce(o.venta_cerrada, 0) = 0
),
programas_por_persona as (
  select cliente_id, count(distinct producto_id) as cuantos
    from abiertas where producto_id is not null group by cliente_id
),
asignadas as (
  select a.*,
    case
      when a.producto_id is not null then a.producto_id
      -- Sin programa: se suma al único programa abierto que tenga la persona.
      when coalesce(p.cuantos, 0) = 1 then
        (select min(b.producto_id) from abiertas b
          where b.cliente_id = a.cliente_id and b.producto_id is not null)
      -- Sin programa y sin ninguno abierto: todos ésos son el mismo lead.
      when coalesce(p.cuantos, 0) = 0 then -1
      -- Varios programas abiertos: no se puede saber a cuál va. Queda solo,
      -- en un grupo propio, para que nunca se junte por su cuenta.
      else -1000 - a.id
    end as grupo
  from abiertas a
  left join programas_por_persona p on p.cliente_id = a.cliente_id
)
select a.*,
  row_number() over (
    partition by a.cliente_id, a.grupo
    -- Se conserva el que tiene el trabajo hecho: primero el que tiene
    -- programa, después el que llegó más lejos en el embudo, después el que
    -- tiene monto, y al final el más viejo —el del código más bajo, que es por
    -- el que la gente lo busca—.
    order by (a.producto_id is not null) desc,
             a.etapa_orden desc,
             (a.valor_oportunidad is not null) desc,
             a.fecha_registro asc,
             a.id asc
  ) as puesto
from asignadas a;


-- ===========================================================================
-- PASO 1 — ¿CUÁNTOS HAY? (no cambia nada)
-- ===========================================================================
with repetidos as (
  select cliente_id, grupo, count(*) as cuantos
    from leads_agrupados group by cliente_id, grupo having count(*) > 1
)
select
  (select count(*) from repetidos)                        as grupos_repetidos,
  (select coalesce(sum(cuantos), 0) from repetidos)       as leads_involucrados,
  (select coalesce(sum(cuantos) - count(*), 0)
     from repetidos)                                      as se_juntarian,
  (select count(*) from public.oportunidades)             as leads_en_total;


-- ===========================================================================
-- PASO 2 — QUÉ SE UNIRÍA CON QUÉ (no cambia nada)
-- ===========================================================================
--
-- `vacio` es la columna que importa: dice si el que se absorbe es un cascarón
-- —sin programa, sin monto, sin asesor, sin etapa— o si tiene trabajo hecho.
-- El PASO 3 junta sólo los vacíos.
-- ===========================================================================
with repetidos as (
  select cliente_id, grupo from leads_agrupados
   group by cliente_id, grupo having count(*) > 1
)
select
  c.nombre                                        as contacto,
  l.codigo,
  case when l.puesto = 1 then 'SE CONSERVA' else 'se absorbe' end as papel,
  coalesce(p.nombre, '(sin programa)')            as programa,
  coalesce(v.nombre, '(sin asesor)')              as asesor,
  l.valor_oportunidad                             as valor,
  l.fecha_registro,
  case when l.puesto = 1 then null
       when l.producto_id is null and l.valor_oportunidad is null
        and l.vendedor_id is null and l.etapa_orden = 0
       then 'vacío' else 'TIENE DATOS' end        as vacio
from leads_agrupados l
join repetidos r on r.cliente_id = l.cliente_id and r.grupo = l.grupo
join public.clientes c on c.id = l.cliente_id
left join public.productos  p on p.id = l.producto_id
left join public.vendedores v on v.id = l.vendedor_id
order by c.nombre, l.puesto;


-- ===========================================================================
-- PASO 3 — JUNTAR LOS VACÍOS (ESTE SÍ ESCRIBE)
-- ===========================================================================
--
-- Sólo los cascarones, y sólo cuando están a menos de un mes del lead que se
-- queda. Un lead vacío no tiene nada que perder, y la cercanía de fechas es lo
-- que separa «se cargó dos veces» de «volvió a preguntar el año siguiente».
--
-- Lo que tenga datos NO se toca acá: lo lista el PASO 5.
--
-- Cada grupo es su propia operación: si algo fallara a mitad, lo ya unido
-- queda unido. Volver a correrlo es seguro.
-- ===========================================================================
do $$
declare fila record; hechos int := 0;
begin
  for fila in
    with repetidos as (
      select cliente_id, grupo from leads_agrupados
       group by cliente_id, grupo having count(*) > 1
    ),
    marcadas as (
      select l.* from leads_agrupados l
      join repetidos r on r.cliente_id = l.cliente_id and r.grupo = l.grupo
    )
    select
      (select f.id from marcadas f
        where f.cliente_id = m.cliente_id and f.grupo = m.grupo and f.puesto = 1) as conservar,
      m.id as absorber
    from marcadas m
    where m.puesto > 1
      and m.producto_id is null and m.valor_oportunidad is null
      and m.vendedor_id is null and m.etapa_orden = 0
      and abs(m.fecha_registro - (select f.fecha_registro from marcadas f
              where f.cliente_id = m.cliente_id and f.grupo = m.grupo and f.puesto = 1)) <= 31
  loop
    perform public.fusionar_oportunidades(fila.conservar, array[fila.absorber]::bigint[]);
    hechos := hechos + 1;
  end loop;
  raise notice 'Se juntaron % leads vacíos.', hechos;
end $$;


-- ===========================================================================
-- PASO 4 — COMPROBAR (no cambia nada)
-- ===========================================================================
-- Ninguna nota puede quedar colgada de un lead que ya no existe.
-- ===========================================================================
select
  (select count(*) from public.oportunidades)          as leads_ahora,
  (select count(*) from public.oportunidad_notas)      as notas,
  (select count(*) from public.oportunidad_notas n
     where not exists (select 1 from public.oportunidades o
                        where o.id = n.oportunidad_id)) as notas_huerfanas;


-- ===========================================================================
-- PASO 5 — LO QUE QUEDÓ PARA MIRAR A MANO (no cambia nada)
-- ===========================================================================
--
-- Repetidos que el paso 3 no tocó a propósito: los que tienen trabajo hecho, y
-- los vacíos que están lejos en el tiempo. Son pocos y cada uno se decide
-- mirándolo. Para unir uno:
--
--   select public.fusionar_oportunidades(
--     (select id from public.oportunidades where codigo = 'CRM-XXXX'),   -- queda
--     array[(select id from public.oportunidades where codigo = 'CRM-YYYY')]::bigint[]
--   );
-- ===========================================================================
with repetidos as (
  select cliente_id, grupo from leads_agrupados
   group by cliente_id, grupo having count(*) > 1
)
select
  c.nombre                                        as contacto,
  l.codigo,
  case when l.puesto = 1 then 'SE CONSERVARÍA' else 'se absorbería' end as papel,
  coalesce(p.nombre, '(sin programa)')            as programa,
  coalesce(v.nombre, '(sin asesor)')              as asesor,
  coalesce(e.nombre, '(sin etapa)')               as etapa,
  l.fecha_registro
from leads_agrupados l
join repetidos r on r.cliente_id = l.cliente_id and r.grupo = l.grupo
join public.clientes c on c.id = l.cliente_id
left join public.productos  p on p.id = l.producto_id
left join public.vendedores v on v.id = l.vendedor_id
left join public.etapas     e on e.orden = l.etapa_orden
order by c.nombre, l.puesto;
