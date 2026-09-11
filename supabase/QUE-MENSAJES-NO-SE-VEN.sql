-- ============================================================================
-- ¿QUÉ SON LOS MENSAJES QUE SE VEN COMO «Mensaje» Y NADA MÁS?
-- ============================================================================
--
-- Correr en Supabase → SQL Editor. No cambia nada: sólo lee.
--
-- La escuela reportó una burbuja vacía que dice «Mensaje», de alguien que
-- llegó desde TikTok, y dice que hay varios más así.
--
-- La buena noticia es que NO se perdió nada. El CRM guarda el JSON completo de
-- cada mensaje en `mensajes.payload` desde el primer día, justamente para esto:
-- «hoy sólo se usa el texto, pero cuando lleguen fotos, audios o ubicaciones el
-- dato ya va a estar guardado en vez de haberse perdido».
--
-- Así que lo que llegó está en la base. Lo único que falta es que la pantalla
-- sepa leerlo. Este archivo dice QUÉ es, para arreglar lo que de verdad hay y
-- no lo que uno se imagina.
--
-- Son cuatro consultas. Copiá el resultado de las cuatro.

-- ----------------------------------------------------------------------------
-- 1. CUÁNTOS HAY Y DE QUÉ TIPO
-- ----------------------------------------------------------------------------
--
-- Los que salen como «Mensaje» son los que no tienen texto y tampoco archivo.
-- Acá se ve de qué tipo son y cuántos. Si la lista trae un tipo que no está en
-- la columna «¿la pantalla lo sabe dibujar?», ése es el que hay que agregar.

select
  m.tipo,
  count(*)                                          as cuantos,
  min(m.creado_en)::date                            as el_primero,
  max(m.creado_en)::date                            as el_ultimo,
  case when m.tipo in ('text','image','video','audio','document','sticker',
                       'location','contacts','llamada')
       then 'sí' else 'NO — se ve como «Mensaje»' end as pantalla
from public.mensajes m
where coalesce(m.texto, '') = ''
  and m.media_ruta is null
group by m.tipo
order by cuantos desc;

-- ----------------------------------------------------------------------------
-- 2. QUÉ TRAEN ADENTRO, SIN DATOS DE NADIE
-- ----------------------------------------------------------------------------
--
-- Sólo las CLAVES del JSON, no su contenido: alcanza para saber qué es cada
-- uno y evita sacar de la base el texto o el teléfono de un cliente.

select
  m.tipo,
  (select string_agg(k, ', ' order by k) from jsonb_object_keys(m.payload) k) as trae,
  count(*) as cuantos
from public.mensajes m
where coalesce(m.texto, '') = ''
  and m.media_ruta is null
  and m.payload is not null
group by m.tipo, trae
order by cuantos desc
limit 30;

-- ----------------------------------------------------------------------------
-- 3. ¿VIENEN DE UN ANUNCIO?
-- ----------------------------------------------------------------------------
--
-- Cuando alguien llega por un anuncio —de Facebook, Instagram o un enlace de
-- TikTok— WhatsApp puede mandar un bloque `referral` con de dónde salió, y a
-- veces un mensaje de tipo `request_welcome`, que es «abrió el chat» y no trae
-- texto porque la persona todavía no escribió nada.
--
-- Si esto devuelve filas, ahí está el origen del problema y además es
-- información que vale: dice qué anuncio trajo a cada quien.

select
  m.tipo,
  m.payload -> 'referral' ->> 'source_type' as clase,
  m.payload -> 'referral' ->> 'headline'    as titular_del_anuncio,
  m.payload -> 'referral' ->> 'source_url'  as de_donde,
  count(*)                                  as cuantos
from public.mensajes m
where m.payload ? 'referral'
group by 1, 2, 3, 4
order by cuantos desc
limit 20;

-- ----------------------------------------------------------------------------
-- 4. UN EJEMPLO COMPLETO, CON LO PERSONAL TAPADO
-- ----------------------------------------------------------------------------
--
-- El JSON entero de uno de los que no se ven, para saber exactamente qué
-- forma tiene. Se le quitan el id del mensaje y el teléfono antes de mostrarlo:
-- lo que hace falta es la ESTRUCTURA, no de quién es.

select
  m.tipo,
  m.creado_en,
  jsonb_pretty(m.payload - 'id' - 'from') as asi_llego
from public.mensajes m
where coalesce(m.texto, '') = ''
  and m.media_ruta is null
  and m.payload is not null
order by m.creado_en desc
limit 3;
