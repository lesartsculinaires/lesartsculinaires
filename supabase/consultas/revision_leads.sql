-- =====================================================================
-- ¿Se están ingresando leads, y están las tablas sincronizadas?
--
-- CÓMO SE CORRE
--   Supabase → el proyecto del CRM → SQL Editor → New query → pegar todo
--   esto → Run. Sólo lee: no cambia ni borra nada.
--
-- QUÉ SIGNIFICA "SINCRONIZADAS" ACÁ
--   Un lead vive en dos tablas: la persona va en `clientes` y su interés en
--   un programa va en `oportunidades`. Una misma persona puede tener varias
--   oportunidades (dos programas distintos), así que los totales NUNCA
--   coinciden y eso está bien.
--
--   Lo que sí sería un problema es un cliente sin ninguna oportunidad: las
--   pantallas del CRM listan oportunidades, así que esa persona existe en la
--   base pero no se ve en ningún lado. Eso es lo que mide el bloque 2.
--
--   Al revés no puede pasar: `oportunidades.cliente_id` es obligatorio y
--   apunta a `clientes`, así que la base misma impide una oportunidad sin
--   dueño.
-- =====================================================================

-- ---------------------------------------------------------------- 1. totales
select
  'Totales' as bloque,
  (select count(*) from public.clientes)      as clientes,
  (select count(*) from public.oportunidades) as oportunidades,
  (select count(*) from public.oportunidad_notas) as notas;

-- ------------------------------------------------- 2. ¿hay clientes invisibles?
-- Debe dar 0. Si da más, esas personas están en la base pero no aparecen en
-- ninguna pantalla del CRM.
select
  'Clientes sin ninguna oportunidad' as revision,
  count(*) as cuantos
from public.clientes c
where not exists (
  select 1 from public.oportunidades o where o.cliente_id = c.id
);

-- Y quiénes son, para poder arreglarlos a mano.
select c.id, c.nombre, c.telefono, c.correo, c.created_at
from public.clientes c
where not exists (
  select 1 from public.oportunidades o where o.cliente_id = c.id
)
order by c.created_at desc
limit 50;

-- ------------------------------------------------ 3. ¿están entrando leads?
-- Altas de los últimos 14 días, por día. `created_at` es cuándo se guardó la
-- fila; `fecha_registro` es la fecha que escribió la persona de ventas, que
-- puede ser anterior.
select
  date(o.created_at)             as dia,
  count(*)                       as oportunidades_creadas,
  count(distinct o.cliente_id)   as personas_distintas
from public.oportunidades o
where o.created_at >= now() - interval '14 days'
group by 1
order by 1 desc;

-- --------------------------------------------- 4. las últimas 15, con detalle
-- Para confirmar que lo que se está guardando trae los datos completos y no
-- filas a medias.
select
  o.codigo,
  c.nombre                          as cliente,
  coalesce(v.nombre, 'sin vendedor') as vendedor,
  coalesce(p.nombre, 'sin programa') as programa,
  o.fecha_registro,
  o.created_at
from public.oportunidades o
join public.clientes c        on c.id = o.cliente_id
left join public.vendedores v on v.id = o.vendedor_id
left join public.productos  p on p.id = o.producto_id
order by o.created_at desc
limit 15;

-- ------------------------------------------------- 5. este mes, por vendedor
select
  coalesce(v.nombre, 'sin vendedor') as vendedor,
  count(*)                           as leads_del_mes
from public.oportunidades o
left join public.vendedores v on v.id = o.vendedor_id
where o.fecha_registro >= date_trunc('month', current_date)
group by 1
order by 2 desc;
