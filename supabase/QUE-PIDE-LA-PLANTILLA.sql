-- ============================================================================
-- ¿Qué piezas tiene la plantilla, además del texto?
-- ============================================================================
--
-- Se pega entero en Supabase → SQL Editor y RUN. Sólo lee.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ ESTA CONSULTA
-- ----------------------------------------------------------------------------
--
-- Meta contestó `(#131008) Required parameter is missing`: al envío le falta
-- algo que la plantilla exige. No es la cuenta —eso da otro error— ni son los
-- números.
--
-- Una plantilla de WhatsApp no es sólo texto. Puede tener hasta cuatro piezas:
--
--   HEADER    Un encabezado. Puede ser texto, o una IMAGEN, un video o un PDF.
--             Si lo tiene, en CADA envío hay que mandarle esa pieza.
--   BODY      El texto. Es lo único que el CRM está mandando hoy.
--   FOOTER    Una línea al pie. No lleva datos.
--   BUTTONS   Botones. Los de «ir a una dirección» con parte variable también
--             piden su dato en cada envío.
--
-- El CRM guarda la definición completa que le da Meta, pero al mandar sólo arma
-- el BODY. Si esta plantilla tiene un HEADER con imagen o un botón con parte
-- variable, Meta la rechaza entera —y ése es exactamente el error que salió—.
--
-- ----------------------------------------------------------------------------
-- CÓMO SE LEE LO QUE SALGA
-- ----------------------------------------------------------------------------
--
--   Sólo una fila, `BODY`          La plantilla es sólo texto y el problema es
--                                  otro. Mandame el resultado igual.
--
--   Una fila `HEADER` con          Es esto. Esa plantilla necesita que se le
--   formato IMAGE/VIDEO/DOCUMENT   mande la imagen (o el video, o el PDF) en
--                                  cada envío, y el CRM no lo hace todavía.
--
--   Una fila `HEADER` con          El encabezado lleva un dato variable, y
--   formato TEXT y {{...}}         tampoco se está mandando.
--
--   Una fila `BUTTONS` con         Un botón de dirección con parte variable
--   `url` que tenga {{...}}        pide su dato en cada envío.
-- ============================================================================

select
  p.nombre                                   as plantilla,
  p.estado,
  pieza.orden,
  upper(pieza.c->>'type')                    as pieza,
  upper(coalesce(pieza.c->>'format', '—'))   as formato,
  -- El texto de esa pieza, si tiene. Acá se ven los {{...}} del encabezado.
  pieza.c->>'text'                           as texto,
  -- Lo que Meta guarda como ejemplo. Si hay un `header_handle`, el encabezado
  -- es una imagen o un archivo, y eso es lo que falta mandar.
  pieza.c->'example'                         as ejemplo,
  -- Los botones, con sus direcciones. Un `url` con {{...}} pide dato.
  pieza.c->'buttons'                         as botones
from public.plantillas p
cross join lateral (
  select c, ord as orden
    from jsonb_array_elements(coalesce(p.payload->'components', '[]'::jsonb))
      with ordinality as t(c, ord)
) as pieza
where p.estado = 'APPROVED'
order by p.nombre, pieza.orden;
