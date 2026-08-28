-- Borrar una base que entró dos veces.
--
-- ------------------------------------------------------------------------
-- ESTO SÍ BORRA. LEELO ANTES DE CORRERLO.
-- ------------------------------------------------------------------------
--
-- El primer bloque no toca nada: muestra qué bases están repetidas y qué se
-- borraría. Corré ESE primero y mirá el resultado.
--
-- El segundo borra, y está comentado a propósito. Hay que descomentarlo y
-- poner a mano el número de la base que sobra, el que salga en la columna
-- `sobra` del primer bloque. No se automatiza el borrado: son cientos de
-- fichas y la decisión de cuál copia se va la tiene que tomar una persona
-- mirando.
--
-- ------------------------------------------------------------------------
-- POR QUÉ PASÓ
-- ------------------------------------------------------------------------
--
-- El botón «Importar» del repaso no se apagaba mientras la carga corría. Con
-- trescientas filas eso son varios segundos con el botón encendido y el mismo
-- texto de siempre, así que un segundo toque —o un doble toque de tablet—
-- arrancaba la importación otra vez desde cero. La segunda vuelta empezaba sin
-- base abierta, así que abría otra y volvía a cargar el archivo entero.
--
-- Ya está arreglado en el CRM: el botón se apaga y dice «Importando…», y
-- además hay un candado que no depende de que la pantalla llegue a repintarse.
-- Esto es sólo para limpiar lo que quedó de antes.
--
-- ------------------------------------------------------------------------
-- CUÁL DE LAS DOS CONVIENE BORRAR
-- ------------------------------------------------------------------------
--
-- La más nueva, que es la que propone la columna `sobra`. Las dos traen lo
-- mismo, pero si alguien ya trabajó alguna ficha —le puso etapa, le escribió
-- una nota— lo más probable es que haya sido sobre la que apareció primero.
--
-- Si la columna `leads_trabajados_en_la_que_sobra` trae algo distinto de cero,
-- PARÁ: en esa copia hay trabajo hecho y borrarla lo perdería. Avisá y se
-- resuelve fusionando en vez de borrando.

-- ============================================ 1. qué está repetido (no toca nada)

with repetidas as (
  select archivo,
         date_trunc('minute', creado_en) as minuto,
         min(id)                         as conservar,
         max(id)                         as sobra,
         count(*)                        as veces
    from public.importaciones
   group by archivo, date_trunc('minute', creado_en)
  having count(*) > 1
)
select
  r.archivo,
  to_char(r.minuto at time zone 'America/El_Salvador', 'DD/MM/YYYY HH24:MI') as subida,
  r.veces                                                        as veces_que_entro,
  r.conservar                                                    as conservar,
  r.sobra                                                        as sobra,
  (select count(*) from public.oportunidades o
    where o.importacion_id = r.conservar)                        as leads_en_la_que_queda,
  (select count(*) from public.oportunidades o
    where o.importacion_id = r.sobra)                            as leads_en_la_que_sobra,
  /*
   * Señal de alto. Un lead «trabajado» es el que salió de la primera etapa, o
   * tiene valor, o alguien le escribió una nota. Si acá hay algo, borrar esa
   * copia perdería trabajo de verdad.
   */
  (select count(*) from public.oportunidades o
     left join public.etapas e on e.id = o.etapa_id
    where o.importacion_id = r.sobra
      and (coalesce(e.orden, 0) > 1
           or o.valor_oportunidad is not null
           or exists (select 1 from public.oportunidad_notas n
                       where n.oportunidad_id = o.id)))          as leads_trabajados_en_la_que_sobra
  from repetidas r
 order by r.minuto desc;

-- ============================================ 2. el borrado (descomentar)
--
-- Cambiá el 000 por el número de la columna `sobra` y corré sólo este bloque.
--
-- Borra los leads de esa copia y, con ellos, los clientes que hayan quedado
-- sin ningún lead. Los clientes que además tengan otro lead NO se tocan: son
-- gente que ya estaba en el CRM antes de esta carga.
--
-- begin;
--
-- create temp table a_borrar as
--   select o.id as oportunidad_id, o.cliente_id
--     from public.oportunidades o
--    where o.importacion_id = 000;
--
-- delete from public.oportunidades
--  where id in (select oportunidad_id from a_borrar);
--
-- delete from public.clientes c
--  where c.id in (select cliente_id from a_borrar)
--    and not exists (select 1 from public.oportunidades o where o.cliente_id = c.id);
--
-- delete from public.importaciones where id = 000;
--
-- select (select count(*) from a_borrar)                  as leads_borrados,
--        (select count(*) from public.importaciones
--          where id = 000)                                as base_borrada_si_es_cero;
--
-- commit;
