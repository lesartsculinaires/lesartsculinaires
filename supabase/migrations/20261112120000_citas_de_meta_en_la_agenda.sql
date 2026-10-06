-- Las citas que la gente agenda desde Messenger entran en la agenda del CRM.
--
-- ============================================================================
-- DE DÓNDE SALE ESTO
-- ============================================================================
--
-- Meta manda las citas por el mismo webhook que los mensajes, como un adjunto
-- `appointment_booking`. Ya se leen y se ven en el hilo como tarjeta. Lo que
-- faltaba era que aparecieran en el Calendario, que es donde alguien va a mirar
-- qué tiene la semana que viene.
--
-- La agenda no las aceptaba por tres razones, y las tres se arreglan acá.
--
-- ============================================================================
-- 1. EL CANAL NO EXISTÍA
-- ============================================================================
--
-- `eventos.canal` admitía Presencial, Llamada, WhatsApp y Meet. Una cita pedida
-- por Messenger no es ninguna de esas: meterla como «Llamada» sería inventar
-- que alguien va a llamar, cuando lo que se sabe es por dónde la pidió.
--
-- ============================================================================
-- 2. NO HABÍA DÓNDE DECIR QUE LA PIDIÓ EL CLIENTE
-- ============================================================================
--
-- Los siete tipos que había son cosas que decide la escuela: una llamada que
-- alguien agenda, un tour que alguien ofrece. Ésta la pide el cliente solo,
-- desde su teléfono, sin que nadie del equipo intervenga. Es otra cosa y por
-- eso lleva tipo propio: en el Calendario se distingue de un vistazo lo que hay
-- que atender porque alguien lo pidió de lo que uno mismo se propuso hacer.
--
-- ============================================================================
-- 3. UNA CITA CANCELADA NO TENÍA ESTADO
-- ============================================================================
--
-- Los estados eran Pendiente, Realizado, No se presentó y Reagendado. Meta
-- avisa cuando alguien cancela, y sin un estado para eso las opciones eran
-- borrar la fila —y perder que hubo una cita y se cayó, que es justo lo que
-- conviene saber— o dejarla como Pendiente, que es mentir.
--
-- «No se presentó» no sirve: es otra cosa. Cancelar con aviso y no aparecer son
-- dos comportamientos distintos de un lead, y el que los mira necesita poder
-- separarlos.

begin;

-- ---------------------------------------------------------------- el canal
--
-- Instagram va junto con Messenger aunque hoy casi no se use: es el mismo
-- webhook y el mismo adjunto, y el día que llegue una cita por ahí va a entrar
-- sola. Dejarla afuera la haría fallar en silencio dentro del webhook.

alter table public.eventos drop constraint if exists eventos_canal_check;

alter table public.eventos
  add constraint eventos_canal_check
  check (canal in ('Presencial', 'Llamada', 'WhatsApp', 'Meet', 'Messenger', 'Instagram'));

-- ---------------------------------------------------------------- el estado

alter table public.eventos drop constraint if exists eventos_estado_check;

alter table public.eventos
  add constraint eventos_estado_check
  check (estado in ('Pendiente', 'Realizado', 'No se presentó', 'Reagendado', 'Cancelado'));

-- ------------------------------------------------------------------ el tipo
--
-- El id va fijo y no por secuencia: `tipos_evento.id` es smallint sin default y
-- los siete que hay se insertaron igual, a mano. El `on conflict` es para poder
-- correr esto dos veces sin que explote.

insert into public.tipos_evento (id, nombre, codigo, color, duracion_min, orden)
values (7, 'Cita agendada por el cliente', 'CC', '#A8457B', 30, 7)
on conflict (id) do nothing;

-- -------------------------------------------------------- la reserva de Meta
--
-- POR QUÉ HACE FALTA GUARDAR EL ID DE META
--
-- Una misma cita manda varios mensajes: se pide, se confirma, se cancela. Los
-- tres son mensajes distintos con `mid` distinto, pero LA MISMA RESERVA, y
-- tienen que ser UN evento que cambia de estado y no tres eventos en el
-- calendario del mismo día a la misma hora.
--
-- `booking_id` es lo único que los hila, así que se guarda acá y el webhook
-- busca por él antes de insertar.

alter table public.eventos
  add column if not exists meta_booking_id text;

comment on column public.eventos.meta_booking_id is
  'El id de la reserva en Meta. Hila la solicitud con su confirmación o su cancelación.';

-- Único, pero sólo entre los que lo tienen: los eventos que arma el equipo a
-- mano no tienen ninguno y son la enorme mayoría. Un índice único normal los
-- dejaría convivir igual —en SQL los nulos no chocan entre sí— pero el parcial
-- además no los indexa, que es lo que corresponde cuando la columna es la
-- excepción y no la regla.
create unique index if not exists eventos_meta_booking_id_key
  on public.eventos (meta_booking_id)
  where meta_booking_id is not null;

commit;
