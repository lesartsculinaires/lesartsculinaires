begin;

-- ============================================================================
-- La fecha de cierre se pone sola, igual que la de registro
-- ============================================================================
--
-- Lo pidió la escuela: «cuando se pase de perdido o cierre haz la misma acción
-- que cuando entra un lead, y es que coloca la fecha de perdido o de cierre».
--
-- Cuando entra un lead nadie escribe la fecha de registro: la pone el CRM. Al
-- cerrarlo, en cambio, había que acordarse, y de eso salían dos cosas:
--
--   · Fichas ganadas sin fecha. En la base de la escuela son las que hacían
--     que no se pudiera preguntar «¿cuánto entró en agosto?»: el tablero
--     agrupa por fecha de registro justamente porque la de cierre casi nunca
--     estaba cargada.
--
--   · Fechas puestas el día que alguien se acordó, que es peor que no tenerla,
--     porque parece un dato y no lo es.
--
-- ============================================================================
-- CUÁNDO ACTÚA, Y CUÁNDO SE APARTA
-- ============================================================================
--
-- SE PONE      Cuando el estado pasa a uno final —Ganado o Perdido— y la
--              ficha no tenía fecha de cierre. La fecha es la de hoy en El
--              Salvador, no la del servidor: a las seis de la tarde de un 31
--              de agosto, en UTC ya es septiembre, y esa venta tiene que
--              contar en agosto.
--
-- SE BORRA     Cuando el estado vuelve a uno no final. Un lead que se
--              reabre no está cerrado, y dejarle la fecha vieja no es
--              conservar un dato: es sostener uno que ya es falso. Además la
--              bandeja usa «sin fecha de cierre» para saber cuál es el lead
--              vivo de una persona, así que una fecha huérfana la haría
--              mostrar la ficha equivocada.
--
-- NO TOCA      Si la misma escritura trae una fecha distinta, manda la
--              persona. Es el caso de cargar una venta vieja: se marca
--              Ganado y se escribe la fecha real de cuando se cobró, y este
--              disparador no tiene por qué pisarla con la de hoy.
--
-- Se mira el ESTADO y no la etapa porque son la misma cosa desde
-- `20261019120000_etapa_y_estado_de_acuerdo`: arrastrar la tarjeta a «Ganado»
-- pone el estado, y marcar el estado mueve la tarjeta. Un solo campo que
-- mirar es un caso menos donde equivocarse.
-- ============================================================================

create or replace function public.fecha_de_cierre_sola()
returns trigger
language plpgsql
as $$
declare
  termina_ahora boolean;
  terminaba_antes boolean;
  hoy date := (now() at time zone 'America/El_Salvador')::date;
begin
  select coalesce(s.es_final, false) into termina_ahora
    from public.estados s where s.id = new.estado_id;
  termina_ahora := coalesce(termina_ahora, false);

  if tg_op = 'INSERT' then
    if termina_ahora and new.fecha_cierre is null then
      new.fecha_cierre := hoy;
    end if;
    return new;
  end if;

  -- La fecha que escribió alguien gana siempre. Va antes que todo lo demás
  -- para que ni siquiera se calcule el resto.
  if new.fecha_cierre is distinct from old.fecha_cierre then
    return new;
  end if;

  select coalesce(s.es_final, false) into terminaba_antes
    from public.estados s where s.id = old.estado_id;
  terminaba_antes := coalesce(terminaba_antes, false);

  if termina_ahora and not terminaba_antes and new.fecha_cierre is null then
    new.fecha_cierre := hoy;
  elsif not termina_ahora and terminaba_antes then
    new.fecha_cierre := null;
  end if;

  return new;
end $$;

/*
 * El nombre empieza con «p» y no es casual, igual que en la migración de la
 * etapa y el estado.
 *
 * Postgres corre los disparadores de una tabla en orden alfabético, y en
 * `oportunidades` ya hay dos que pueden cambiar el estado durante la misma
 * escritura: `trg_etapa_por_el_estado` y `trg_ganado_por_la_etapa`. Éste tiene
 * que ver el estado YA resuelto, así que su nombre tiene que ordenar después
 * de «g». Con «trg_fecha_...» correría en el medio y se perdería justo el caso
 * de arrastrar una tarjeta a «Ganado», que es de los más comunes.
 */
drop trigger if exists trg_pone_la_fecha_de_cierre on public.oportunidades;
create trigger trg_pone_la_fecha_de_cierre
  before insert or update on public.oportunidades
  for each row execute function public.fecha_de_cierre_sola();

commit;

-- ------------------------------------------------------------- cómo quedó
--
-- `cerradas_sin_fecha` son las que YA estaban cerradas antes de esto. No se
-- tocan a propósito: ponerles la fecha de hoy diría que se cerraron hoy, y no
-- hay forma de saber cuándo fue. De acá en adelante no se suman más.
-- ============================================================================
select
  case when exists (
    select 1 from pg_trigger where tgname = 'trg_pone_la_fecha_de_cierre'
  ) then '✓ la fecha de cierre se pone sola' else '⚠ REVISAR' end      as candado,
  (select count(*)
     from public.oportunidades o
     join public.estados s on s.id = o.estado_id
    where s.es_final and o.fecha_cierre is null)                       as cerradas_sin_fecha,
  (select count(*)
     from public.oportunidades o
     join public.estados s on s.id = o.estado_id
    where not s.es_final and o.fecha_cierre is not null)               as vivas_con_fecha;
