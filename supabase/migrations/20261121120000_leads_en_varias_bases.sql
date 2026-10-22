-- ============================================================================
-- Un lead puede estar en varias bases
-- ============================================================================
--
-- Pedido el 22/10/2026: «Base de egresados-no graduados.xlsx» trajo 285
-- personas y la pantalla de Bases mostraba 23. Las otras 262 ya estaban en el
-- CRM, se unificaron con su ficha —bien— y quedaron fuera de la base, porque
-- un lead sólo podía apuntar a una (`oportunidades.importacion_id`, la base
-- que lo CREÓ). Sin ellas no se las puede elegir en Clientes con el filtro
-- «Base» para mandarles un masivo.
--
-- `base_leads` dice qué leads ESTÁN en cada base, sin importar cuál los creó.
-- `importacion_id` se queda como estaba: sigue siendo «de qué carga vino», y
-- es lo que mira `borrar_base` para no llevarse leads que existían de antes.
--
-- Sólo agrega; no cambia ni borra datos.

begin;

create table if not exists public.base_leads (
  importacion_id bigint not null references public.importaciones(id) on delete cascade,
  oportunidad_id bigint not null references public.oportunidades(id) on delete cascade,
  creado_en      timestamptz not null default now(),
  primary key (importacion_id, oportunidad_id)
);

create index if not exists ix_base_leads_oportunidad on public.base_leads (oportunidad_id);

-- Lo que ya había: cada lead, en la base que lo creó.
insert into public.base_leads (importacion_id, oportunidad_id)
select o.importacion_id, o.id
  from public.oportunidades o
 where o.importacion_id is not null
on conflict do nothing;

-- Y de acá en adelante, sola: todo lead creado por una base (o pasado a otra
-- con «Crear base nueva») queda anotado en ella.
create or replace function public.anotar_en_su_base()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.importacion_id is not null then
    insert into public.base_leads (importacion_id, oportunidad_id)
    values (new.importacion_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_anotar_en_su_base on public.oportunidades;
create trigger trg_anotar_en_su_base
  after insert or update of importacion_id on public.oportunidades
  for each row execute function public.anotar_en_su_base();

-- Mismo permiso que `importaciones`: son sólo números que unen una base con
-- un lead; quién ve cada lead lo sigue decidiendo el RLS de `oportunidades`.
alter table public.base_leads enable row level security;

drop policy if exists auth_all_base_leads on public.base_leads;
create policy auth_all_base_leads on public.base_leads
  for all to authenticated using (true) with check (true);

commit;
