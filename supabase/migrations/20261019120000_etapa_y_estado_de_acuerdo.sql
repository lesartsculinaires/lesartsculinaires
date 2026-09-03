begin;

-- ============================================================================
-- La columna del tablero y el estado del trato, siempre de acuerdo
-- ============================================================================
--
-- Lo que pidió la escuela: «el Pipeline tiene que estar conectado con Clientes,
-- que conecta para el Dashboard [...] cada cosa que se mueva en leads tiene que
-- verse reflejado en esas áreas conectadas».
--
-- Estaban conectados en el sentido de que las tres pantallas leen la misma
-- consulta. Lo que NO estaba era que los dos campos que dicen «cómo terminó
-- esto» se mantuvieran de acuerdo entre sí.
--
-- ----------------------------------------------------------------------------
-- QUÉ SE VEÍA, Y POR QUÉ
-- ----------------------------------------------------------------------------
--
-- Una consulta sobre la base de la escuela devolvió filas así:
--
--   CRM-0044  Sebastian Canales   etapa: Perdido   estado: Ganado   $420
--   CRM-0586  Albin Sanchez       etapa: Perdido   estado: Ganado   $395
--   CRM-0051  Juana Romero        etapa: Perdido   estado: Reserva  $230
--
-- Ventas ganadas y cobradas, en la columna «Perdido» del tablero.
--
-- No es un error de la pantalla: es la secuela de un cambio de nombre. La
-- etapa «Cierre» —la que iba después de «Pago», donde caían los tratos que se
-- estaban cerrando— se renombró a «Perdido» a pedido de la escuela. Los leads
-- no se movieron, que era lo correcto para un renombre; lo que nadie dijo en
-- ese momento es que «Cierre» no significaba «Perdido», así que 169 leads
-- pasaron a leerse como perdidos de un día para el otro. Muchos estaban
-- ganados y cobrados.
--
-- El daño se reparte según qué pantalla se mire, y de ahí que los números no
-- cuadraran entre sí:
--
--   Indicadores del Dashboard   Miran el ESTADO. Contaban bien: esas ventas
--   (venta cerrada, tasa)       figuraban como ganadas.
--
--   Gráfico «Etapas», y el      Miran la ETAPA. Las mostraban como perdidas.
--   tablero del Pipeline
--
-- ----------------------------------------------------------------------------
-- QUÉ HACE ESTA MIGRACIÓN, Y QUÉ NO
-- ----------------------------------------------------------------------------
--
-- HACE: pone el candado para que no vuelva a pasar. De acá en más, marcar un
-- lead como Ganado o Perdido en la ficha mueve su tarjeta a la columna que
-- corresponde, y arrastrarla a una columna pone el estado. Los dos sentidos.
--
-- NO HACE: tocar los leads que YA quedaron torcidos. Eso son 169 tarjetas
-- cambiando de columna en el tablero de la escuela, y hay que mirarlo antes de
-- correrlo. Está en `supabase/ARREGLAR-ETAPA-Y-ESTADO.sql`, que primero
-- muestra y después escribe.
--
-- ============================================================================

-- --------------------------------------------------------- el vínculo que faltaba
--
-- Ya existía `ganado_por_la_etapa`: arrastrar una tarjeta a «Ganado» pone el
-- estado en Ganado. Andaba bien y se queda.
--
-- Lo que faltaba es el camino de vuelta. Marcar «Ganado» en el desplegable de
-- la ficha —que es como cierra una venta quien está hablando con el cliente,
-- sin pasar por el tablero— no movía la tarjeta a ningún lado: se quedaba
-- donde estaba, y el embudo mostraba en «Negociación» una venta ya cobrada.
--
-- Por eso las dos pantallas podían decir cosas distintas del mismo lead sin
-- que nadie hiciera nada mal.
-- ----------------------------------------------------------------------------
create or replace function public.etapa_por_el_estado()
returns trigger
language plpgsql
as $$
declare
  quiere text;
  destino bigint;
begin
  -- Sólo cuando el estado ACABA de cambiar. Sin esta condición, cada edición
  -- de una ficha ya ganada —anotar el monto, corregir el teléfono— volvería a
  -- arrastrar la tarjeta, y nadie podría dejarla en otra columna a propósito.
  if tg_op = 'UPDATE' and new.estado_id is not distinct from old.estado_id then
    return new;
  end if;

  select s.nombre into quiere
    from public.estados s
   where s.id = new.estado_id;

  if quiere not in ('Ganado', 'Perdido') then
    return new;
  end if;

  /*
   * Si esta misma escritura además movió la tarjeta, manda la persona.
   *
   * Pasa al arrastrar una tarjeta a «Ganado»: el otro disparador pone el
   * estado, y sin esta salida éste querría volver a mover la tarjeta que la
   * persona ya puso donde quería. Entre lo que hizo alguien con la mano y lo
   * que dedujo un disparador, gana la mano.
   */
  if tg_op = 'UPDATE' and new.etapa_id is distinct from old.etapa_id then
    return new;
  end if;

  select e.id into destino from public.etapas e where e.nombre = quiere limit 1;

  -- Sin esa etapa en el catálogo no se inventa ninguna: el estado queda como
  -- lo puso la persona y la tarjeta donde estaba. Es preferible a moverla a
  -- una columna elegida a dedo.
  if destino is null then
    return new;
  end if;

  new.etapa_id := destino;
  return new;
end $$;

/*
 * El nombre empieza con «e» a propósito.
 *
 * Postgres corre los disparadores de una tabla en orden alfabético, así que
 * `trg_etapa_por_el_estado` corre antes que `trg_ganado_por_la_etapa`. Es el
 * orden que hace falta: éste mueve la tarjeta según el estado nuevo, y el otro
 * ve que el estado ya lo cambió la persona y se aparta. Al revés funcionaría
 * igual —los dos preguntan qué acaba de cambiar— pero dejarlo librado a que
 * nadie renombre un disparador es una fragilidad gratuita.
 */
drop trigger if exists trg_etapa_por_el_estado on public.oportunidades;
create trigger trg_etapa_por_el_estado
  before insert or update on public.oportunidades
  for each row execute function public.etapa_por_el_estado();

commit;

-- ------------------------------------------------------------- cómo quedó
--
-- `torcidos` es lo que quedó de antes y esta migración NO arregla: los leads
-- cuya columna contradice su estado. Se acomodan con
-- `supabase/ARREGLAR-ETAPA-Y-ESTADO.sql`, que primero los muestra.
-- ============================================================================
select
  case when exists (
    select 1 from pg_trigger where tgname = 'trg_etapa_por_el_estado'
  ) then '✓ el candado está puesto' else '⚠ REVISAR' end               as candado,
  case when exists (
    select 1 from pg_trigger where tgname = 'trg_ganado_por_la_etapa'
  ) then '✓ y el de ida sigue' else '⚠ falta el otro sentido' end      as ida,
  (select count(*)
     from public.oportunidades o
     join public.estados s on s.id = o.estado_id
     left join public.etapas e on e.id = o.etapa_id
    where s.nombre in ('Ganado', 'Perdido')
      and coalesce(e.nombre, '') <> s.nombre)                          as torcidos,
  (select coalesce(sum(o.venta_cerrada), 0)
     from public.oportunidades o
     join public.estados s on s.id = o.estado_id
     left join public.etapas e on e.id = o.etapa_id
    where s.nombre = 'Ganado'
      and coalesce(e.nombre, '') <> 'Ganado')                          as plata_mal_ubicada;
