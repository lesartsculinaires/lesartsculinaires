/**
 * Quién agendó cada evento del calendario.
 *
 * ============================================================================
 * PARA QUÉ HACE FALTA
 * ============================================================================
 *
 * La escuela pidió que, diez minutos antes de una llamada agendada, le salte
 * un aviso «a la persona que creó el evento». Eso hoy no se puede contestar:
 * `eventos` guarda `vendedor_id` —a quién le toca atenderla— y nadie más. Si
 * la jefa le agenda una llamada a una asesora, en la fila no queda rastro de
 * la jefa.
 *
 * Con esta columna el aviso le llega a los dos: a quien tiene que estar en la
 * llamada, y a quien la agendó. Cuando son la misma persona —que es el caso
 * normal— salta una sola vez.
 *
 * ============================================================================
 * SE LLENA SOLA, Y ESO ES LO IMPORTANTE
 * ============================================================================
 *
 * El valor por omisión es `public.mi_vendedor_id()`, la función que ya dice
 * qué vendedor es quien está usando el CRM. Así queda anotado sin tocar
 * ninguno de los lugares que crean eventos —el botón «Nuevo evento», el
 * seguimiento que se agenda al cerrar uno, y el que venga mañana—, y sobre
 * todo sin que se pueda olvidar en el próximo.
 *
 * Queda NULO en dos casos, y los dos son correctos:
 *
 *   LO CREÓ UNA INTEGRACIÓN   n8n y la API entran con la llave de servicio,
 *                             sin sesión, así que no hay persona que anotar.
 *                             Ahí el aviso le llega sólo a quien atiende, que
 *                             es lo que corresponde.
 *
 *   ES DE ANTES DE HOY        Los eventos ya cargados no se rellenan. Poner
 *                             `creado_por = vendedor_id` hacia atrás sería
 *                             inventar un dato: nadie sabe si esa asesora se
 *                             lo agendó ella o se lo agendaron. Un dato
 *                             inventado es peor que uno vacío, porque el vacío
 *                             se nota.
 *
 * ============================================================================
 * LO QUE ESTA COLUMNA NO CAMBIA
 * ============================================================================
 *
 * No toca las políticas. `eventos_ver` deja ver un evento a quien lo atiende,
 * a quien ve todo, y a quien puede ver la oportunidad. Un evento que alguien
 * creó para otra asesora y de un lead que no es suyo no lo vería —y entonces
 * tampoco le va a saltar el aviso—. Es una esquina rara: dirección ve todo, y
 * una asesora que agenda algo casi siempre lo agenda sobre su propio lead.
 *
 * Es idempotente: correrla dos veces no cambia nada la segunda vez.
 */

begin;

alter table public.eventos
  add column if not exists creado_por bigint
    references public.vendedores(id) on delete set null;

-- El valor por omisión va en un paso aparte y con guarda: `mi_vendedor_id()`
-- llega en `20260902120000_cada_quien_lo_suyo.sql`, y si esta migración se
-- corriera antes —o en una base armada a mano— el `alter` de arriba tiene que
-- funcionar igual.
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'mi_vendedor_id'
  ) then
    execute 'alter table public.eventos
               alter column creado_por set default public.mi_vendedor_id()';
  else
    raise notice 'todavía no está mi_vendedor_id(); la columna queda sin valor por omisión';
  end if;
end $$;

comment on column public.eventos.creado_por is
  'Quién agendó el evento. Nulo si lo creó una integración sin sesión, o si es '
  'anterior a la columna. Se usa para avisarle diez minutos antes, además de a '
  'quien lo atiende.';

-- Por este índice pregunta el aviso: «los eventos pendientes que yo agendé».
create index if not exists idx_eventos_creado_por
  on public.eventos (creado_por)
  where creado_por is not null;

commit;

-- Cómo quedó, y cuántos eventos viejos van a quedar sin autor.
select
  count(*)                                              as eventos,
  count(*) filter (where creado_por is null)            as sin_autor,
  count(*) filter (where estado = 'Pendiente'
                     and inicia_en > now())             as pendientes_por_venir
  from public.eventos;
