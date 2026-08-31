begin;

-- ============================================================================
-- La bandeja: marcar sin leer, fijar arriba y silenciar
-- ============================================================================
--
-- Lo que pidió la escuela: «poder colocar un botón de No leído en cada cliente,
-- acciones secundarias y toda la interfaz que WhatsApp ofrece».
--
-- Esto es la parte que NO depende de Meta. Son marcas del CRM: no viajan a
-- WhatsApp, no se le avisan al cliente y no consumen nada de la API. Por eso
-- se puede hacer hoy, sin esperar aprobación de nada.
--
-- ----------------------------------------------------------------------------
-- LAS TRES MARCAS
-- ----------------------------------------------------------------------------
--
--   no_leida     «esto lo dejo pendiente». Abrir un chat lo marca leído solo
--                —así funciona la bandeja desde el día uno—, y eso está bien
--                cuando de verdad se atendió. Pero pasa todo el tiempo lo
--                contrario: se entra a mirar de qué se trata, no se puede
--                contestar en ese momento, y el hilo queda leído y perdido
--                entre otros cuarenta. Con esta marca vuelve a la fila de
--                pendientes.
--
--   fijada       las tres o cuatro que uno está trabajando ahora, arriba de
--                todo. La lista se ordena por actividad reciente, así que un
--                lead caliente que no escribe desde ayer se hunde debajo de
--                cualquier consulta nueva que no importa.
--
--   silenciada   el hilo sigue vivo pero deja de contar para el número rojo de
--                la barra. Para el proveedor que manda cinco mensajes por
--                semana y no es una venta: archivarlo lo esconde, y no es que
--                sobre, es que no apura.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ SON DE LA CONVERSACIÓN Y NO DE CADA PERSONA
-- ----------------------------------------------------------------------------
--
-- Podrían haber sido por usuario —una tabla aparte con (conversación, usuario)—
-- para que cada quien tenga sus propias marcas. Se hizo global, en la misma
-- fila, por dos razones:
--
--   1. La bandeja de esta escuela ya es compartida en todo lo demás. `sin_leer`
--      y `archivada` son globales desde el principio: si una asesora archiva,
--      queda archivado para todas. Marcas por persona al lado de eso serían dos
--      reglas distintas en la misma lista, y nadie sabría cuál está viendo.
--
--   2. Es lo que la escuela pidió en el módulo de notificaciones: «que todos
--      estén enterados de cada acción». «Esta la dejo pendiente» es información
--      del equipo, no una nota privada.
--
-- Si algún día hace falta que sean personales, se agrega la tabla y estas
-- columnas pasan a ser el valor por omisión. Nada de lo que se escribe hoy
-- estorba para eso.
--
-- ----------------------------------------------------------------------------
-- Sólo agrega columnas, con valor por omisión. Se puede correr con gente
-- adentro y no toca ni una fila existente.
-- ----------------------------------------------------------------------------

alter table public.conversaciones
  -- Marcada a mano para volver a la fila de pendientes. Se apaga sola al
  -- abrir el hilo de nuevo, que es cuando deja de estar pendiente.
  add column if not exists no_leida    boolean not null default false,
  -- Arriba de todo en la lista, sin importar cuándo escribió.
  add column if not exists fijada      boolean not null default false,
  -- Sigue en la lista, deja de contar para el número rojo.
  add column if not exists silenciada  boolean not null default false;

-- La lista se pide ordenada: primero lo fijado, después por actividad. El
-- índice acompaña ese orden para que no haya que ordenar 300 filas en cada
-- carga de la bandeja.
create index if not exists ix_conversaciones_fijadas
  on public.conversaciones (archivada, fijada desc, ultimo_mensaje_en desc);

-- No hacen falta políticas nuevas: `conversaciones_editar` ya deja al equipo
-- actualizar cualquier conversación —es con lo que se archiva y se asigna— y
-- estas tres columnas viven en la misma fila.

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'conversaciones'
       and column_name = 'no_leida'
  ) then '✓ se puede marcar sin leer' else '· falta' end    as no_leida,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'conversaciones'
       and column_name = 'fijada'
  ) then '✓ se puede fijar arriba' else '· falta' end       as fijada,
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'conversaciones'
       and column_name = 'silenciada'
  ) then '✓ se puede silenciar' else '· falta' end          as silenciada,
  (select count(*) from public.conversaciones)              as conversaciones,
  (select count(*) from public.conversaciones
    where not archivada)                                    as activas;
