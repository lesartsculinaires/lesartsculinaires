begin;

-- ============================================================================
-- El permiso del cliente para que lo llamemos
-- ============================================================================
--
-- WhatsApp no deja llamarle a cualquiera. Antes de la primera llamada hay que
-- pedirle permiso a la persona, ella tiene que aceptarlo desde su teléfono, y
-- el permiso dura un tiempo y después se vence.
--
-- Mientras no lo dé, la llamada falla del lado de Meta y del otro lado no suena
-- nada. No es un trámite: es la diferencia entre que el botón «Llamar» sirva o
-- sea un botón que siempre da error.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ HAY QUE GUARDARLO Y NO ALCANZA CON INTENTAR
-- ----------------------------------------------------------------------------
--
-- Sin esto, la única forma de saber si se puede llamar es llamar. Y eso, del
-- lado de quien atiende, se siente así: aprieta «Llamar», el navegador le pide
-- el micrófono, espera unos segundos, y recibe un error. Con un cliente del
-- otro lado esperando que le expliquen el diplomado.
--
-- Guardándolo, la bandeja puede decir de entrada «a esta persona se le puede
-- llamar» o «hay que pedirle permiso primero», y el botón que se muestra es
-- siempre el que va a funcionar.
--
-- ----------------------------------------------------------------------------
-- LAS TRES COLUMNAS
-- ----------------------------------------------------------------------------
--
--   hasta       Hasta cuándo se puede llamar. Lo dice Meta cuando la persona
--               acepta, y es lo único que decide si el botón «Llamar» aparece.
--               Nulo = nunca aceptó, o ya se venció.
--
--   pedido_en   Cuándo se le mandó la última solicitud. No es decorado: Meta
--               limita cuántas veces se puede pedir, y sin esto el equipo se lo
--               pediría tres veces en una tarde —tres personas distintas
--               atendiendo el mismo hilo— y quemaría el cupo.
--
--   respuesta   'acepto' o 'rechazo'. Con `hasta` alcanzaría para saber si se
--               puede llamar, pero no para distinguir «nunca contestó» de «dijo
--               que no». Y ésas se atienden distinto: a la primera se le
--               insiste, a la segunda no.
--
-- ----------------------------------------------------------------------------

alter table public.conversaciones
  add column if not exists llamada_permiso_hasta     timestamptz,
  add column if not exists llamada_permiso_pedido_en timestamptz,
  add column if not exists llamada_permiso_respuesta text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'conversaciones_llamada_permiso_respuesta_check'
  ) then
    alter table public.conversaciones
      add constraint conversaciones_llamada_permiso_respuesta_check
      check (llamada_permiso_respuesta is null
             or llamada_permiso_respuesta in ('acepto', 'rechazo'));
  end if;
end $$;

/*
 * No hace falta índice.
 *
 * Estas tres se leen siempre junto con el hilo que ya se está trayendo por su
 * id, nunca para buscar «todos los que tienen permiso». Un índice acá sería
 * costo de escritura en cada mensaje que entra a cambio de nada.
 */

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when (
    select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'conversaciones'
       and column_name in ('llamada_permiso_hasta', 'llamada_permiso_pedido_en',
                           'llamada_permiso_respuesta')
  ) = 3 then '✓ las tres columnas están' else '⚠ REVISAR' end        as columnas,
  (select count(*) from public.conversaciones)                       as hilos,
  (select count(*) from public.conversaciones
    where llamada_permiso_hasta > now())                             as se_puede_llamar,
  (select count(*) from public.conversaciones
    where llamada_permiso_respuesta = 'rechazo')                     as dijeron_que_no;
