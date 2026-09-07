-- ============================================================================
-- ¿Por qué no llegaron los mensajes del envío masivo?
-- ============================================================================
--
-- Se pega entero en Supabase → SQL Editor y se aprieta RUN. No cambia nada:
-- sólo lee.
--
-- El CRM YA guarda la respuesta de Meta, mensaje por mensaje, en
-- `envio_destinatarios.motivo`. Lo que no hacía era mostrarla: la pantalla
-- decía «el número no tiene WhatsApp o Meta los rechazó», que es una
-- suposición escrita a mano y no lo que contestó Meta. Esto lo saca.
--
-- Son cuatro consultas. La PRIMERA es la que contesta la pregunta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. LO QUE CONTESTÓ META, AGRUPADO
-- ----------------------------------------------------------------------------
--
-- Si los cinco fallaron por lo mismo, el problema es de la cuenta o de la
-- plantilla —no de los números—, y acá va a salir una sola fila.

select
  e.nombre                                as envio,
  to_char(e.creado_en, 'DD/MM HH24:MI')   as cuando,
  e.plantilla_nombre                      as plantilla,
  d.estado,
  coalesce(d.motivo, '(sin motivo guardado)') as lo_que_dijo_meta,
  count(*)                                as cuantos
from public.envio_destinatarios d
join public.envios e on e.id = d.envio_id
group by 1, 2, 3, 4, 5, e.creado_en
order by e.creado_en desc, cuantos desc;


-- ----------------------------------------------------------------------------
-- 2. UNO POR UNO, POR SI EL MOTIVO CAMBIA SEGÚN EL NÚMERO
-- ----------------------------------------------------------------------------
--
-- El teléfono es el que SALIÓ, ya normalizado. Si acá se ve un número raro
-- —menos de once dígitos, o sin el 503 adelante— el problema es la ficha y no
-- Meta.

select
  e.nombre                            as envio,
  d.nombre                            as persona,
  d.telefono                          as se_mando_a,
  length(d.telefono)                  as digitos,
  d.estado,
  d.motivo                            as lo_que_dijo_meta,
  d.wa_id                             as id_en_meta
from public.envio_destinatarios d
join public.envios e on e.id = d.envio_id
order by e.creado_en desc, d.id
limit 100;


-- ----------------------------------------------------------------------------
-- 3. ¿LA PLANTILLA PIDE LOS DATOS QUE SE LE MANDARON?
-- ----------------------------------------------------------------------------
--
-- Es la otra causa que hace fallar el 100%: la plantilla declara dos huecos y
-- se le manda uno, o al revés. `huecos_en_el_cuerpo` tiene que dar lo mismo que
-- `datos_que_se_mandaron`.

select
  e.nombre                                                as envio,
  e.plantilla_nombre                                      as plantilla,
  e.idioma,
  -- Cuántos `{{...}}` distintos tiene el cuerpo guardado.
  (select count(distinct m[1])
     from regexp_matches(coalesce(e.cuerpo, ''), '\{\{\s*([A-Za-z0-9_-]+)\s*\}\}', 'g') m)
                                                          as huecos_en_el_cuerpo,
  jsonb_array_length(coalesce(e.valores, '[]'::jsonb))     as datos_que_se_mandaron,
  e.valores                                               as que_se_puso
from public.envios e
order by e.creado_en desc
limit 20;


-- ----------------------------------------------------------------------------
-- 4. EL CUERPO EXACTO QUE TIENE GUARDADO EL CRM
-- ----------------------------------------------------------------------------
--
-- Para comparar contra el aprobado en Meta (WhatsApp Manager → Plantillas de
-- mensaje). Si el CRM tiene una versión vieja —porque la plantilla se editó en
-- Meta y no se sincronizó acá— la cuenta de huecos no coincide y Meta rechaza
-- todos los envíos.

select
  p.nombre,
  p.idioma,
  p.estado,
  p.cuerpo
from public.plantillas p
order by p.nombre;
