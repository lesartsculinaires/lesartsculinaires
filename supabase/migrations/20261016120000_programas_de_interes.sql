-- ===========================================================================
-- Un lead puede preguntar por VARIOS programas
-- ===========================================================================
--
-- Lo pidió la escuela: «en la ficha de clientes quiero que en la parte de los
-- programas se puedan seleccionar varios, ya que un lead puede preguntar por
-- varios programas a la vez; ¿podrías aplicarlo a futuros leads y que no
-- afecte al momento de hacer un lead duplicado?».
--
-- ===========================================================================
-- POR QUÉ UNA TABLA APARTE Y NO CONVERTIR `producto_id` EN UNA LISTA
-- ===========================================================================
--
-- Porque `oportunidades.producto_id` no es sólo una etiqueta: es la columna de
-- la que cuelga la plata. El Dashboard cuenta leads y ventas por programa, el
-- tablero filtra por programa, y `valor_oportunidad` y `venta_cerrada` son de
-- UN trato con UN precio. Convertirla en una lista obligaría a contestar
-- «¿cuánto de estos $495 es de Pastelería y cuánto de Barismo?», que no tiene
-- respuesta, y a reescribir todos los informes para inventarla.
--
-- Así que se separan las dos preguntas, que de verdad son dos:
--
--   producto_id            QUÉ SE ESTÁ VENDIENDO. Uno solo. Es el que cuenta
--                          en el Dashboard, en el tablero y en los montos.
--                          Nada de eso cambia.
--
--   oportunidad_programas  POR QUÉ PREGUNTÓ. Varios. Es lo que la asesora
--                          anota en el primer contacto, cuando la persona
--                          todavía está comparando y no eligió.
--
-- El principal está SIEMPRE también en esta tabla, no sólo en la columna. Así
-- «¿por qué programas preguntó?» se contesta leyendo una sola cosa, y no
-- juntando una columna con una tabla y acordándose de no repetir.
--
-- ===========================================================================
-- Y POR QUÉ ESTO ARREGLA DUPLICADOS EN VEZ DE CREARLOS
-- ===========================================================================
--
-- Hasta ahora, alguien que preguntaba por tres programas terminaba con tres
-- leads —uno por programa—, y en la pantalla de Clientes se leía como la misma
-- persona repetida tres veces. Era el caso que la escuela venía reportando.
--
-- Con esto, esa persona tiene UN lead con tres intereses anotados. Y cuando
-- entra una base nueva que la trae otra vez por uno de esos tres, el CRM ya no
-- le abre otro lead: reconoce que ese programa ya estaba entre los que
-- preguntó y completa el que hay. Esa parte vive en `src/lib/leadRepetido.ts`.
-- ===========================================================================

create table if not exists public.oportunidad_programas (
  oportunidad_id bigint not null references public.oportunidades(id) on delete cascade,
  producto_id    bigint not null references public.productos(id)    on delete cascade,
  created_at     timestamptz not null default now(),
  -- La clave es el par: el mismo programa no se puede anotar dos veces en el
  -- mismo lead, y sin esto un doble clic dejaría «Pastelería» repetida.
  primary key (oportunidad_id, producto_id)
);

-- Se lee siempre por oportunidad —«¿qué pidió este lead?»— y la clave primaria
-- ya sirve para eso. El índice que falta es el del otro lado: «¿quiénes
-- preguntaron por Barismo?», que es la pregunta del envío masivo.
create index if not exists idx_op_programas_producto
  on public.oportunidad_programas (producto_id);

alter table public.oportunidad_programas enable row level security;

-- Mismo criterio que `oportunidades`: el equipo con sesión ve y edita. Saber
-- por qué programas preguntó alguien es parte de atenderlo.
drop policy if exists oportunidad_programas_equipo on public.oportunidad_programas;
create policy oportunidad_programas_equipo on public.oportunidad_programas
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- Los leads que ya están: su programa pasa a ser también su primer interés
-- ---------------------------------------------------------------------------
--
-- Sin esto, las 1604 oportunidades de hoy quedarían con la lista vacía y la
-- ficha diría que no preguntaron por nada, cuando la mayoría tiene su programa
-- cargado. `on conflict do nothing` para poder correrlo dos veces.
insert into public.oportunidad_programas (oportunidad_id, producto_id)
select o.id, o.producto_id
  from public.oportunidades o
 where o.producto_id is not null
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- Que el principal no pueda faltar de la lista
-- ---------------------------------------------------------------------------
--
-- Es la única regla que hay que sostener, y sostenerla acá y no en la pantalla
-- importa: el lead se toca desde la ficha, desde la importación, desde el
-- formulario público y desde el webhook de WhatsApp. Cuatro puertas, y en
-- todas tiene que valer lo mismo.
--
-- Sólo agrega; nunca borra. Cambiar el programa principal de Pastelería a
-- Barismo anota Barismo y DEJA Pastelería: la persona preguntó por las dos, y
-- que la asesora haya cambiado cuál está vendiendo no borra que preguntó.
create or replace function public.anotar_programa_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.producto_id is not null then
    insert into public.oportunidad_programas (oportunidad_id, producto_id)
    values (new.id, new.producto_id)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_programa_principal on public.oportunidades;
create trigger trg_programa_principal
  after insert or update of producto_id on public.oportunidades
  for each row execute function public.anotar_programa_principal();


-- ---------------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.oportunidades)                     as leads,
  (select count(*) from public.oportunidades
    where producto_id is not null)                                as con_programa,
  (select count(*) from public.oportunidad_programas)             as intereses_anotados,
  (select count(*) from public.oportunidades o
    where o.producto_id is not null
      and not exists (select 1 from public.oportunidad_programas p
                       where p.oportunidad_id = o.id
                         and p.producto_id = o.producto_id))      as principales_sin_anotar;
