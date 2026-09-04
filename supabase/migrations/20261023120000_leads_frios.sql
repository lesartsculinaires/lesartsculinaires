begin;

-- ============================================================================
-- Cuándo fue la última vez que alguien tocó cada lead
-- ============================================================================
--
-- Para la pantalla de leads fríos, que pidió la escuela después de preguntar
-- si existía el recordatorio de los quince días. No existía, y los números
-- explicaron por qué convenía otra forma: de 979 leads vivos, 410 llevaban más
-- de quince días sin que nadie los tocara. Una lista de recordatorios de 410
-- renglones no la lee nadie; una pantalla que se filtra por asesora, sí.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ UNA VISTA Y NO LA CUENTA EN EL NAVEGADOR
-- ----------------------------------------------------------------------------
--
-- Porque los datos están en dos tablas que juntas pesan casi ocho mil filas y
-- crecen con cada cambio que hace el equipo. Traerlas enteras a cada carga de
-- la pantalla para calcular un máximo por lead sería mandar ocho mil filas
-- para usar mil quinientas fechas.
--
-- La vista devuelve una fila por lead. Es lo mismo que hace `vw_pipeline` con
-- el resto: la cuenta va donde están los datos.
--
-- ----------------------------------------------------------------------------
-- QUÉ CUENTA COMO «TOCAR» UN LEAD
-- ----------------------------------------------------------------------------
--
-- Tres cosas, y se toma la más reciente de las tres:
--
--   La bitácora    Una nota escrita en la ficha. Es el rastro de que alguien
--   (`oportunidad_notas`)  habló con esa persona, que es lo que de verdad
--                  interesa.
--
--   El registro    Cualquier cambio guardado: mover la tarjeta, anotar el
--   (`actividad`)  monto, cambiar de asesora. No es una llamada, pero es
--                  alguien ocupándose.
--
--   El alta        Si no hay nada de lo anterior, el lead está como entró.
--   (`created_at`) Sin esto, un lead recién creado se leería como abandonado
--                  desde el primer día.
--
-- Lo que NO cuenta, a propósito: los mensajes de WhatsApp. Que el cliente
-- escriba no quiere decir que se le esté dando seguimiento —al revés, un
-- cliente escribiendo sin que nadie conteste es el caso más urgente de todos—.
-- Y que la escuela le mande un envío masivo tampoco es seguimiento: es un
-- correo más, y contarlo dejaría a media base «atendida» sin que nadie hablara
-- con nadie.
-- ============================================================================

create or replace view public.vw_ultimo_toque as
select
  o.id as oportunidad_id,
  greatest(
    coalesce((select max(n.created_at)
                from public.oportunidad_notas n
               where n.oportunidad_id = o.id), o.created_at),
    coalesce((select max(a.creado_en)
                from public.actividad a
               where a.oportunidad_id = o.id), o.created_at)
  ) as ultimo_toque
from public.oportunidades o;

/*
 * Con los permisos de quien pregunta, no con los de quien creó la vista.
 *
 * Es lo mismo que `vw_pipeline`. Sin esto, una asesora vería la fecha de
 * leads que no puede abrir —y la pantalla de fríos le contaría clientes
 * ajenos—, que es exactamente lo que las políticas de `oportunidades` existen
 * para evitar.
 */
alter view public.vw_ultimo_toque set (security_invoker = true);

commit;

-- ------------------------------------------------------------- cómo quedó
--
-- `frios` es lo que va a mostrar la pantalla el día que se abra: leads vivos
-- que nadie tocó en quince días. No es un error ni algo que haya que arreglar
-- corriendo nada: es la cartera que estaba sin mirarse.
-- ============================================================================
select
  count(*)                                                          as leads_vivos,
  count(*) filter (where t.ultimo_toque < now() - interval '15 days') as frios,
  count(*) filter (where t.ultimo_toque < now() - interval '45 days') as muy_frios,
  count(*) filter (where t.ultimo_toque < now() - interval '15 days'
                     and o.vendedor_id is null)                     as frios_sin_asesora
from public.oportunidades o
join public.estados s        on s.id = o.estado_id
join public.vw_ultimo_toque t on t.oportunidad_id = o.id
where not coalesce(s.es_final, false);
