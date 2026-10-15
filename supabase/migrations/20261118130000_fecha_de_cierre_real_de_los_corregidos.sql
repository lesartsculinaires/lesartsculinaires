-- ============================================================================
-- La fecha de cierre real de los leads que se corrigieron el 14 de octubre
-- ============================================================================
--
-- La corrección del 14/10 (20261116120000) puso «Perdido» a 719 leads que ya
-- estaban en la columna de perdidos, y el disparador de la fecha de cierre
-- les escribió ese día. El reporte del 14 mostraba así 721 perdidos de un día.
--
-- La fecha real es el día en que alguien los movió a esa columna, que está en
-- el historial (actividad). Ya se aplicó en producción el 15/10/2026: 715
-- quedaron en septiembre y 4 en octubre. Volver a correrla no cambia nada:
-- sólo toca los que siguen con el 14/10 y figuran en el respaldo.

-- El respaldo sólo existe en producción: en una base nueva no hay nada que
-- corregir.
do $$
begin
  if to_regclass('public.respaldo_etapa_estado_20261014') is null then
    return;
  end if;
  execute $sql$
update public.oportunidades o
   set fecha_cierre = (c.movido at time zone 'America/El_Salvador')::date
  from (
    select o2.id,
      (select max(a.creado_en) from public.actividad a
        where a.entidad = 'oportunidad' and a.entidad_id::text = o2.id::text
          and a.campos ? 'etapa_id'
          and (a.campos -> 'etapa_id' ->> 'despues')::bigint = o2.etapa_id
          and a.creado_en < r.respaldado_en) as movido
      from public.oportunidades o2
      join public.respaldo_etapa_estado_20261014 r on r.id = o2.id
     where o2.fecha_cierre = '2026-10-14'
  ) c
 where c.id = o.id and c.movido is not null
  $sql$;
end $$;
