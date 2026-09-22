/**
 * El permiso de llamada se guarda por la FECHA DEL EVENTO, no por el orden en
 * que se escribe.
 *
 * ============================================================================
 * QUÉ PASÓ
 * ============================================================================
 *
 * En el hilo de una clienta quedaron los dos eventos, en el mismo minuto:
 *
 *     02:29 p. m.  «No aceptó que lo llamemos por WhatsApp»
 *     02:29 p. m.  «Aceptó que lo llamemos por WhatsApp»
 *
 * El último fue el «sí». La bandeja mostraba «No aceptó que lo llamemos, así
 * que el CRM no se lo vuelve a pedir», sin botón de llamar.
 *
 * La regla de `lib/permisoDeLlamada.ts` no tenía la culpa: dice, y bien, que un
 * permiso vigente gana aunque antes hubiera un rechazo. El problema estaba al
 * guardar. `anotarPermiso` escribía la respuesta y el vencimiento a ciegas, sin
 * mirar qué había. Gana el que escribe último, que no es el mismo que el que
 * ocurrió último: las funciones de Netlify corren en paralelo y Meta puede
 * mandar los dos eventos en el mismo lote. Si el rechazo se procesaba después,
 * borraba el `hasta` que acababa de poner la aceptación.
 *
 * ============================================================================
 * QUÉ CAMBIA
 * ============================================================================
 *
 * Se guarda CUÁNDO ocurrió cada respuesta, y una respuesta sólo se aplica si es
 * más nueva que la guardada. La comparación y la escritura pasan en una sola
 * sentencia, así que dos webhooks simultáneos no se pueden pisar.
 *
 * ----------------------------------------------------------------------------
 * POR QUÉ UNA FUNCIÓN Y NO UN `update ... where` DESDE EL SERVIDOR
 * ----------------------------------------------------------------------------
 *
 * Porque la condición «o la columna es nula, o es menor que esto» a través de
 * PostgREST se arma con filtros encadenados fáciles de escribir mal, y el modo
 * de fallar es el peor posible: silencioso, intermitente, y sólo cuando dos
 * eventos caen juntos. Acá la regla queda escrita una vez, con el porqué al
 * lado.
 *
 * ----------------------------------------------------------------------------
 * LOS EMPATES
 * ----------------------------------------------------------------------------
 *
 * Meta manda la hora en SEGUNDOS, así que dos eventos del mismo segundo llegan
 * con la misma fecha y `>` no alcanza para desempatar. En ese caso gana el
 * «sí»: equivocarse hacia ese lado muestra el botón de llamar y, si el permiso
 * no valía, Meta rechaza la llamada con un error que se lee. Equivocarse al
 * revés esconde el botón y nadie se entera nunca de que se podía llamar.
 *
 * Es idempotente: correrla dos veces no cambia nada la segunda vez.
 */

begin;

-- ---------------------------------------------------------------------------
-- 1. Cuándo ocurrió la última respuesta.
-- ---------------------------------------------------------------------------
--
-- Nula en todas las filas que ya existen, y eso es lo correcto: de lo guardado
-- hasta hoy no sabemos cuándo fue. Una respuesta nula se deja pisar por
-- cualquier evento nuevo, que es justo lo que hace falta para que los hilos
-- que hoy están mal se arreglen solos con el próximo evento real.

alter table public.conversaciones
  add column if not exists llamada_permiso_respondido_en timestamptz;

-- ---------------------------------------------------------------------------
-- 2. La escritura, con la regla adentro.
-- ---------------------------------------------------------------------------
--
-- Devuelve `true` si esta respuesta se aplicó y `false` si se descartó por
-- vieja. El webhook lo registra: un descarte no es un error, pero saber que
-- pasó es la diferencia entre entender este comportamiento y volver a
-- perseguirlo dentro de seis meses.

create or replace function public.anotar_permiso_llamada(
  p_conversacion bigint,
  p_acepto       boolean,
  p_hasta        timestamptz,
  p_cuando       timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  aplicada boolean;
begin
  update public.conversaciones c
     set llamada_permiso_respuesta     = case when p_acepto then 'acepto' else 'rechazo' end,
         -- Un «no» borra el permiso que hubiera: la última palabra es la que
         -- vale. Y un «sí» sin fecha tampoco deja llamar —ver el comentario de
         -- `anotarPermiso`—: se guarda que aceptó, pero sin plazo inventado.
         llamada_permiso_hasta         = case when p_acepto then p_hasta else null end,
         llamada_permiso_respondido_en = p_cuando
   where c.id = p_conversacion
     and (
       c.llamada_permiso_respondido_en is null
       or c.llamada_permiso_respondido_en < p_cuando
       -- El empate del mismo segundo lo gana el «sí». Ver el encabezado.
       or (c.llamada_permiso_respondido_en = p_cuando and p_acepto)
     );

  get diagnostics aplicada = row_count;
  return aplicada;
end;
$$;

comment on function public.anotar_permiso_llamada is
  'Guarda la respuesta al permiso de llamada sólo si es más nueva que la '
  'guardada. Devuelve true si se aplicó. Ver 20261030120000_permiso_por_fecha.sql.';

revoke all on function public.anotar_permiso_llamada(bigint, boolean, timestamptz, timestamptz)
  from public, anon, authenticated;

-- La llama el webhook con la llave de servicio, que es la única que debe poder
-- decir «este cliente aceptó»: si lo pudiera escribir una sesión del navegador,
-- cualquiera con la consola abierta se habilitaría a sí mismo el botón de
-- llamar sobre un cliente que nunca aceptó.
grant execute on function public.anotar_permiso_llamada(bigint, boolean, timestamptz, timestamptz)
  to service_role;

commit;
