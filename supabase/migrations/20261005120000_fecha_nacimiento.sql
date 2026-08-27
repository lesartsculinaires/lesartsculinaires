begin;

-- La fecha de nacimiento, para poder saludar en el cumpleaños.
--
-- ------------------------------------------------------------------------
-- POR QUÉ UNA FECHA Y NO OTRA EDAD
-- ------------------------------------------------------------------------
--
-- `clientes.edad` ya existe y se sigue usando: es lo que se pregunta en la
-- feria y lo que decide si hace falta un adulto responsable. Pero una edad no
-- sirve para saludar, y además envejece sola: la que se cargó el año pasado
-- hoy está mal por uno.
--
-- La fecha no envejece. De ella se saca la edad cuando hace falta, y se saca
-- el día del cumpleaños, que es lo que se pidió.
--
-- Las dos conviven a propósito. Quien cargue sólo la edad sigue pudiendo, y
-- quien tenga la fecha tiene las dos cosas.
--
-- ------------------------------------------------------------------------
-- EL FORMATO SE GUARDA COMO FECHA, NO COMO TEXTO
-- ------------------------------------------------------------------------
--
-- Se pidió verlo como día/mes/año, y así se muestra en la ficha. Pero eso es
-- cómo se dibuja, no cómo se guarda: adentro es un `date`.
--
-- La diferencia importa. Guardado como texto, «03/04/1995» no se puede
-- ordenar, no se puede preguntar «quién cumple esta semana» y —lo peor— no se
-- sabe si es el 3 de abril o el 4 de marzo. Como `date` no hay ambigüedad
-- posible y la consulta de cumpleaños es una línea.
--
-- Se puede correr con gente trabajando, y dos veces.

alter table public.clientes
  add column if not exists fecha_nacimiento date;

comment on column public.clientes.fecha_nacimiento is
  'Cumpleaños. Se muestra como día/mes/año; se guarda como fecha para poder consultarla.';

/*
 * Un índice por día y mes, que es como se pregunta.
 *
 * «Quién cumple hoy» no es una comparación por fecha entera —el año no
 * importa— así que un índice común sobre la columna no serviría. Este es sobre
 * la expresión que se va a consultar.
 */
create index if not exists ix_clientes_cumple
  on public.clientes ((extract(month from fecha_nacimiento)),
                      (extract(day   from fecha_nacimiento)))
  where fecha_nacimiento is not null;

commit;

-- ---------------------------------------------------------------- la vista

/*
 * `fecha_nacimiento` se suma a `vw_pipeline`, que es de donde leen las
 * pantallas. La vista se rehace porque `create or replace view` no admite
 * tocar la lista de columnas.
 *
 * Las columnas opcionales se leen de la base en vez de escribirse a mano: este
 * archivo puede correrse sobre una base a la que le falte alguna migración
 * intermedia, y una lista fija fallaría ahí en vez de hacer lo suyo.
 */
do $$
declare
  hay text := '';
  col text;
begin
  foreach col in array array[
    'motivo_perdida_id', 'reserva', 'reserva_en', 'importacion_id'
  ] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'oportunidades'
         and column_name = col
    ) then
      hay := hay || format(', o.%I', col);
    end if;
  end loop;

  drop view if exists public.vw_pipeline;

  execute format($vista$
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
           mp.nombre as motivo_perdida,
           o.valor_oportunidad, o.venta_cerrada,
           o.descuento_promocion,
           o.created_at%s,
           c.edad,
           c.responsable_nombre,
           c.responsable_telefono,
           c.responsable_correo,
           c.pais,
           c.fecha_nacimiento
    from public.oportunidades o
    join public.clientes c   on c.id = o.cliente_id
    left join public.vendedores  v  on v.id  = o.vendedor_id
    left join public.productos   p  on p.id  = o.producto_id
    left join public.territorios t  on t.id  = o.territorio_id
    left join public.canales     ca on ca.id = o.canal_id
    left join public.etapas      e  on e.id  = o.etapa_id
    left join public.estados     s  on s.id  = o.estado_id
    left join public.motivos_perdida mp on mp.id = o.motivo_perdida_id
  $vista$, hay);

  execute 'alter view public.vw_pipeline set (security_invoker = true)';
end $$;

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'clientes'
       and column_name = 'fecha_nacimiento'
  ) then '✓ la ficha ya puede guardar el cumpleaños' else '· falta' end as columna,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'vw_pipeline'
       and column_name = 'fecha_nacimiento'
  ) then '✓ y las pantallas lo leen' else '· falta' end                 as vista,
  (select count(*) from public.clientes where fecha_nacimiento is not null)
                                                                        as fichas_con_cumple,
  (select count(*) from public.clientes)                                as fichas_en_total;
