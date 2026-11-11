-- La ventana de 15 minutos del bot de carnets (11/11/2026).
--
-- Después de «Ver Carnet», el webhook de WhatsApp le sigue pasando a n8n lo
-- que escriba ese chat durante 15 minutos: así llegan el código de estudiante
-- y los 4 dígitos del DUI, que por sí solos no despiertan al bot. Esa ventana
-- se anota acá (src/lib/whatsapp/filtroCarnet.ts).
--
-- La tabla se usaba desde el 12/10/2026 pero ninguna migración la creaba. Si
-- en producción no existía, el código y el DUI nunca salían hacia n8n. Se crea
-- sólo si falta, para no tocar una que se haya hecho a mano.
--
-- Sólo la usa el servidor con la llave de servicio: RLS activo y sin
-- políticas, nadie más la puede leer ni escribir por la API.

create table if not exists public.n8n_ventana_carnet (
  telefono  text primary key,
  expira_en timestamptz not null
);

alter table public.n8n_ventana_carnet enable row level security;

revoke all on table public.n8n_ventana_carnet from anon, authenticated;

comment on table public.n8n_ventana_carnet is
  'Chats que dijeron «Ver Carnet» en los últimos 15 minutos: lo que escriban sigue saliendo a n8n (código y DUI).';
