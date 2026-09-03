-- ===========================================================================
-- DOS COSAS QUE EL TABLERO NO PUEDE CONTESTAR SOLO
-- ===========================================================================
--
-- El tablero ya muestra cada mes por separado y se compara con el anterior.
-- Pero hay dos preguntas sobre los DATOS —no sobre la pantalla— que sólo se
-- contestan mirando la base de producción, y de las que depende hasta dónde se
-- puede llegar con las métricas.
--
-- Ninguno de los dos pasos escribe nada.
-- ===========================================================================


-- ===========================================================================
-- PASO 1 — ¿SE PUEDE SABER CUÁNTO SE FACTURÓ EN UN MES?
-- ===========================================================================
--
-- Hoy el tablero agrupa por FECHA DE REGISTRO: «Agosto: 33 leads, $4.790» son
-- los leads que ENTRARON en agosto y lo que esos leads dejaron, se hayan
-- cerrado en agosto o en octubre. Es una cohorte.
--
-- La otra pregunta —«¿cuánto entró de plata en agosto?»— necesita la FECHA DE
-- CIERRE, y hoy el código asume que está casi siempre vacía. Este paso dice si
-- eso sigue siendo cierto.
--
-- CÓMO SE LEE:
--
--   `con_fecha_cierre` cerca de `ganadas`   Se puede agregar la vista por mes
--                                           de cobro, al lado de la que hay.
--
--   `con_fecha_cierre` en cero o casi       No se puede, y agregarla mostraría
--                                           casi todo en cero. Hay que empezar
--                                           a cargar la fecha al cerrar una
--                                           venta para poder tenerla después.
-- ===========================================================================
select
  count(*)                                                          as leads,
  count(*) filter (where s.nombre = 'Ganado')                       as ganadas,
  count(*) filter (where s.nombre = 'Ganado' and o.fecha_cierre is not null)
                                                                    as con_fecha_cierre,
  case
    when count(*) filter (where s.nombre = 'Ganado') = 0 then 'sin ventas ganadas'
    when count(*) filter (where s.nombre = 'Ganado' and o.fecha_cierre is not null) = 0
      then '✗ ninguna tiene fecha: hoy no se puede medir por mes de cobro'
    when count(*) filter (where s.nombre = 'Ganado' and o.fecha_cierre is not null)
         >= count(*) filter (where s.nombre = 'Ganado') * 0.8
      then '✓ casi todas la tienen: se puede agregar la vista por mes de cobro'
    else '⚠ a medias: la vista por mes de cobro mostraría de menos'
  end                                                               as veredicto
from public.oportunidades o
left join public.estados s on s.id = o.estado_id;


-- ===========================================================================
-- PASO 2 — PLATA ANOTADA EN LEADS QUE NO ESTÁN EN «GANADO»
-- ===========================================================================
--
-- La columna «Ganado» del Pipeline suma la venta cerrada de los leads que
-- están EN esa columna. El indicador «Venta cerrada» del tablero suma la de
-- TODOS los leads del mes. Si alguien cobró y no movió la ficha a Ganado, los
-- dos números no coinciden, y ninguno de los dos está mal: falta acomodar el
-- lead.
--
-- Este paso los lista. Con la lista en la mano se arreglan en un minuto desde
-- el Pipeline, arrastrando la ficha a «Ganado».
--
-- Si no devuelve ninguna fila, las dos pantallas van a coincidir siempre.
-- ===========================================================================
select
  o.codigo,
  c.nombre                                as cliente,
  coalesce(v.nombre, '(sin asesora)')     as asesora,
  coalesce(e.nombre, '(sin etapa)')       as etapa_actual,
  coalesce(s.nombre, '(sin estado)')      as estado_actual,
  o.venta_cerrada,
  o.fecha_registro
from public.oportunidades o
join public.clientes c        on c.id = o.cliente_id
left join public.vendedores v on v.id = o.vendedor_id
left join public.etapas e     on e.id = o.etapa_id
left join public.estados s    on s.id = o.estado_id
where coalesce(o.venta_cerrada, 0) > 0
  and coalesce(e.nombre, '') <> 'Ganado'
order by o.venta_cerrada desc;
