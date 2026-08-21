begin;

-- Recordatorio de reserva: quince días para completar el pago.
--
-- ------------------------------------------------------------------------
-- LO QUE FALTABA, Y ES EL CORAZÓN DE ESTO
-- ------------------------------------------------------------------------
--
-- `reserva` guarda cuánto dejó el cliente para apartar el cupo, pero no
-- cuándo lo dejó. Y sin el cuándo no hay recordatorio posible: los quince días
-- se cuentan desde ese momento y desde ningún otro. Así que lo primero es la
-- fecha.
--
-- No se pide a mano. Se pone sola cuando el anticipo pasa de vacío a tener
-- monto, con un trigger, por la misma razón por la que el registro de
-- actividad usa triggers: a `oportunidades` se le escribe desde la ficha, el
-- alta, la importación, la API de n8n y las acciones en lote, y si cada camino
-- tuviera que acordarse de poner la fecha, el recordatorio funcionaría hasta
-- el día que alguien agregue un camino nuevo. Desde afuera, un recordatorio
-- que falta se ve igual que uno que no correspondía.
--
-- ------------------------------------------------------------------------
-- LO VIEJO: DE DÓNDE SALE LA FECHA DE LAS RESERVAS QUE YA ESTÁN
-- ------------------------------------------------------------------------
--
-- Del registro de actividad, que anota cada cambio de `reserva` con su fecha.
-- Alcanza para todo lo cargado desde que ese registro existe.
--
-- Para lo anterior a eso no hay dato, y ahí se elige dejarlo en nulo en vez de
-- inventar una fecha. Poner la de creación de la ficha sería cómodo y estaría
-- mal: haría aparecer de golpe una pila de recordatorios «vencidos» de gente
-- que quizá pagó hace meses, y un tablero que arranca con veinte alarmas
-- falsas es un tablero que nadie vuelve a mirar. Esas fichas aparecen en el
-- módulo aparte, marcadas como «sin fecha de reserva», para que alguien las
-- complete si todavía importan.

-- ------------------------------------------------------------ la fecha

alter table public.oportunidades
  add column if not exists reserva_en timestamptz;

comment on column public.oportunidades.reserva_en is
  'Cuándo se registró el anticipo. La pone sola un trigger; de acá salen los '
  'quince días para completar el pago.';

/**
 * Mantiene `reserva_en` al día.
 *
 * Tres casos, y los tres importan:
 *
 *   vacío → con monto   se estampa la fecha: empieza a correr el plazo.
 *   con monto → vacío   se borra: se anuló el anticipo, no hay qué recordar.
 *   monto → otro monto  NO se toca. Corregir un $100 mal tecleado por $150 no
 *                       es una reserva nueva, y reiniciar el plazo le regalaría
 *                       quince días más a alguien que ya lleva diez.
 */
create or replace function public.marcar_reserva()
returns trigger
language plpgsql
as $$
declare
  antes boolean := coalesce(old.reserva, 0) > 0;
  ahora boolean := coalesce(new.reserva, 0) > 0;
begin
  if ahora and not antes then
    new.reserva_en := now();
  elsif antes and not ahora then
    new.reserva_en := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_reserva_fecha on public.oportunidades;
create trigger trg_reserva_fecha
  before insert or update of reserva on public.oportunidades
  for each row execute function public.marcar_reserva();

-- En un INSERT no hay `old`, así que la comparación de arriba necesita una
-- fila vieja imaginaria con todo en nulo. Postgres la da vacía, y leer
-- `old.reserva` ahí devuelve nulo, que es justo lo que se quiere: una ficha
-- que nace con anticipo estampa la fecha.

-- ---------------------------------------------------- lo ya cargado

do $$
begin
  if to_regclass('public.actividad') is null then
    raise notice 'sin registro de actividad: las reservas viejas quedan sin fecha';
    return;
  end if;

  -- La primera vez que se le tocó la reserva a cada ficha. La primera y no la
  -- última: si el monto se corrigió después, el plazo empezó igual el día del
  -- anticipo original.
  update public.oportunidades o
     set reserva_en = primera.cuando
    from (
      select a.oportunidad_id, min(a.creado_en) as cuando
        from public.actividad a
       where a.oportunidad_id is not null
         and a.campos ? 'reserva'
       group by a.oportunidad_id
    ) as primera
   where o.id = primera.oportunidad_id
     and o.reserva_en is null
     and coalesce(o.reserva, 0) > 0;
end $$;

-- -------------------------------------------------- posponer un aviso

/**
 * «Recordámelo más adelante».
 *
 * Es por persona y no por ficha: dos asesores pueden estar mirando la misma
 * oportunidad —uno la atiende, la gerencia la supervisa— y que uno posponga no
 * tiene por qué callarle el aviso al otro.
 *
 * Se guarda hasta cuándo y no «visto sí/no» porque un aviso que se apaga para
 * siempre con un clic es un aviso que se pierde: lo que hace falta es dejar de
 * verlo hoy y volver a verlo cuando corresponda.
 */
create table if not exists public.recordatorios_pospuestos (
  oportunidad_id bigint not null references public.oportunidades(id) on delete cascade,
  usuario_id     uuid   not null references auth.users(id) on delete cascade,
  hasta          timestamptz not null,
  creado_en      timestamptz not null default now(),
  primary key (oportunidad_id, usuario_id)
);

create index if not exists ix_pospuestos_usuario
  on public.recordatorios_pospuestos (usuario_id, hasta);

alter table public.recordatorios_pospuestos enable row level security;

-- Cada quien maneja los suyos y nada más. No hace falta que nadie vea los
-- pospuestos de otro: no son un dato del negocio, son un ajuste de la propia
-- pantalla.
drop policy if exists pospuestos_propios on public.recordatorios_pospuestos;
create policy pospuestos_propios on public.recordatorios_pospuestos
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- --------------------------------------------------------- la vista

-- `vw_pipeline` se rearma para que traiga la fecha. Como en la migración de la
-- reserva, las columnas que pueden faltar se preguntan en vez de escribirse
-- fijas: `importacion_id` la agrega la migración de Bases, que quizá no se
-- corrió.
do $$
declare
  opcionales text := '';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oportunidades'
      and column_name = 'importacion_id'
  ) then
    opcionales := ', o.importacion_id';
  end if;

  drop view if exists public.vw_pipeline;

  execute format($vista$
    create view public.vw_pipeline as
    select o.id, o.codigo, o.fecha_registro, o.fecha_cierre,
           date_trunc('month', o.fecha_registro)::date as mes,
           o.cliente_id, c.nombre as cliente, c.telefono, c.correo,
           o.vendedor_id,   v.nombre  as vendedor,
           o.producto_id,   p.nombre  as producto, p.categoria,
           o.territorio_id, t.nombre  as territorio,
           o.canal_id,      ca.nombre as canal,
           o.etapa_id,      e.nombre  as etapa, e.orden as etapa_orden,
           o.estado_id,     s.nombre  as estado, s.es_final,
           o.valor_oportunidad, o.venta_cerrada, o.reserva, o.reserva_en,
           o.descuento_promocion,
           o.created_at%s,
           c.edad,
           c.responsable_nombre,
           c.responsable_telefono,
           c.responsable_correo
    from public.oportunidades o
    join public.clientes c   on c.id = o.cliente_id
    left join public.vendedores  v  on v.id  = o.vendedor_id
    left join public.productos   p  on p.id  = o.producto_id
    left join public.territorios t  on t.id  = o.territorio_id
    left join public.canales     ca on ca.id = o.canal_id
    left join public.etapas      e  on e.id  = o.etapa_id
    left join public.estados     s  on s.id  = o.estado_id
  $vista$, opcionales);

  -- Como siempre: la vista mira con los permisos de quien pregunta, así que
  -- cada asesor sigue viendo sólo lo suyo.
  execute 'alter view public.vw_pipeline set (security_invoker = true)';
end $$;

commit;
