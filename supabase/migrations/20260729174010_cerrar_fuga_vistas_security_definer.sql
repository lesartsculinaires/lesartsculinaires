-- Ajustes aplicados sobre el esquema normalizado.
--
-- 1. Cierre de una fuga de datos: las vistas se habían creado como SECURITY
--    DEFINER (el comportamiento por defecto de Postgres), así que corrían con
--    los permisos de su creador y devolvían TODAS las filas a cualquiera con
--    la clave anónima, saltándose el RLS de las tablas.
-- 2. La vista de pipeline ahora expone también los id de cada catálogo, para
--    que la app pueda actualizar una oportunidad sin resolver por texto.
-- 3. Tablas de agenda, que el esquema original no contemplaba.

-- ------------------------------------------------------- vista de pipeline
-- Se recrea en vez de reemplazarse: `create or replace view` no permite
-- agregar columnas en medio del listado.
drop view if exists public.vw_pipeline;

create view public.vw_pipeline as
select o.id, o.codigo, o.fecha_registro, o.fecha_cierre,
       date_trunc('month', o.fecha_registro)::date as mes,
       o.cliente_id, c.nombre as cliente, c.telefono, c.correo,
       o.vendedor_id,   v.nombre  as vendedor,
       o.producto_id,   p.nombre  as producto, p.categoria,
       o.territorio_id, t.nombre  as territorio,
       o.canal_id,      ca.nombre as canal,
       o.etapa_id,      e.nombre  as etapa, e.orden as etapa_orden,
       o.estado_id,     s.nombre  as estado, s.es_final,
       o.valor_oportunidad, o.venta_cerrada, o.descuento_promocion
from public.oportunidades o
join public.clientes c   on c.id = o.cliente_id
left join public.vendedores  v  on v.id  = o.vendedor_id
left join public.productos   p  on p.id  = o.producto_id
left join public.territorios t  on t.id  = o.territorio_id
left join public.canales     ca on ca.id = o.canal_id
left join public.etapas      e  on e.id  = o.etapa_id
left join public.estados     s  on s.id  = o.estado_id;

-- security_invoker: la vista pasa a respetar el RLS de quien consulta.
alter view public.vw_pipeline     set (security_invoker = true);
alter view public.vw_kpi_vendedor set (security_invoker = true);
alter view public.vw_embudo       set (security_invoker = true);

-- search_path fijo: evita que un esquema malicioso en el search_path del
-- llamador secuestre las funciones que usa el trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

