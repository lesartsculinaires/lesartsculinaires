-- =====================================================================
-- Ejecutar DESPUÉS de importar los 9 CSV.
-- Los CSV traen los id explícitos, así que hay que reposicionar las
-- secuencias; si no, el primer INSERT desde la app dará error de PK duplicada.
-- =====================================================================

select setval(pg_get_serial_sequence('public.vendedores','id'),        coalesce(max(id),1)) from public.vendedores;
select setval(pg_get_serial_sequence('public.territorios','id'),       coalesce(max(id),1)) from public.territorios;
select setval(pg_get_serial_sequence('public.canales','id'),           coalesce(max(id),1)) from public.canales;
select setval(pg_get_serial_sequence('public.productos','id'),         coalesce(max(id),1)) from public.productos;
select setval(pg_get_serial_sequence('public.etapas','id'),            coalesce(max(id),1)) from public.etapas;
select setval(pg_get_serial_sequence('public.estados','id'),           coalesce(max(id),1)) from public.estados;
select setval(pg_get_serial_sequence('public.clientes','id'),          coalesce(max(id),1)) from public.clientes;
select setval(pg_get_serial_sequence('public.oportunidades','id'),     coalesce(max(id),1)) from public.oportunidades;
select setval(pg_get_serial_sequence('public.oportunidad_notas','id'), coalesce(max(id),1)) from public.oportunidad_notas;

-- Verificación rápida (deberías ver 4 / 15 / 8 / 14 / 5 / 5 / 554 / 580 / 91)
select 'vendedores' t, count(*) from public.vendedores
union all select 'territorios',       count(*) from public.territorios
union all select 'canales',           count(*) from public.canales
union all select 'productos',         count(*) from public.productos
union all select 'etapas',            count(*) from public.etapas
union all select 'estados',           count(*) from public.estados
union all select 'clientes',          count(*) from public.clientes
union all select 'oportunidades',     count(*) from public.oportunidades
union all select 'oportunidad_notas', count(*) from public.oportunidad_notas;

-- Cerrar consistencia: marcar fecha_cierre en las oportunidades ya ganadas
update public.oportunidades o
set fecha_cierre = o.fecha_registro
from public.estados s
where s.id = o.estado_id and s.es_final and o.fecha_cierre is null;
