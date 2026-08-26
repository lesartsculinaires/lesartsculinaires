-- ¿Qué leads quedaron duplicados, y de cuál de las dos formas?
--
-- ------------------------------------------------------------------------
-- ESTO NO CAMBIA NADA
-- ------------------------------------------------------------------------
--
-- Es una consulta. Se puede correr las veces que haga falta y en horario de
-- trabajo. Fusionar es el paso siguiente y va aparte a propósito: unir mueve
-- notas, adjuntos y conversaciones de un lado al otro, y eso no se hace sin
-- que alguien mire primero qué se va a unir.
--
-- ------------------------------------------------------------------------
-- SON DOS PROBLEMAS DISTINTOS Y SE ARREGLAN DISTINTO
-- ------------------------------------------------------------------------
--
--   DOS LEADS, UNA FICHA      la persona tiene una sola ficha pero le abrieron
--                             dos oportunidades. Es lo que hacía el webhook
--                             cuando llegaban varios mensajes juntos.
--                             Se arregla con `fusionar_oportunidades`.
--
--   DOS FICHAS, UN NÚMERO     la misma persona está cargada dos veces, cada
--                             una con su lead. Es lo que pasaba cuando el
--                             teléfono estaba guardado con guiones y el
--                             webhook no lo reconocía.
--                             Se arregla con `fusionar_contactos` primero
--                             —junta las fichas— y `fusionar_oportunidades`
--                             después, si quedaron dos leads.
--
-- La columna `forma` dice cuál es cuál.
--
-- ------------------------------------------------------------------------
-- NO TODO LO QUE SALE ACÁ ES UN ERROR
-- ------------------------------------------------------------------------
--
-- Un cliente puede tener dos leads a propósito: cursó un diplomado el año
-- pasado y ahora está preguntando por otro. Eso está bien y no se toca.
--
-- La firma del duplicado automático son tres cosas juntas, y por eso están
-- como columnas:
--
--   mismo_dia = true          los dos se abrieron el mismo día.
--   vendedores con 2 nombres  ninguna persona hubiera repartido el mismo
--                             cliente a dos asesores distintos.
--   etapas todas iniciales    ninguno avanzó: nadie los trabajó todavía.
--
-- Si los nombres de las fichas dicen cosas muy distintas puede que NO sean la
-- misma persona —dos hermanas con el teléfono de la casa—, y ahí no hay que
-- fusionar nada.
--
-- ------------------------------------------------------------------------
-- CÓMO USAR EL RESULTADO
-- ------------------------------------------------------------------------
--
--   conservar     el lead que conviene dejar: el más viejo, que es el que
--                 tiene la historia.
--   absorber      los que se le suman.
--
-- Con esos dos se arma la fusión, un renglón por fila y mirando cada una:
--
--   select public.fusionar_oportunidades(1054, array[1056]);

with leads as (
  select
    o.id,
    o.codigo,
    o.cliente_id,
    o.fecha_registro,
    c.nombre                                as cliente,
    c.telefono,
    -- Sólo los dígitos, y de ahí los últimos ocho: es la misma regla que usa
    -- el CRM para avisar «este contacto ya existe». Ocho y no nueve porque el
    -- número local salvadoreño tiene ocho y el código de país puede venir o no.
    nullif(right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 8), '')
                                            as digitos,
    coalesce(v.nombre, 'sin asignar')       as vendedor,
    coalesce(e.nombre, 'sin etapa')         as etapa,
    coalesce(e.orden, 0)                    as orden_etapa
    from public.oportunidades o
    join public.clientes   c on c.id = o.cliente_id
    left join public.vendedores v on v.id = o.vendedor_id
    left join public.etapas     e on e.id = o.etapa_id
),

/*
 * La persona, no la ficha.
 *
 * Se agrupa por el número cuando lo hay, así los dos casos —dos leads en una
 * ficha y dos fichas del mismo número— caen en el mismo renglón. Sin teléfono
 * no queda más que agrupar por ficha.
 */
por_persona as (
  select
    case
      when length(coalesce(digitos, '')) = 8 then 'tel:' || digitos
      else 'ficha:' || cliente_id::text
    end as persona,
    l.*
    from leads l
)

select
  case when count(distinct cliente_id) > 1
       then 'dos fichas, un número'
       else 'dos leads, una ficha'
  end                                                  as forma,
  -- Los dos nombres y los dos teléfonos, no uno de cada uno: es lo que deja
  -- ver de un vistazo que «7797-2597» y «50377972597» son el mismo número
  -- escrito distinto, y que los nombres son de la misma persona y no de dos.
  array_agg(distinct cliente)                          as nombres,
  array_agg(distinct telefono)                         as telefonos,
  count(*)                                             as leads,
  count(distinct cliente_id)                           as fichas,
  min(id)                                              as conservar,
  (array_agg(id order by id))[2:]                      as absorber,
  array_agg(codigo order by id)                        as codigos,
  array_agg(distinct vendedor)                         as vendedores,
  array_agg(distinct etapa)                            as etapas,
  array_agg(distinct cliente_id order by cliente_id)   as fichas_ids,
  min(fecha_registro) = max(fecha_registro)            as mismo_dia,
  max(orden_etapa) <= 1                                as ninguno_avanzo,
  min(fecha_registro)                                  as primero,
  max(fecha_registro)                                  as ultimo
  from por_persona
 group by persona
having count(*) > 1
 -- Los más nuevos arriba: son los que todavía se están trabajando y los que
 -- más molestan si están repartidos entre dos asesores.
 order by max(fecha_registro) desc, min(cliente)
 limit 200;
