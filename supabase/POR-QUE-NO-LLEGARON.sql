-- ============================================================================
-- ¿Por qué no llegaron los mensajes del envío masivo?
-- ============================================================================
--
-- UNA SOLA CONSULTA, A PROPÓSITO.
--
-- La versión anterior de este archivo traía cuatro. El editor de Supabase
-- muestra sólo el resultado de la ÚLTIMA cuando se pegan varias juntas, así que
-- lo que se veía era la lista de plantillas y no la respuesta de Meta, que es
-- lo único que contesta la pregunta. Acá va sola.
--
-- Se pega entero en Supabase → SQL Editor y se aprieta RUN. No cambia nada:
-- sólo lee.
--
-- ----------------------------------------------------------------------------
-- CÓMO SE LEE LO QUE SALGA
-- ----------------------------------------------------------------------------
--
--   UNA SOLA FILA, CON TODOS      El problema es de la CUENTA o de la
--   LOS MENSAJES ADENTRO          PLANTILLA. Los teléfonos no tienen nada que
--                                 ver: fallaron todos por lo mismo. Lo que diga
--                                 `lo_que_dijo_meta` es lo que hay que arreglar.
--
--   VARIAS FILAS, CON POCOS       El problema es de esos números en particular.
--   CADA UNA                      El resto salió bien.
--
--   `(sin motivo guardado)`       Es un envío anterior a que el CRM guardara la
--                                 respuesta de Meta. No hay dato que mirar.
-- ============================================================================

select
  e.nombre                                    as envio,
  to_char(e.creado_en, 'DD/MM HH24:MI')       as cuando,
  e.plantilla_nombre                          as plantilla,
  d.estado,
  count(*)                                    as cuantos,
  coalesce(d.motivo, '(sin motivo guardado)') as lo_que_dijo_meta
from public.envio_destinatarios d
join public.envios e on e.id = d.envio_id
group by e.nombre, e.creado_en, e.plantilla_nombre, d.estado, d.motivo
order by e.creado_en desc, cuantos desc;


-- ============================================================================
-- LAS OTRAS TRES, PARA CORRER APARTE SI HACEN FALTA
-- ============================================================================
--
-- Van comentadas para que no le tapen el resultado a la de arriba. Se descomenta
-- UNA por vez —seleccionándola y apretando RUN— cuando la primera no alcance.
--
-- ----------------------------------------------------------------------------
-- A) Uno por uno, por si el motivo cambia según el número.
--
--    El teléfono es el que SALIÓ, ya normalizado. Si acá se ve un número de
--    menos de once dígitos, o sin el 503 adelante, el problema es la ficha del
--    cliente y no Meta.
-- ----------------------------------------------------------------------------
--
-- select e.nombre as envio, d.nombre as persona, d.telefono as se_mando_a,
--        length(d.telefono) as digitos, d.estado, d.motivo as lo_que_dijo_meta
--   from public.envio_destinatarios d
--   join public.envios e on e.id = d.envio_id
--  order by e.creado_en desc, d.id
--  limit 100;
--
-- ----------------------------------------------------------------------------
-- B) ¿La plantilla pide los datos que se le mandaron?
--
--    Es la otra causa que hace fallar el 100%: la plantilla declara dos huecos
--    y se le manda uno, o al revés. `huecos_en_el_cuerpo` tiene que dar lo
--    mismo que `datos_que_se_mandaron`.
-- ----------------------------------------------------------------------------
--
-- select e.nombre as envio, e.plantilla_nombre as plantilla, e.idioma,
--        (select count(distinct m[1])
--           from regexp_matches(coalesce(e.cuerpo, ''),
--                               '\{\{\s*([A-Za-z0-9_-]+)\s*\}\}', 'g') m)
--          as huecos_en_el_cuerpo,
--        jsonb_array_length(coalesce(e.valores, '[]'::jsonb)) as datos_que_se_mandaron,
--        e.valores as que_se_puso
--   from public.envios e
--  order by e.creado_en desc
--  limit 20;
--
-- ----------------------------------------------------------------------------
-- C) El cuerpo exacto que tiene guardado el CRM, para comparar con Meta.
--
--    Si la plantilla se editó en Meta y no se sincronizó acá, la cuenta de
--    huecos no coincide y Meta rechaza todos los envíos.
-- ----------------------------------------------------------------------------
--
-- select p.nombre, p.idioma, p.estado, p.cuerpo
--   from public.plantillas p
--  order by p.nombre;
