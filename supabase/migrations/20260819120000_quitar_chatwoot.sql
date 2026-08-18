begin;

-- Sacar Chatwoot de la bandeja.
--
-- La decisión fue hablar con Meta directamente en vez de colgarse de Chatwoot,
-- así que las columnas que existían nada más para enlazar con ellos ya no
-- tienen a quién apuntar. Se van tres de `conversaciones` y una de `mensajes`.
--
-- ORDEN: primero se publica el código que dejó de leerlas, después se corre
-- esto. Al revés, la bandeja pediría una columna que ya no existe y quedaría
-- mostrando un error hasta que el despliegue termine.
--
-- LO QUE NO SE TOCA, a propósito:
--   `conversaciones.estado`       abierto / pendiente / resuelto. Los nombres
--                                 vinieron de Chatwoot, el trabajo que
--                                 describen es del CRM.
--   `conversaciones.vendedor_id`  a quién le toca el hilo.
--   `mensajes.privado`            la nota que ve el equipo y no el cliente.
-- Esas tres son de la bandeja, no de la integración, y siguen en uso.

-- ------------------------------------------------------------ red de seguridad
--
-- Si alguna fila llegó a enlazarse con Chatwoot, esto se detiene. Botar una
-- columna se lleva sus datos sin vuelta atrás, y prefiero que quien la corra
-- se entere y decida, en vez de descubrirlo cuando ya no está.
do $$
declare
  convs bigint := 0;
  msgs  bigint := 0;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'conversaciones'
      and column_name = 'chatwoot_id'
  ) then
    execute 'select count(*) from public.conversaciones where chatwoot_id is not null'
      into convs;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mensajes'
      and column_name = 'chatwoot_id'
  ) then
    execute 'select count(*) from public.mensajes where chatwoot_id is not null'
      into msgs;
  end if;

  if convs > 0 or msgs > 0 then
    raise exception
      'Hay datos de Chatwoot: % conversaciones y % mensajes enlazados. No se borra nada. Revisalos antes de volver a correr esto.',
      convs, msgs;
  end if;

  raise notice 'sin datos de Chatwoot; se puede quitar sin perder nada';
end $$;

-- ------------------------------------------------------------------ el corte
--
-- Los índices parciales sobre esas columnas se van solos al botarlas; se
-- nombran igual por si alguno quedó suelto de una corrida a medias.
drop index if exists public.ux_conversaciones_chatwoot;
drop index if exists public.ux_mensajes_chatwoot;

alter table public.conversaciones
  drop column if exists chatwoot_id,
  drop column if exists chatwoot_contacto_id,
  drop column if exists inbox_id;

alter table public.mensajes
  drop column if exists chatwoot_id;

commit;
