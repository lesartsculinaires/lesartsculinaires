-- ============================================================================
-- ¿EL CÓDIGO DE VERIFICACIÓN LLEGÓ AL CRM, O META NO LO MANDÓ?
-- ============================================================================
--
-- Correr en Supabase → SQL Editor. No cambia nada: sólo lee.
--
-- ----------------------------------------------------------------------------
-- QUÉ SE ESTÁ PREGUNTANDO
-- ----------------------------------------------------------------------------
--
-- La escuela recibe en este número el código de verificación que manda TikTok,
-- y esos mensajes llegan con `type: "unsupported"` y el error 131051.
--
-- La pregunta no es si el CRM lo sabe dibujar. Es anterior: **¿Meta mandó el
-- contenido?** Son dos cosas distintas y la diferencia decide todo:
--
--   SI EL CUERPO ESTÁ EN EL JSON   El CRM lo puede mostrar, y a partir del
--                                  despliegue de hoy lo muestra solo.
--
--   SI NO ESTÁ                     No hay nada que hacer del lado del CRM. Un
--                                  código que Meta no entregó no se puede
--                                  sacar de ningún lado: no está guardado en
--                                  ninguna parte, ni acá ni en Supabase.
--
-- Esto lo contesta mirando el JSON completo de los que ya llegaron.
--
-- No saca datos de nadie: se le quitan el id y el teléfono, y lo que se busca
-- son las CLAVES del JSON, no su contenido.

-- ----------------------------------------------------------------------------
-- 1. ¿HAY ALGO DE CONTENIDO ADENTRO?
-- ----------------------------------------------------------------------------
--
-- `trae_texto` es la respuesta. Si dice «NO» en todas las filas, Meta mandó el
-- aviso sin el mensaje y el código no está en la base.

select
  m.creado_en,
  m.tipo,
  m.payload -> 'errors' -> 0 ->> 'code'  as codigo_de_error,
  m.payload -> 'errors' -> 0 ->> 'title' as que_dijo_meta,
  (select string_agg(k, ', ' order by k) from jsonb_object_keys(m.payload) k) as claves,
  case
    when coalesce(
           nullif(trim(m.payload -> 'text' ->> 'body'), ''),
           nullif(trim(m.payload ->> 'body'), ''),
           nullif(trim(m.payload -> 'button' ->> 'text'), '')
         ) is not null
    then 'SÍ — el CRM lo puede mostrar'
    else 'NO — Meta no mandó el contenido'
  end as trae_texto
from public.mensajes m
where m.tipo in ('unsupported', 'unknown')
order by m.creado_en desc
limit 20;

-- ----------------------------------------------------------------------------
-- 2. EL JSON ENTERO DE UNO, PARA NO ADIVINAR
-- ----------------------------------------------------------------------------
--
-- Sin el id ni el teléfono. Si adentro no hay ningún campo con texto, está
-- contestado: no llegó.

select
  m.creado_en,
  jsonb_pretty(m.payload - 'id' - 'from') as asi_llego
from public.mensajes m
where m.tipo in ('unsupported', 'unknown')
order by m.creado_en desc
limit 3;

-- ----------------------------------------------------------------------------
-- 3. PARA DESPUÉS DE PEDIR UN CÓDIGO NUEVO
-- ----------------------------------------------------------------------------
--
-- Pedile a TikTok que mande el código otra vez y corré ESTA sola. Muestra todo
-- lo que entró en los últimos quince minutos, de cualquier tipo.
--
-- Sirve para dos cosas: ver si el mensaje nuevo llegó con contenido, y
-- descartar que esté entrando por otro tipo distinto del que veníamos mirando.

select
  m.creado_en,
  m.tipo,
  coalesce(nullif(m.texto, ''), '(sin texto)') as lo_que_se_ve,
  (select string_agg(k, ', ' order by k) from jsonb_object_keys(m.payload) k) as claves
from public.mensajes m
where m.creado_en > now() - interval '15 minutes'
order by m.creado_en desc;
