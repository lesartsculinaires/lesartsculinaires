-- ============================================================================
-- Las etiquetas que quita una persona no las vuelve a poner el agente
-- ============================================================================
--
-- Pedido el 28/11/2026 (LAC): que las etiquetas que pone el agente IA se
-- puedan quitar para que las asesoras sigan el caso en el CRM.
--
-- Quitarlas ya se podía (la «×» en la cabecera del chat), pero no duraba: el
-- agente vuelve a poner «cursos cortos» cada vez que el cliente escribe algo
-- de cursos (`agente_etiqueta_cursos_trg` → `agente_etiquetar`). De las 319
-- que había el 28/11, 318 las había puesto el agente.
--
-- Ahora se anota cuando una PERSONA quita una etiqueta de un chat, y
-- `agente_etiquetar` respeta esa decisión en ese chat. Si una persona la
-- vuelve a poner, la nota se borra y todo sigue como antes.
--
-- «Necesita atención» queda afuera a propósito: cada alerta del agente es un
-- aviso nuevo, y que se quite al atender una no puede silenciar la próxima.
--
-- `agente_etiquetar` es del agente (no nació en este repositorio). Se
-- reescribe IGUAL que como estaba el 28/11/2026, más la comprobación.

create table if not exists public.etiquetas_quitadas_chat (
  conversacion_id bigint not null references public.conversaciones(id) on delete cascade,
  etiqueta_id     bigint not null references public.etiquetas(id) on delete cascade,
  quitada_por     uuid references public.usuarios(id) on delete set null,
  quitada_en      timestamptz not null default now(),
  primary key (conversacion_id, etiqueta_id)
);
alter table public.etiquetas_quitadas_chat enable row level security;
revoke all on public.etiquetas_quitadas_chat from anon, authenticated;

-- Anota o borra la nota, según quién toque la etiqueta. Sólo cuenta una
-- persona con sesión: lo que hace el agente o un proceso del sistema no.
create or replace function public.anotar_etiqueta_quitada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quien uuid := (select auth.uid());
begin
  if v_quien is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    insert into public.etiquetas_quitadas_chat (conversacion_id, etiqueta_id, quitada_por)
    values (old.conversacion_id, old.etiqueta_id, v_quien)
    on conflict (conversacion_id, etiqueta_id)
      do update set quitada_por = excluded.quitada_por, quitada_en = now();
  elsif tg_op = 'INSERT' then
    delete from public.etiquetas_quitadas_chat
     where conversacion_id = new.conversacion_id and etiqueta_id = new.etiqueta_id;
  end if;
  return null;
exception when others then
  -- Nunca impedir que se ponga o se quite una etiqueta por esto.
  raise warning 'anotar_etiqueta_quitada: %', sqlerrm;
  return null;
end $$;
revoke execute on function public.anotar_etiqueta_quitada() from public, anon, authenticated;

drop trigger if exists trg_anotar_etiqueta_quitada on public.conversacion_etiquetas;
create trigger trg_anotar_etiqueta_quitada
  after insert or delete on public.conversacion_etiquetas
  for each row execute function public.anotar_etiqueta_quitada();

-- La del agente, igual que antes más una cosa: no vuelve a poner en un chat una
-- etiqueta que una persona quitó de ahí (salvo «Necesita atención»).
create or replace function public.agente_etiquetar(p_conversacion_id bigint, p_nombre text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id bigint;
begin
  select id into v_id from public.etiquetas where lower(nombre) = lower(p_nombre) and activa limit 1;
  if v_id is not null and p_conversacion_id is not null then
    if lower(p_nombre) <> lower('Necesita atención') and exists (
         select 1 from public.etiquetas_quitadas_chat q
          where q.conversacion_id = p_conversacion_id and q.etiqueta_id = v_id) then
      return;
    end if;
    insert into public.conversacion_etiquetas (conversacion_id, etiqueta_id) values (p_conversacion_id, v_id)
    on conflict (conversacion_id, etiqueta_id) do nothing;
  end if;
exception when others then
  raise warning 'agente_etiquetar: %', sqlerrm;
end;
$function$;
