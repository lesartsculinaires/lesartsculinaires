-- =====================================================================
-- ¿Qué migraciones tiene corridas esta base?
--
-- CÓMO SE CORRE
--   Supabase → el proyecto del CRM → SQL Editor → New query → pegar todo
--   esto → Run. Sólo lee: no cambia ni borra nada.
--
--   Va como UNA sola consulta a propósito. El SQL Editor de Supabase muestra
--   nada más el resultado de la última sentencia, así que un archivo con
--   varios `select` sueltos deja ver sólo el final.
--
-- QUÉ NO ESTÁ EN LA LISTA
--   `20260731130000_autorizaciones` salió de acá porque el módulo se quitó de
--   la aplicación. La migración y la tabla siguen en el repositorio por si
--   vuelve a hacer falta; correrla o no ya no cambia nada de lo que se usa.
--
-- CÓMO SE LEE
--   Cada fila es una migración y dice CORRIDA o FALTA. Las que faltan salen
--   primero.
--
--   No hay un registro de migraciones en esta base, así que en vez de creerle
--   a una lista se busca la huella de cada una: la tabla, la columna o la
--   función que dejó al pasar. Si la huella está, la migración corrió.
-- =====================================================================

with

-- Tres preguntas que se repiten, escritas una sola vez.
hay_tabla as (
  select table_name::text as nombre
  from information_schema.tables
  where table_schema = 'public'
),
hay_columna as (
  select (table_name || '.' || column_name)::text as nombre
  from information_schema.columns
  where table_schema = 'public'
),
hay_funcion as (
  select p.proname::text as nombre
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),

resuelto as (
  select 1 as orden,
         '20260731120000_bases_importadas' as migracion,
         'oportunidades.importacion_id' as se_busca,
         exists (select 1 from hay_columna where nombre = 'oportunidades.importacion_id') as presente
  union all
  select 3, '20260813213000_cambios_en_vivo', 'función cambios_en_vivo_activos',
         exists (select 1 from hay_funcion where nombre = 'cambios_en_vivo_activos')
  union all
  select 4, '20260814120000_whatsapp_inbox', 'tabla conversaciones',
         exists (select 1 from hay_tabla where nombre = 'conversaciones')
  union all
  select 5, '20260817120000_vendedores_telefono', 'vendedores.telefono',
         exists (select 1 from hay_columna where nombre = 'vendedores.telefono')
  union all
  select 6, '20260818120000_adjuntos', 'tabla adjuntos + balde de archivos',
         exists (select 1 from hay_tabla where nombre = 'adjuntos')
         and exists (select 1 from storage.buckets where id = 'adjuntos')
  union all
  -- Esta se lee al revés: la huella es que la columna YA NO esté. Sólo tiene
  -- sentido si la bandeja existe; sin ella no hay nada que quitar.
  select 7, '20260819120000_quitar_chatwoot', 'ya no está conversaciones.chatwoot_id',
         exists (select 1 from hay_tabla where nombre = 'conversaciones')
         and not exists (select 1 from hay_columna where nombre = 'conversaciones.chatwoot_id')
  union all
  select 8, '20260820120000_edad_y_responsable', 'clientes.edad',
         exists (select 1 from hay_columna where nombre = 'clientes.edad')
  union all
  select 9, '20260821120000_responsable_hasta_17', 'el índice corta en 18, no en 17',
         exists (
           select 1 from pg_indexes
           where schemaname = 'public'
             and indexname = 'ix_clientes_menores_sin_responsable'
             and indexdef like '%edad < 18%'
         )
  union all
  select 10, '20260822120000_enlaces_pago', 'tabla enlaces_pago',
         exists (select 1 from hay_tabla where nombre = 'enlaces_pago')
  union all
  -- No es una migración, pero es lo que hace falta para que la ficha muestre
  -- lo que se guarda: si la columna está en la tabla y no en la vista, la
  -- pantalla no la ve.
  select 11, '(la vista trae la edad)', 'vw_pipeline.edad',
         exists (select 1 from hay_columna where nombre = 'vw_pipeline.edad')
)

select
  case when presente then '✔ CORRIDA' else '✘ FALTA' end as estado,
  migracion,
  se_busca
from resuelto
order by presente, orden;
