/**
 * Lo que pasa en los chats y en las llamadas, también al registro.
 *
 * ============================================================================
 * QUÉ FALTABA, MEDIDO
 * ============================================================================
 *
 * El registro se llena con triggers, y cubría cinco tablas. Contando lo que hay
 * guardado el 23 de septiembre de 2026:
 *
 *     oportunidad   6278      conversacion     0
 *     cliente       2300      llamada          0
 *     nota          1985
 *     enlace          58
 *     adjunto         54
 *
 * `conversaciones` y `llamadas` no tenían trigger. Eso deja tres huecos que sí
 * le importan a alguien:
 *
 *   REASIGNAR UN CHAT SIN LEAD   Reasignar desde la bandeja también reasigna
 *                                las oportunidades abiertas de ese cliente, y
 *                                por ahí quedaba anotado. Pero si el hilo no
 *                                tiene lead, o el lead ya está cerrado, no hay
 *                                oportunidad que actualizar y la reasignación
 *                                desaparecía sin rastro.
 *
 *   ARCHIVAR Y DESARCHIVAR       Nunca quedó registrado. Un hilo archivado sale
 *                                de la lista de todo el equipo.
 *
 *   QUIÉN ATENDIÓ UNA LLAMADA    Ni quién la rechazó, ni cuál se perdió.
 *
 * ============================================================================
 * POR QUÉ SÓLO `update`, Y NO `insert`
 * ============================================================================
 *
 * Porque un hilo nuevo o una llamada entrante no son decisiones de nadie: son
 * cosas que pasan. Anotarlas sumaría cientos de entradas por semana que nadie
 * puede accionar, y taparían justo lo que este cambio viene a hacer visible.
 *
 * El criterio, dicho de una vez: al registro va lo que una persona DECIDIÓ, no
 * lo que el mundo hizo. Por eso tampoco entran marcar leído, fijar ni silenciar
 * —son de cada asesora y pasan cientos de veces por día—.
 *
 * Es idempotente: correrla dos veces no cambia nada la segunda vez.
 */

begin;

-- ---------------------------------------------------------------------------
-- 1. Los chats.
-- ---------------------------------------------------------------------------
--
-- `vendedor_id` es el cambio de asesora, que es lo que motivó todo esto.
-- `archivada` es sacar un hilo de la vista del equipo.
--
-- `cliente_id` va también, y no es obvio: es lo que cambia cuando alguien
-- reasigna un hilo a otra ficha o cuando se unifican dos contactos. Si eso se
-- hace mal, el chat de una persona queda colgando de la ficha de otra, y sin
-- registro no hay forma de saber cuándo pasó ni quién lo hizo.

drop trigger if exists trg_actividad_conversaciones on public.conversaciones;
create trigger trg_actividad_conversaciones
  after update on public.conversaciones
  for each row execute function public.registrar_actividad(
    '{vendedor_id,archivada,cliente_id}',
    'conversacion'
  );

-- ---------------------------------------------------------------------------
-- 2. Las llamadas.
-- ---------------------------------------------------------------------------
--
-- `atendida_por` dice quién la agarró —el dato que se pierde apenas termina la
-- llamada— y `estado` cubre el resto: contestada, rechazada, perdida, colgada.
--
-- No se vigila `sdp_remoto` ni nada del audio: son detalles técnicos que
-- cambian varias veces por llamada y no significan nada para quien lee el
-- registro.

drop trigger if exists trg_actividad_llamadas on public.llamadas;
create trigger trg_actividad_llamadas
  after update on public.llamadas
  for each row execute function public.registrar_actividad(
    '{estado,atendida_por}',
    'llamada'
  );

-- ---------------------------------------------------------------------------
-- 3. Las etiquetas del hilo.
-- ---------------------------------------------------------------------------
--
-- Acá sí van el alta y la baja, porque en esta tabla eso ES la acción: una
-- etiqueta no se edita, se pone o se quita. Es la misma decisión que ya está
-- tomada para las notas y los adjuntos.

drop trigger if exists trg_actividad_etiquetas_chat on public.conversacion_etiquetas;
create trigger trg_actividad_etiquetas_chat
  after insert or delete on public.conversacion_etiquetas
  for each row execute function public.registrar_actividad('{}', 'etiqueta_chat');

commit;
