/**
 * Los chats que quedaron partidos en dos: el viejo como Instagram y el nuevo
 * como Messenger.
 *
 * ============================================================================
 * DE DÓNDE SALE ESTO
 * ============================================================================
 *
 * Las dos suscripciones de Meta apuntaban a la misma URL, así que todo lo de
 * Messenger se guardó como Instagram. El código ya no se equivoca —decide por
 * el campo `object`— y `20261029130000_messenger_mal_etiquetado.sql` movió 31
 * hilos a su canal.
 *
 * Pero esa migración salteó a propósito los hilos de gente que YA tenía un hilo
 * de Messenger, porque `(canal, identificador)` es único y el cambio habría
 * chocado. Lo avisó con un `raise notice`, que el editor de Supabase no muestra.
 *
 * Quedaron nueve personas con la conversación partida en dos:
 *
 *     identificador 29566976779558028
 *       instagram #359  ← los mensajes de antes del arreglo, sin nombre
 *       messenger #361  ← los de después, con el nombre resuelto
 *
 * En la bandeja se ven como dos personas distintas. Y como cada hilo abrió su
 * propia ficha, también hay dos clientes por persona: uno llamado «Contacto de
 * Instagram» —el nombre de respaldo, porque el perfil no se podía leer con un
 * PSID— y otro con el nombre de verdad.
 *
 * ============================================================================
 * QUÉ SE CONSERVA Y POR QUÉ
 * ============================================================================
 *
 * Gana el hilo de MESSENGER, aunque sea el más nuevo. Tres razones:
 *
 *   ESTÁ BIEN ETIQUETADO   Es el canal real. Conservar el de Instagram sería
 *                          dejar la mentira y borrar la verdad.
 *
 *   ES DONDE SIGUEN        Los mensajes nuevos ya entran ahí. Conservar el otro
 *   LLEGANDO               partiría la conversación otra vez mañana.
 *
 *   TIENE EL NOMBRE        El de Instagram quedó sin nombre: su perfil se buscó
 *                          en el Graph de Instagram con un PSID de Facebook, y
 *                          eso no puede funcionar.
 *
 * Los mensajes del hilo viejo se mudan al nuevo ANTES de borrarlo. No se pierde
 * ninguno: `mensajes` cuelga de la conversación en cascada, así que borrar
 * primero se los llevaría puestos.
 *
 * ============================================================================
 * LAS FICHAS SE FUSIONAN, NO SE BORRAN
 * ============================================================================
 *
 * Algunas de las fichas duplicadas tienen oportunidades. Borrarlas perdería
 * leads, así que se usa `fusionar_contactos`, que ya existe y arrastra
 * oportunidades, notas e identificadores de canal.
 *
 * Es idempotente: la segunda vez no encuentra pares y no hace nada.
 */

begin;

-- ---------------------------------------------------------------------------
-- 1. Los pares, encontrados por su identificador.
-- ---------------------------------------------------------------------------
--
-- No se nombra ningún id a mano: un par es «el mismo identificador en los dos
-- canales». Así la migración vale igual si aparecieron más desde que se
-- escribió, y no rompe nada si ya se arreglaron.

create temporary table _partidos on commit drop as
  select ig.id            as ig_conv,
         msn.id           as msn_conv,
         ig.cliente_id    as ig_cliente,
         msn.cliente_id   as msn_cliente,
         -- Se copian ANTES de borrar el hilo viejo: después ya no están.
         coalesce(ig.sin_leer, 0)  as ig_sin_leer,
         coalesce(ig.no_leida, false) as ig_no_leida
    from public.conversaciones ig
    join public.conversaciones msn
      on msn.identificador = ig.identificador
     and msn.canal = 'messenger'
   where ig.canal = 'instagram';

-- ---------------------------------------------------------------------------
-- 2. Los mensajes se mudan al hilo que se conserva.
-- ---------------------------------------------------------------------------

update public.mensajes m
   set conversacion_id = p.msn_conv
  from _partidos p
 where m.conversacion_id = p.ig_conv;

-- ---------------------------------------------------------------------------
-- 3. El hilo que queda se pone al día.
-- ---------------------------------------------------------------------------
--
-- Después de mudar los mensajes, la fecha del último y el resumen pueden estar
-- viejos: si el mensaje más nuevo venía del hilo de Instagram, el hilo que queda
-- lo tiene ahora pero sigue mostrando el resumen de antes. Se recalculan desde
-- los mensajes, que es la única fuente que no puede estar desfasada.
--
-- El pendiente es distinto: `sin_leer` es un CONTADOR que sube con cada mensaje
-- entrante y se pone en cero al abrir el hilo —no hay marca de «leído hasta»—,
-- así que no se puede recalcular desde los mensajes. Se suman los dos lados,
-- que es lo que significa: lo que quedó sin ver en uno más lo del otro.

update public.conversaciones c
   set ultimo_mensaje_en = coalesce(u.cuando, c.ultimo_mensaje_en),
       ultimo_texto      = left(coalesce(u.texto, c.ultimo_texto), 200),
       sin_leer          = coalesce(c.sin_leer, 0) + p.ig_sin_leer,
       no_leida          = coalesce(c.no_leida, false) or p.ig_no_leida
  from _partidos p
  join lateral (
    select max(m.creado_en) as cuando,
           (array_agg(m.texto order by m.creado_en desc))[1] as texto
      from public.mensajes m
     where m.conversacion_id = p.msn_conv
  ) u on true
 where c.id = p.msn_conv;

-- ---------------------------------------------------------------------------
-- 4. Fuera el hilo duplicado.
-- ---------------------------------------------------------------------------
--
-- Ya no tiene mensajes: se mudaron en el paso 2. Lo que sí se lleva la cascada
-- son sus reacciones y llamadas, que en estos hilos no existen.

delete from public.conversacion_etiquetas
 where conversacion_id in (select ig_conv from _partidos);

delete from public.conversaciones
 where id in (select ig_conv from _partidos);

-- ---------------------------------------------------------------------------
-- 5. Las fichas duplicadas, fusionadas.
-- ---------------------------------------------------------------------------
--
-- Se conserva la del lado de Messenger, que es la que tiene el nombre de
-- verdad. `fusionar_contactos` exige dirección, pero sólo cuando hay sesión:
-- en una migración `auth.uid()` es nulo y pasa.

do $$
declare
  par record;
begin
  for par in
    select distinct ig_cliente, msn_cliente
      from _partidos
     where ig_cliente is not null
       and msn_cliente is not null
       and ig_cliente <> msn_cliente
  loop
    perform public.fusionar_contactos(par.msn_cliente, array[par.ig_cliente]);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Qué se hizo, a la vista.
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
  quedan int;
begin
  select count(*) into n from _partidos;
  select count(*) into quedan from public.conversaciones where canal = 'instagram';

  raise notice 'Chats partidos reunidos: %', n;
  raise notice 'Hilos que siguen como Instagram: % (ésos son los de verdad)', quedan;
end $$;

commit;
