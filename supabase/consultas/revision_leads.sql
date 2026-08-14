-- =====================================================================
-- ¿Se están ingresando leads, y están las tablas sincronizadas?
--
-- CÓMO SE CORRE
--   Supabase → el proyecto del CRM → SQL Editor → New query → pegar todo
--   esto → Run. Sólo lee: no cambia ni borra nada.
--
--   Va como UNA sola consulta a propósito. El SQL Editor de Supabase muestra
--   nada más el resultado de la última sentencia, así que un archivo con
--   varios `select` sueltos deja ver sólo el final. Acá todo sale junto, en
--   una tabla de tres columnas: sección, detalle y valor.
--
-- QUÉ SIGNIFICA "SINCRONIZADAS" ACÁ
--   Un lead vive en dos tablas: la persona va en `clientes` y su interés en
--   un programa va en `oportunidades`. Una misma persona puede tener varias
--   oportunidades (dos programas distintos), así que los totales NUNCA
--   coinciden y eso está bien.
--
--   Lo que sí sería un problema es un cliente sin ninguna oportunidad: las
--   pantallas del CRM listan oportunidades, así que esa persona existe en la
--   base pero no se ve en ningún lado.
--
--   Al revés no puede pasar: `oportunidades.cliente_id` es obligatorio y
--   apunta a `clientes`, así que la base misma impide una oportunidad sin
--   dueño.
-- =====================================================================

with

-- 1. Cuántas filas hay en cada tabla.
totales as (
  select 1 as orden, 0 as sub, '1. Totales' as seccion,
         'clientes' as detalle, (select count(*) from public.clientes)::text as valor
  union all
  select 1, 1, '1. Totales', 'oportunidades', (select count(*) from public.oportunidades)::text
  union all
  select 1, 2, '1. Totales', 'notas de seguimiento', (select count(*) from public.oportunidad_notas)::text
),

-- 2. Clientes que no aparecen en ninguna pantalla. Tiene que dar 0.
huerfanos as (
  select c.id, c.nombre, c.telefono, c.correo, c.created_at
  from public.clientes c
  where not exists (
    select 1 from public.oportunidades o where o.cliente_id = c.id
  )
),
sincronizacion as (
  select 2 as orden, 0 as sub, '2. Sincronización' as seccion,
         'clientes sin ninguna oportunidad' as detalle,
         (select count(*) from huerfanos)::text as valor
  union all
  -- Si hay alguno, se listan para poder arreglarlos a mano.
  select 2, 1, '2. Sincronización',
         'invisible: ' || h.nombre,
         coalesce(h.telefono, h.correo, 'sin contacto') || ' · cargado ' ||
           to_char(h.created_at, 'DD/MM/YYYY')
  from (select * from huerfanos order by created_at desc limit 20) h
),

-- 3. Altas por día. `created_at` es cuándo se guardó la fila; `fecha_registro`
--    es la fecha que escribió la persona de ventas, que puede ser anterior.
por_dia as (
  select 3 as orden,
         row_number() over (order by date(o.created_at) desc) as sub,
         '3. Altas por día (14 días)' as seccion,
         to_char(date(o.created_at), 'DD/MM/YYYY') as detalle,
         count(*)::text || ' oportunidades · ' ||
           count(distinct o.cliente_id)::text || ' personas' as valor
  from public.oportunidades o
  where o.created_at >= now() - interval '14 days'
  group by date(o.created_at)
),

-- 4. Las últimas, para ver si lo que entra viene completo o a medias.
ultimas as (
  select 4 as orden,
         row_number() over (order by o.created_at desc) as sub,
         '4. Últimas 15 altas' as seccion,
         o.codigo || ' · ' || c.nombre as detalle,
         coalesce(v.nombre, 'SIN VENDEDOR') || ' · ' ||
           coalesce(p.nombre, 'SIN PROGRAMA') || ' · ' ||
           to_char(o.created_at, 'DD/MM HH24:MI') as valor
  from public.oportunidades o
  join public.clientes c        on c.id = o.cliente_id
  left join public.vendedores v on v.id = o.vendedor_id
  left join public.productos  p on p.id = o.producto_id
  order by o.created_at desc
  limit 15
),

-- 5. Lo cargado este mes, por vendedor.
del_mes as (
  select 5 as orden,
         row_number() over (order by count(*) desc) as sub,
         '5. Este mes por vendedor' as seccion,
         coalesce(v.nombre, 'sin vendedor') as detalle,
         count(*)::text || ' leads' as valor
  from public.oportunidades o
  left join public.vendedores v on v.id = o.vendedor_id
  where o.fecha_registro >= date_trunc('month', current_date)
  group by v.nombre
)

select seccion, detalle, valor
from (
  select * from totales
  union all select * from sincronizacion
  union all select * from por_dia
  union all select * from ultimas
  union all select * from del_mes
) r
order by orden, sub;
