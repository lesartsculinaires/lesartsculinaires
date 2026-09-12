begin;

-- ============================================================================
-- De qué anuncio vino cada lead
-- ============================================================================
--
-- Lo que pidió la escuela: «que tenga una visualización lo más similar a
-- WhatsApp, por motivos de ventas y de marketing, que vean de dónde viene esa
-- información cuando entra el lead».
--
-- ----------------------------------------------------------------------------
-- EL DATO YA ESTABA LLEGANDO
-- ----------------------------------------------------------------------------
--
-- Cuando alguien toca un anuncio de Facebook o Instagram que abre WhatsApp,
-- Meta adjunta al mensaje un bloque `referral` con el titular del anuncio, su
-- texto, la miniatura y la dirección de origen. Eso viene en el webhook desde
-- siempre y se guarda entero en `mensajes.payload`.
--
-- O sea que no hay que pedirle nada a Meta ni activar ningún permiso: el dato
-- está en la base. Lo que falta es sacarlo de adentro del JSON para poder
-- mostrarlo y, sobre todo, para poder AGRUPAR por él.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EN LAS DOS TABLAS Y NO EN UNA
-- ----------------------------------------------------------------------------
--
-- Porque son dos preguntas distintas y las hacen dos áreas distintas.
--
--   mensajes.origen        DE ESTE MENSAJE. Es donde Meta lo manda y es lo que
--                          WhatsApp dibuja: una tarjeta arriba de la burbuja
--                          que dice de qué anuncio salió. Fiel a lo que pasó.
--
--   conversaciones.origen  DE ESTA PERSONA. Es lo que marketing necesita:
--                          «¿cuántos leads trajo la campaña de Pastelería?».
--                          Preguntarlo sobre los mensajes obligaría a recorrer
--                          la tabla grande y a decidir cuál de varios vale.
--
-- Se guarda el PRIMERO que llegó y no el último, a propósito. Alguien que vino
-- por la pauta de Pastelería en marzo y en agosto toca otra de Barismo no
-- cambia de origen: el mérito de haber traído a esa persona es de la primera.
-- Cambiarlo haría que los números de una campaña vieja se movieran solos meses
-- después, y ningún reporte se puede leer así.
--
-- Es `jsonb` y no columnas sueltas porque Meta agrega campos cada tanto —hoy
-- trae titular, cuerpo, miniatura y `ctwa_clid`— y cada campo nuevo obligaría
-- a una migración más. Lo que se consulta seguido tiene su índice abajo.
--
-- Se puede correr con gente trabajando, y dos veces.

alter table public.mensajes
  add column if not exists origen jsonb;

alter table public.conversaciones
  add column if not exists origen jsonb;

comment on column public.mensajes.origen is
  'De qué anuncio vino ESTE mensaje, normalizado del `referral` de Meta.';
comment on column public.conversaciones.origen is
  'De qué anuncio vino esta persona la PRIMERA vez. No cambia: es lo que sostiene los números de cada campaña.';

/*
 * El índice es por `red` y por `campana`, que es como se pregunta.
 *
 * «Cuántos leads trajo tal anuncio» y «cuántos vinieron de Instagram este mes»
 * son las dos consultas que va a hacer marketing. Sin índice, cada una recorre
 * las conversaciones enteras; con él, va derecho.
 *
 * Parcial —sólo las filas que tienen origen— porque la mayoría no vino de una
 * pauta y no tiene sentido ocupar lugar con ellas.
 */
create index if not exists ix_conversaciones_origen_red
  on public.conversaciones ((origen ->> 'red'), (origen ->> 'campana'))
  where origen is not null;

commit;

-- ------------------------------------------------- lo que ya estaba guardado

/*
 * Se rescata de `mensajes.payload` lo que entró antes de que existieran estas
 * columnas.
 *
 * Es lo mismo que se hizo con los mensajes que se veían como «Mensaje»: el JSON
 * completo está guardado desde el primer día, así que los leads viejos no
 * empiezan de cero. Para marketing eso es la diferencia entre tener historia y
 * tener nada más lo de esta semana.
 *
 * Sólo toca las filas que todavía no tienen origen, así que correrlo dos veces
 * no cambia nada.
 */
update public.mensajes m
   set origen = jsonb_strip_nulls(jsonb_build_object(
         'red',      case lower(coalesce(m.payload -> 'referral' ->> 'source_type', ''))
                       when 'ad'   then 'anuncio'
                       when 'post' then 'publicacion'
                       else 'enlace'
                     end,
         'campana',  nullif(trim(m.payload -> 'referral' ->> 'source_id'), ''),
         'titular',  nullif(trim(m.payload -> 'referral' ->> 'headline'), ''),
         'cuerpo',   nullif(trim(m.payload -> 'referral' ->> 'body'), ''),
         'url',      nullif(trim(m.payload -> 'referral' ->> 'source_url'), ''),
         'medio',    nullif(trim(m.payload -> 'referral' ->> 'media_type'), ''),
         'imagen',   coalesce(
                       nullif(trim(m.payload -> 'referral' ->> 'image_url'), ''),
                       nullif(trim(m.payload -> 'referral' ->> 'thumbnail_url'), '')
                     ),
         'clic',     nullif(trim(m.payload -> 'referral' ->> 'ctwa_clid'), '')
       ))
 where m.payload ? 'referral'
   and m.origen is null;

/*
 * Y el de cada conversación: el PRIMERO de sus mensajes que traiga uno.
 *
 * `distinct on` con el orden por fecha devuelve una fila por conversación, la
 * más vieja. Es la regla de arriba: el mérito es de la campaña que trajo a la
 * persona, no de la última que tocó.
 */
update public.conversaciones v
   set origen = p.origen
  from (
    select distinct on (m.conversacion_id)
           m.conversacion_id, m.origen
      from public.mensajes m
     where m.origen is not null
     order by m.conversacion_id, m.creado_en asc, m.id asc
  ) p
 where p.conversacion_id = v.id
   and v.origen is null;

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'mensajes' and column_name = 'origen'
  ) then '✓ el mensaje guarda su origen' else '· falta' end       as en_el_mensaje,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'conversaciones' and column_name = 'origen'
  ) then '✓ y la conversación el suyo' else '· falta' end          as en_el_hilo,
  (select count(*) from public.conversaciones where origen is not null)
                                                                   as hilos_con_origen,
  (select count(*) from public.mensajes where origen is not null)   as mensajes_con_origen;

-- Y de qué campañas vinieron, que es la pregunta que esto vino a contestar.
select
  origen ->> 'red'     as tipo,
  origen ->> 'titular' as anuncio,
  count(*)             as leads
from public.conversaciones
where origen is not null
group by 1, 2
order by leads desc
limit 20;
