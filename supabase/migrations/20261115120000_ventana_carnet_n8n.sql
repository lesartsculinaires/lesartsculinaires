-- Ventana de seguimiento del bot de carnets.
--
-- Después de que alguien escribe «Ver Carnet», lo que siga escribiendo ese
-- mismo chat durante 20 minutos también sale hacia n8n, aunque por sí solo no
-- sea un disparador. Es lo que permite la verificación: el estudiante responde
-- su código y luego los cuatro dígitos del DUI, y ninguno de los dos se
-- reconoce por el texto.
--
-- Vive en la base y no en memoria porque las funciones de Netlify arrancan en
-- frío: una variable del proceso se perdería justo entre un mensaje y el
-- siguiente, que es cuando hace falta.
--
-- No crece sin control: hay una fila por teléfono y se reescribe, así que el
-- tamaño queda acotado a cuánta gente haya pedido un carnet alguna vez. Si
-- algún día estorba, `delete from n8n_ventana_carnet where expira_en < now()`.

create table if not exists public.n8n_ventana_carnet (
  telefono   text primary key check (char_length(telefono) <= 20),
  expira_en  timestamptz not null
);

comment on table public.n8n_ventana_carnet is
  'Chats de WhatsApp que siguen saliendo al bot de carnets tras un disparador.';

create index if not exists ix_n8n_ventana_carnet_expira
  on public.n8n_ventana_carnet (expira_en);

alter table public.n8n_ventana_carnet enable row level security;

-- Supabase les da TODO a `anon` y `authenticated` sobre cada tabla nueva, y
-- RLS no frena un TRUNCATE. Acá no se devuelve nada: la única que escribe y
-- lee esta tabla es la ruta del webhook, con la llave de service role, que
-- pasa por encima de RLS. Sin políticas, nadie más la ve.
revoke all on public.n8n_ventana_carnet from anon;
revoke all on public.n8n_ventana_carnet from authenticated;
