/**
 * El permiso de llamada que NO VENCE.
 *
 * ============================================================================
 * QUÉ PASÓ
 * ============================================================================
 *
 * Una clienta aceptó que la llamaran y el botón «Llamar» no apareció nunca.
 * Mirando lo que Meta manda de verdad, hay DOS formas de aceptación y el CRM
 * sólo entendía una:
 *
 *   PERMISO TEMPORAL — el que funcionaba
 *     {"response":"accept","is_permanent":false,
 *      "response_source":"user_action","expiration_timestamp":1790704138}
 *
 *   PERMISO PERMANENTE — el que rompía
 *     {"response":"accept","is_permanent":true,
 *      "response_source":"user_action"}
 *
 * El permanente NO trae `expiration_timestamp`, porque no vence. El lector sólo
 * buscaba esa fecha, no la encontraba, y guardaba `llamada_permiso_hasta` en
 * nulo. Y la regla de `lib/permisoDeLlamada.ts` dice —con razón para el caso
 * temporal— que sin fecha no hay permiso. Resultado: la persona que da el
 * permiso MÁS AMPLIO es justamente a la que no se le podía llamar.
 *
 * ============================================================================
 * POR QUÉ UNA COLUMNA Y NO UNA FECHA MUY LEJANA
 * ============================================================================
 *
 * La tentación es guardar «hasta el año 2100» y que todo lo demás siga igual.
 * Sería mentira en la base: dentro de un año alguien miraría esa fecha y no
 * sabría si es un permiso permanente o un error de carga, y cualquier informe
 * que cuente permisos por vencer la contaría mal.
 *
 * La columna dice lo que es. `hasta` sigue significando exactamente lo que
 * decía: cuándo vence, y nulo cuando no aplica.
 *
 * Es idempotente: correrla dos veces no cambia nada la segunda vez.
 */

begin;

-- ---------------------------------------------------------------------------
-- 1. La columna.
-- ---------------------------------------------------------------------------

alter table public.conversaciones
  add column if not exists llamada_permiso_permanente boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Los que ya habían aceptado y se quedaron sin botón.
-- ---------------------------------------------------------------------------
--
-- No se adivina: se lee el mensaje que Meta guardó en `mensajes.payload`, que
-- está entero desde el primer día. Se toma la ÚLTIMA respuesta de cada hilo
-- —una persona puede haber aceptado, rechazado y vuelto a aceptar— y sólo se
-- toca si esa última fue una aceptación permanente.
--
-- `llamada_permiso_respuesta` no se toca: ya dice «acepto» en estos hilos. Lo
-- único que faltaba era saber que el permiso no vence.

with ultima as (
  select distinct on (m.conversacion_id)
         m.conversacion_id,
         m.payload -> 'interactive' -> 'call_permission_reply' as respuesta
    from public.mensajes m
   where m.tipo = 'interactive'
     and m.payload -> 'interactive' ->> 'type' = 'call_permission_reply'
   order by m.conversacion_id, m.creado_en desc, m.id desc
)
update public.conversaciones c
   set llamada_permiso_permanente = true
  from ultima u
 where u.conversacion_id = c.id
   and u.respuesta ->> 'response' in ('accept', 'accepted')
   and (u.respuesta ->> 'is_permanent')::boolean is true
   and c.llamada_permiso_permanente is distinct from true;

-- ---------------------------------------------------------------------------
-- 3. Fuera la versión de cuatro parámetros.
-- ---------------------------------------------------------------------------
--
-- Va ANTES de crear la nueva, y el orden no es cosmético: el quinto parámetro
-- tiene valor por omisión, así que mientras las dos existan una llamada con
-- cuatro argumentos encaja en las dos y Postgres se niega, con
-- «function name "public.anotar_permiso_llamada" is not unique». Borrando
-- primero, nunca conviven.
--
-- Y hay que borrarla igual, no sólo por eso: dejar viva la de cuatro
-- parámetros sería dejar una puerta que guarda el permiso SIN la marca de
-- permanente. El día que alguien la llamara, volvería este mismo problema sin
-- ninguna señal.

drop function if exists public.anotar_permiso_llamada(bigint, boolean, timestamptz, timestamptz);

-- ---------------------------------------------------------------------------
-- 4. La escritura, ahora con el permiso permanente adentro.
-- ---------------------------------------------------------------------------
--
-- Reemplaza a la de `20261030120000_permiso_por_fecha.sql`. La regla de esa
-- migración —gana el evento más nuevo, y el empate del mismo segundo lo gana el
-- «sí»— no cambia; lo que se agrega es el cuarto dato.
--
-- Un rechazo borra las tres cosas: la fecha, la marca de permanente y, con
-- ellas, el botón. La última palabra del cliente es la que vale.

create or replace function public.anotar_permiso_llamada(
  p_conversacion bigint,
  p_acepto       boolean,
  p_hasta        timestamptz,
  p_cuando       timestamptz,
  p_permanente   boolean default false
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
         llamada_permiso_hasta         = case when p_acepto then p_hasta else null end,
         llamada_permiso_permanente    = case when p_acepto then coalesce(p_permanente, false)
                                              else false end,
         llamada_permiso_respondido_en = p_cuando
   where c.id = p_conversacion
     and (
       c.llamada_permiso_respondido_en is null
       or c.llamada_permiso_respondido_en < p_cuando
       -- El empate del mismo segundo lo gana el «sí». Ver la migración anterior.
       or (c.llamada_permiso_respondido_en = p_cuando and p_acepto)
     );

  get diagnostics aplicada = row_count;
  return aplicada;
end;
$$;

comment on function public.anotar_permiso_llamada is
  'Guarda la respuesta al permiso de llamada sólo si es más nueva que la '
  'guardada, incluido el permiso permanente. Devuelve true si se aplicó. '
  'Ver 20261031120000_permiso_permanente.sql.';

revoke all on function public.anotar_permiso_llamada(bigint, boolean, timestamptz, timestamptz, boolean)
  from public, anon, authenticated;

grant execute on function public.anotar_permiso_llamada(bigint, boolean, timestamptz, timestamptz, boolean)
  to service_role;

commit;
