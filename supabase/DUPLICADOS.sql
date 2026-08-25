-- ¿Qué contactos están repetidos?
--
-- ------------------------------------------------------------------------
-- ESTO NO CAMBIA NADA
-- ------------------------------------------------------------------------
--
-- Es una consulta y nada más. Se puede correr las veces que haga falta y en
-- horario de trabajo. Fusionar es el paso siguiente y va aparte a propósito:
-- unir dos fichas mueve leads, notas y adjuntos de una a otra, y eso no se
-- hace sin que alguien mire primero qué se va a unir.
--
-- ------------------------------------------------------------------------
-- CÓMO BUSCA
-- ------------------------------------------------------------------------
--
-- Por los últimos ocho dígitos del teléfono, que es la misma regla que usa el
-- CRM para avisar «este contacto ya existe» y la que usa el webhook de
-- WhatsApp para no abrir una ficha nueva. Los teléfonos están guardados de
-- todas las formas —«7095-6875», «+503 7095 6875», «50370956875»— así que
-- comparar el texto crudo no encontraría nada.
--
-- Ocho y no nueve porque en El Salvador el número local tiene ocho dígitos y
-- el código de país puede estar o no. Menos de ocho empezaría a juntar gente
-- distinta.
--
-- ------------------------------------------------------------------------
-- CÓMO LEER EL RESULTADO
-- ------------------------------------------------------------------------
--
--   fichas        cuántos contactos distintos tienen ese mismo número.
--   ids           los ids de esas fichas. El primero es el más viejo, y es el
--                 que conviene conservar: es el que tiene más historia.
--   nombres       cómo se llama en cada una. Si dicen cosas muy distintas,
--                 puede que NO sean la misma persona —dos hermanas con un
--                 teléfono de casa— y entonces no hay que fusionar.
--   leads         cuántas oportunidades hay repartidas entre las fichas.
--   canales       por dónde entró cada una. Dos canales distintos es la señal
--                 típica del duplicado que estamos buscando.

with numeros as (
  select
    c.id,
    c.nombre,
    c.telefono,
    -- Sólo los dígitos, y de ahí los últimos ocho.
    right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 8) as clave
    from public.clientes c
   where length(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g')) >= 8
)
select
  n.clave                                              as ultimos_8,
  count(*)                                             as fichas,
  array_agg(n.id order by n.id)                        as ids,
  string_agg(distinct n.nombre, ' | ')                 as nombres,
  (select count(*) from public.oportunidades o
    where o.cliente_id = any(array_agg(n.id)))         as leads,
  (select string_agg(distinct ca.nombre, ', ')
     from public.oportunidades o
     join public.canales ca on ca.id = o.canal_id
    where o.cliente_id = any(array_agg(n.id)))         as canales
  from numeros n
 group by n.clave
having count(*) > 1
 order by count(*) desc, n.clave;
