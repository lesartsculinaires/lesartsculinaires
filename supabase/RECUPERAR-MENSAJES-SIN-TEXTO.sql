-- ============================================================================
-- RECUPERAR LOS MENSAJES QUE SE VEN COMO «Mensaje»
-- ============================================================================
--
-- Correr en Supabase → SQL Editor, DESPUÉS de mirar el resultado de
-- `QUE-MENSAJES-NO-SE-VEN.sql`.
--
-- ----------------------------------------------------------------------------
-- QUÉ HACE, Y POR QUÉ SE PUEDE CORRER TRANQUILO
-- ----------------------------------------------------------------------------
--
-- El arreglo del código hace que los mensajes NUEVOS se lean bien. Pero los que
-- ya entraron quedaron guardados con el texto vacío, y esos no se arreglan
-- solos: hay que volver a leerlos.
--
-- Se pueden volver a leer porque nunca se perdió nada. El CRM guarda el JSON
-- completo de cada mensaje en `mensajes.payload` desde el primer día. Esto lee
-- ese JSON y completa el texto que faltaba, con las mismas reglas que ahora
-- usa el código.
--
-- Es seguro por tres motivos:
--
--   SÓLO TOCA LOS VACÍOS      La condición es `texto` vacío Y sin archivo. Un
--                             mensaje que ya se lee no entra en el update, así
--                             que no puede pisar lo que escribió nadie.
--
--   NO INVENTA NADA           Lo que escribe sale del JSON que mandó Meta. Si
--                             el JSON no trae de dónde sacarlo, lo deja como
--                             está en vez de poner una descripción imaginada.
--
--   SE PUEDE CORRER DOS VECES La segunda vez no encuentra nada que hacer,
--                             porque los que arregló ya no están vacíos.
--
-- Lo que NO hace: tocar las fotos, los audios ni los documentos. Ésos no llevan
-- texto a propósito —el archivo se ve— y ponerles una descripción haría que
-- pareciera que la persona escribió algo.
--
-- Al final dice cuántos arregló y cuántos quedaron.

begin;

update public.mensajes m
   set texto = v.nuevo
  from (
    select
      x.id,
      case
        -- Alguien que llegó por un anuncio y abrió el chat sin escribir.
        -- Es el caso de los que vienen de TikTok, Facebook o Instagram.
        when x.tipo = 'request_welcome' then
          coalesce(
            case
              when x.titular is not null then 'Abrió el chat desde ' || x.de_donde || ': «' || x.titular || '»'
              when x.payload ? 'referral' then 'Abrió el chat desde ' || x.de_donde
            end,
            'Abrió el chat'
          )

        -- Un pedido del catálogo de WhatsApp.
        when x.tipo = 'order' then
          'Pedido del catálogo: '
          || coalesce(jsonb_array_length(x.payload -> 'order' -> 'product_items'), 0)
          || case when coalesce(jsonb_array_length(x.payload -> 'order' -> 'product_items'), 0) = 1
                  then ' producto' else ' productos' end
          || coalesce(' — ' || nullif(trim(x.payload -> 'order' ->> 'text'), ''), '')

        -- Una ubicación con nombre o dirección.
        when x.tipo = 'location' then
          nullif(
            '📍 ' || concat_ws(
              ' — ',
              nullif(trim(x.payload -> 'location' ->> 'name'), ''),
              nullif(trim(x.payload -> 'location' ->> 'address'), '')
            ),
            '📍 '
          )

        -- Uno o varios contactos compartidos.
        when x.tipo = 'contacts' then
          nullif(
            'Contacto: ' || coalesce((
              select string_agg(trim(c -> 'name' ->> 'formatted_name'), ', ')
                from jsonb_array_elements(x.payload -> 'contacts') c
               where nullif(trim(c -> 'name' ->> 'formatted_name'), '') is not null
            ), ''),
            'Contacto: '
          )

        -- Avisos de WhatsApp: «cambió de número» y parecidos.
        when x.tipo = 'system' then
          nullif(trim(x.payload -> 'system' ->> 'body'), '')

        /*
         * Los que WhatsApp no deja recibir por la API de negocios.
         *
         * El tipo que llega de verdad es `unsupported` —así salió en la base de
         * la escuela, con el error 131051—, no `unknown`. Van los dos porque
         * cuál use Meta no lo decide este archivo.
         *
         * El 131051 son las encuestas, los mensajes que se borran solos y los
         * eventos: cosas que WhatsApp simplemente no entrega acá. Se dice en
         * castellano y con qué hacer, porque hay algo concreto que hacer.
         */
        when x.tipo in ('unsupported', 'unknown') then
          case
            when (x.payload -> 'errors' -> 0 ->> 'code') = '131051' then
              'La persona mandó algo que WhatsApp no deja recibir acá (una encuesta, '
              || 'un mensaje que se borra solo o algo parecido). Hay que pedirle que lo '
              || 'reenvíe como texto o como foto.'
            else
              coalesce(
                'No se pudo recibir este mensaje ('
                  || nullif(trim(x.payload -> 'errors' -> 0 ->> 'title'), '') || ')',
                'No se pudo recibir este mensaje'
              )
          end

        /*
         * Reacciones que quedaron guardadas como mensajes.
         *
         * No deberían existir: el webhook las saca antes de que entren a la
         * tabla. Pero las que entraron antes de que eso existiera siguen ahí, y
         * cada una es una burbuja vacía en medio de una conversación.
         */
        when x.tipo = 'reaction' then
          coalesce(
            'Reaccionó con ' || nullif(trim(x.payload -> 'reaction' ->> 'emoji'), ''),
            'Quitó su reacción'
          )

        -- Un texto que quedó vacío por algún motivo, pero el JSON lo tiene.
        when x.tipo = 'text' then
          nullif(trim(x.payload -> 'text' ->> 'body'), '')

        -- Botones y listas de un menú.
        when x.tipo = 'button' then
          nullif(trim(x.payload -> 'button' ->> 'text'), '')
        when x.tipo = 'interactive' then
          coalesce(
            nullif(trim(x.payload -> 'interactive' -> 'button_reply' ->> 'title'), ''),
            nullif(trim(x.payload -> 'interactive' -> 'list_reply' ->> 'title'), '')
          )

        else null
      end as nuevo
    from (
      select
        m2.id,
        m2.tipo,
        m2.payload,
        nullif(trim(coalesce(
          m2.payload -> 'referral' ->> 'headline',
          m2.payload -> 'referral' ->> 'body'
        )), '') as titular,
        case lower(coalesce(m2.payload -> 'referral' ->> 'source_type', ''))
          when 'ad'   then 'un anuncio'
          when 'post' then 'una publicación'
          else 'un enlace'
        end as de_donde
      from public.mensajes m2
      where coalesce(m2.texto, '') = ''
        and m2.media_ruta is null
        and m2.payload is not null
    ) x
  ) v
 where m.id = v.id
   and v.nuevo is not null
   and coalesce(m.texto, '') = '';

commit;

-- ---------------------------------------------------------------- cómo quedó

select
  count(*) filter (where coalesce(texto, '') = '' and media_ruta is null)
    as todavia_sin_texto,
  count(*) filter (where coalesce(texto, '') <> '')
    as con_texto,
  count(*) as total
from public.mensajes;

-- Y si quedó alguno sin texto, de qué tipo es: eso es lo que hay que reportar
-- para agregarlo, porque quiere decir que el JSON no traía de dónde sacarlo.
select tipo, count(*) as cuantos
from public.mensajes
where coalesce(texto, '') = ''
  and media_ruta is null
group by tipo
order by cuantos desc;
