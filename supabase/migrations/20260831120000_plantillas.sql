begin;

-- Las plantillas de WhatsApp, copiadas de Meta.
--
-- POR QUÉ SE GUARDAN ACÁ SI VIVEN EN META
--
-- Meta es el dueño de las plantillas: se crean allá, las aprueba o rechaza
-- allá, y el CRM no puede cambiarlas. Esta tabla es una copia para poder
-- mostrarlas sin depender de que la API conteste, y sobre todo para que la
-- pantalla sirva ANTES de que WhatsApp esté conectado: se ve la lista vacía y
-- el botón para ir a crear la primera, en vez de un error.
--
-- Se refresca con el botón «Sincronizar». Nunca al revés: lo que se escriba
-- acá no llega a Meta.
--
-- EL ESTADO ES EL DATO IMPORTANTE
--
-- Una plantilla existe desde que se crea, pero sólo se puede mandar cuando
-- Meta la aprobó. Una en revisión o rechazada figura igual en la lista de la
-- API, y mandarla falla. Por eso el estado se guarda y se muestra: es la
-- diferencia entre «ya la puedo usar» y «todavía no».

create table if not exists public.plantillas (
  -- El id que le pone Meta. Es la clave: si se borra y se vuelve a crear una
  -- plantilla con el mismo nombre, para Meta es otra.
  id            text primary key,
  nombre        text not null,
  -- es, en, en_US… Una misma plantilla puede tener varios idiomas, y cada uno
  -- es una fila distinta en Meta.
  idioma        text not null,
  -- APPROVED / PENDING / REJECTED / PAUSED / DISABLED, tal como lo dice Meta.
  estado        text not null,
  -- MARKETING / UTILITY / AUTHENTICATION.
  categoria     text,
  -- El texto del cuerpo, con sus {{1}} sin reemplazar. Es lo que se previsualiza.
  cuerpo        text,
  -- Cuántos huecos {{n}} tiene el cuerpo: hay que llenarlos todos para poder
  -- mandarla, y saberlo antes evita un error de Meta.
  variables     int not null default 0,
  -- El objeto entero, para no perder los botones y encabezados que hoy no se
  -- usan pero que están ahí.
  payload       jsonb,
  sincronizada_en timestamptz not null default now()
);

create index if not exists ix_plantillas_estado on public.plantillas (estado, nombre);

alter table public.plantillas enable row level security;

-- Leer, todo el equipo: hay que poder elegir una para mandarla.
drop policy if exists plantillas_leer on public.plantillas;
create policy plantillas_leer on public.plantillas
  for select to authenticated using (true);

-- Escribir, nadie desde el navegador. Las escribe el servidor al sincronizar,
-- con la llave de servicio. Editarlas a mano no serviría de nada: la copia se
-- pisa en la siguiente sincronización y Meta no se entera.

-- Cuándo se sincronizó por última vez, para poder decirlo en la pantalla igual
-- que lo hace el panel de Meta. Una sola fila.
create table if not exists public.plantillas_sync (
  id          int primary key default 1 constraint plantillas_sync_una_fila check (id = 1),
  intentado_en timestamptz,
  logrado_en   timestamptz,
  error        text
);

insert into public.plantillas_sync (id) values (1) on conflict (id) do nothing;

alter table public.plantillas_sync enable row level security;

drop policy if exists plantillas_sync_leer on public.plantillas_sync;
create policy plantillas_sync_leer on public.plantillas_sync
  for select to authenticated using (true);

commit;
