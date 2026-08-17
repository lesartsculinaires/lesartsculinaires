begin;

-- Conexión con Chatwoot.
--
-- Chatwoot se queda como puente con Meta y el CRM se cuelga de él. Así no hay
-- que tocar nada en la configuración de Meta —donde hay una sola URL de
-- webhook y cambiarla dejaría a Chatwoot sin mensajes— y si el CRM falla,
-- ventas puede seguir atendiendo desde Chatwoot mientras se arregla.
--
-- Requiere que antes se haya corrido 20260814120000_whatsapp_inbox.sql.
--
-- Sólo agrega columnas, todas opcionales. Se puede correr con gente adentro.

-- ------------------------------------------------------- conversaciones
alter table public.conversaciones
  -- El id de la conversación en Chatwoot. Es la llave para no duplicar y para
  -- saber a dónde mandar la respuesta.
  add column if not exists chatwoot_id          bigint,
  add column if not exists chatwoot_contacto_id bigint,
  add column if not exists inbox_id             bigint,
  -- open / pending / resolved, tal como lo maneja Chatwoot.
  add column if not exists estado               text not null default 'open',
  -- A quién le toca. Nulo = sin asignar, que es lo que el asesor resuelve.
  add column if not exists vendedor_id          bigint references public.vendedores(id) on delete set null;

-- Único pero aceptando nulos: las conversaciones que ya existieran de la
-- integración directa con Meta no tienen id de Chatwoot y no deben chocar
-- entre sí.
create unique index if not exists ux_conversaciones_chatwoot
  on public.conversaciones (chatwoot_id) where chatwoot_id is not null;

create index if not exists ix_conversaciones_sin_asignar
  on public.conversaciones (vendedor_id, ultimo_mensaje_en desc);

-- ------------------------------------------------------------- mensajes
alter table public.mensajes
  add column if not exists chatwoot_id bigint,
  -- Las notas privadas de Chatwoot: las ve el equipo, no el cliente. Se
  -- guardan porque son parte del hilo de trabajo, pero la pantalla tiene que
  -- distinguirlas o alguien va a creer que el cliente las leyó.
  add column if not exists privado     boolean not null default false;

-- Mismo criterio que arriba, y además es lo que hace que un reintento de
-- Chatwoot no guarde el mensaje dos veces.
create unique index if not exists ux_mensajes_chatwoot
  on public.mensajes (chatwoot_id) where chatwoot_id is not null;

-- ------------------------------------------------ asignar desde el CRM
-- El update de conversaciones ya estaba permitido a `authenticated`, así que
-- asignar y cambiar estado entra por la política que ya existe.

commit;
