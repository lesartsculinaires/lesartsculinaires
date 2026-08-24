begin;

-- «Ganado», entre Pago y Cierre, y atada al Estado.
--
-- ------------------------------------------------------------------------
-- QUÉ HACE
-- ------------------------------------------------------------------------
--
-- Agrega la etapa donde iba —después de Pago y antes de Cierre— y deja puesto
-- que mover una ficha ahí le ponga el Estado en «Ganado» sola.
--
-- ------------------------------------------------------------------------
-- POR QUÉ EL VÍNCULO VA EN LA BASE Y NO EN LA PANTALLA
-- ------------------------------------------------------------------------
--
-- A la etapa de una oportunidad se llega por cinco caminos: arrastrando en el
-- tablero, desde la ficha, con las acciones en lote, por la API que usa n8n y
-- desde una importación. Escrito en la pantalla, el vínculo valdría sólo para
-- los dos primeros, y los otros tres dejarían fichas en Ganado con el estado
-- sin tocar —sin que nadie se entere hasta cerrar el mes y ver los números
-- mal—.
--
-- ------------------------------------------------------------------------
-- LO QUE ESCRIBE UNA PERSONA GANA
-- ------------------------------------------------------------------------
--
-- Si la misma escritura cambia la etapa Y manda un estado DISTINTO al que
-- había, gana el estado que mandó la persona. Es raro pero pasa: alguien mueve
-- a Ganado y en el mismo guardado lo marca Perdido porque se arrepintió.
-- Pisarle esa decisión sería discutirle al que está mirando el caso.
--
-- Con el estado repetido —la escritura lo manda igual al que ya tenía— no hay
-- forma de distinguir «lo dejé a propósito» de «ni lo toqué»: a la base le
-- llega lo mismo. Ahí gana la etapa, que es lo que la persona sí movió.
--
-- ------------------------------------------------------------------------
-- LO QUE TRAE PUESTO EL ESTADO GANADO
-- ------------------------------------------------------------------------
--
-- «Ganado» es un estado final, y eso APAGA EL RECORDATORIO DE LA RESERVA: el
-- CRM deja de avisar que hay que cobrar el pago completo. Es lo correcto para
-- una venta terminada, pero conviene saberlo antes de empezar a mover fichas
-- a Ganado con la plata todavía sin entrar.
--
-- Agrega una etapa y un disparador. Se puede correr con gente trabajando, y
-- dos veces.

-- ------------------------------------------------------------- la etapa

do $$
declare
  orden_pago smallint;
begin
  if exists (select 1 from public.etapas where nombre = 'Ganado') then
    raise notice 'la etapa Ganado ya estaba: no se toca el orden';
  else
    select orden into orden_pago from public.etapas where nombre = 'Pago';

    if orden_pago is null then
      -- Sin «Pago» no hay entre qué ponerla; va al final, que es donde menos
      -- estorba, y alguien la acomoda desde la pantalla.
      insert into public.etapas (nombre, orden)
      values ('Ganado', coalesce((select max(orden) from public.etapas), 0) + 1);
      raise notice 'no existe la etapa Pago; Ganado quedó al final';
    else
      /*
       * El corrimiento va en dos pasos porque `orden` es único: pasando de una
       * a la otra directo, la primera fila en moverse chocaría con la que
       * todavía ocupa el lugar siguiente. Yéndose a negativo primero, ningún
       * paso pisa un número ocupado.
       */
      update public.etapas set orden = -orden where orden > orden_pago;
      update public.etapas set orden = -orden + 1 where orden < 0;

      -- Las etapas de fábrica se cargaron con ids escritos a mano; si la
      -- secuencia quedó atrás, el insert chocaría con una clave que ya existe.
      perform setval(
        pg_get_serial_sequence('public.etapas', 'id'),
        coalesce((select max(id) from public.etapas), 1)
      );

      insert into public.etapas (nombre, orden) values ('Ganado', orden_pago + 1);
      raise notice 'Ganado quedó entre Pago y lo que seguía';
    end if;
  end if;
end $$;

-- --------------------------------------------------------- el vínculo

create or replace function public.ganado_por_la_etapa()
returns trigger
language plpgsql
as $$
declare
  id_etapa  bigint;
  id_estado bigint;
begin
  select id into id_etapa  from public.etapas  where nombre = 'Ganado' limit 1;
  select id into id_estado from public.estados where nombre = 'Ganado' limit 1;

  if id_etapa is null or id_estado is null then
    return new;
  end if;

  -- Sólo cuando la etapa ACABA de cambiar a Ganado. Sin esa condición, cada
  -- edición de una ficha que ya está en Ganado —anotar un monto, cambiar el
  -- programa— volvería a forzar el estado, y nadie podría sacarla de Ganado
  -- sin moverla de columna primero.
  if new.etapa_id is distinct from id_etapa then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;

  -- Y si esta misma escritura además cambió el estado, manda la persona.
  if tg_op = 'UPDATE' and new.estado_id is distinct from old.estado_id then
    return new;
  end if;

  new.estado_id := id_estado;

  -- Una venta ganada no tiene motivo de pérdida. Se limpia acá y no se deja
  -- para el otro disparador porque el orden en que corren depende de sus
  -- nombres, y eso es demasiado frágil para algo que se lee en el tablero.
  new.motivo_perdida_id := null;

  return new;
end $$;

drop trigger if exists trg_ganado_por_la_etapa on public.oportunidades;
create trigger trg_ganado_por_la_etapa
  before insert or update on public.oportunidades
  for each row execute function public.ganado_por_la_etapa();

commit;
