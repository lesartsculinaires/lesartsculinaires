-- Migraciones pendientes de Les Arts Culinaires, todas juntas.
--
-- Generado por scripts/armar-pendientes.mjs. No editar a mano: los
-- originales están en supabase/migrations/ y este archivo sale de ellos.
--
-- Va todo en una sola transacción: si algo falla no queda nada a medias.
-- Las 4 se pueden correr dos veces sin romper nada, así que si hay que
-- arreglar algo y volver a pegarlo, se puede.
--
-- Contiene, en orden:
--   1. 20260829120000_media_whatsapp.sql
--   2. 20260830120000_etiquetas.sql
--   3. 20260831120000_plantillas.sql
--   4. 20260901120000_abrir_chat.sql

begin;

-- --------------------------------------------------------------------------
-- 20260829120000_media_whatsapp.sql
-- --------------------------------------------------------------------------

-- Las fotos y documentos que llegan por WhatsApp.
--
-- POR QUÉ NO VAN AL BUCKET DE ADJUNTOS
--
-- Dos razones, y las dos alcanzan por sí solas:
--
-- 1. `adjuntos_subir_archivo` exige `owner = auth.uid()`. Estos archivos los
--    escribe el webhook, que corre con la llave de servicio y no tiene ningún
--    usuario detrás: no hay `auth.uid()` que poner. Con esa política, cada
--    captura de transferencia que llegara sería rechazada.
--
-- 2. La lista de tipos de `adjuntos` es de documentación de clientes: no tiene
--    audio ni video. Por WhatsApp llegan notas de voz todo el tiempo.
--
-- Son cosas distintas además de por lo técnico: un adjunto lo elige una
-- persona para la ficha; esto es lo que mandó el cliente, tal cual llegó.

-- -------------------------------------------------------------------- bucket

-- Privado, igual que adjuntos y por el mismo motivo: acá adentro van a caer
-- comprobantes bancarios y fotos de documentos. Se sirve con enlace firmado
-- que caduca, nunca con una dirección permanente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp',
  'whatsapp',
  false,
  15 * 1024 * 1024,
  array[
    -- Fotos: es como llegan las capturas de transferencia.
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    -- Notas de voz. WhatsApp usa ogg/opus; los iPhone a veces mandan mp4.
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/aac',
    -- Videos cortos.
    'video/mp4', 'video/3gpp',
    -- Documentos que el cliente comparte.
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    -- Lo que WhatsApp mande y no esté acá arriba se guarda igual: perder un
    -- comprobante por no haber previsto su tipo sería peor que guardarlo.
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = false;

-- Leer, todo el equipo con sesión. Quién ve qué conversación ya lo decide la
-- política de `mensajes`; acá alcanza con exigir que haya sesión.
drop policy if exists whatsapp_ver_archivo on storage.objects;
create policy whatsapp_ver_archivo on storage.objects
  for select to authenticated
  using (bucket_id = 'whatsapp');

-- Escribir, nadie desde el navegador. Estos archivos los pone el webhook con
-- la llave de servicio, que se saltea RLS por definición. No hay ningún caso
-- en que una persona deba subir acá a mano: para eso está «Adjuntar» en la
-- ficha, que va al otro bucket y queda a nombre de quien lo subió.

-- ------------------------------------------------------------------ mensajes

alter table public.mensajes
  add column if not exists media_ruta   text,
  add column if not exists media_mime   text,
  add column if not exists media_nombre text,
  -- Por qué no se pudo traer, cuando no se pudo. Se guarda para poder
  -- distinguir «este mensaje no traía archivo» de «traía y lo perdimos», que
  -- es exactamente lo que hay que saber cuando falta un comprobante.
  add column if not exists media_error  text;

comment on column public.mensajes.media_ruta is
  'Ruta dentro del bucket «whatsapp». Nula si el mensaje no traía archivo o si no se pudo bajar.';

-- --------------------------------------------------------------------------
-- 20260830120000_etiquetas.sql
-- --------------------------------------------------------------------------

-- Etiquetas de la bandeja.
--
-- QUÉ SON Y QUÉ NO SON, QUE ES LO QUE IMPORTA ACÁ
--
-- El CRM ya sabe en qué anda un lead: la **etapa** dice dónde está en el
-- pipeline (Primer contacto, Negociación, Cierre…) y el **estado** dice cómo
-- terminó (Ganado, Perdido). Eso vive en `oportunidades` y es de lo que salen
-- todas las métricas.
--
-- Las etiquetas NO son para repetir eso. Si existiera una etiqueta «GANADO»
-- al lado del estado Ganado, tarde o temprano una conversación diría una cosa
-- y su oportunidad la otra, y no habría manera de saber cuál vale. Por eso la
-- bandeja muestra la etapa y el estado de verdad —y deja cambiarlos— en vez de
-- copiarlos acá.
--
-- Las etiquetas son para lo que el pipeline no cubre y cambia seguido: «pidió
-- beca», «no contesta», «pago pendiente», «viene de feria». Son de la
-- conversación, no de la venta.
--
-- QUIÉN PUEDE QUÉ
--
-- Crear, cualquiera del equipo: aparecen en medio de la conversación y hacer
-- que un asesor pida permiso para anotar «no contesta» sería inútil.
-- Renombrar y borrar, sólo dirección: eso cambia lo que ya está puesto en
-- conversaciones que no son suyas.

-- ----------------------------------------------------------------- catálogo

create table if not exists public.etiquetas (
  id         bigint generated by default as identity primary key,
  nombre     text not null,
  -- Color en hexadecimal, para distinguirlas de un vistazo en la lista.
  color      text not null default '#6B665F'
             constraint etiquetas_color_valido check (color ~ '^#[0-9A-Fa-f]{6}$'),
  activa     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- Sin repetidas, y sin distinguir mayúsculas: «Pidió beca» y «pidió beca» son
-- la misma, y tenerlas dos veces partiría en dos cualquier filtro.
create unique index if not exists ux_etiquetas_nombre
  on public.etiquetas (lower(trim(nombre)));

alter table public.etiquetas enable row level security;

drop policy if exists etiquetas_leer on public.etiquetas;
create policy etiquetas_leer on public.etiquetas
  for select to authenticated using (true);

drop policy if exists etiquetas_crear on public.etiquetas;
create policy etiquetas_crear on public.etiquetas
  for insert to authenticated with check (true);

-- Cambiar el nombre o el color, y darlas de baja: sólo dirección.
drop policy if exists etiquetas_administrar on public.etiquetas;
create policy etiquetas_administrar on public.etiquetas
  for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists etiquetas_borrar on public.etiquetas;
create policy etiquetas_borrar on public.etiquetas
  for delete to authenticated using (public.es_admin());

-- --------------------------------------------------------------- asignación

create table if not exists public.conversacion_etiquetas (
  conversacion_id bigint not null references public.conversaciones(id) on delete cascade,
  etiqueta_id     bigint not null references public.etiquetas(id)      on delete cascade,
  puesta_por      uuid references auth.users(id) on delete set null,
  puesta_en       timestamptz not null default now(),
  primary key (conversacion_id, etiqueta_id)
);

create index if not exists ix_conv_etiquetas_etiqueta
  on public.conversacion_etiquetas (etiqueta_id);

alter table public.conversacion_etiquetas enable row level security;

-- Poner y sacar, todo el equipo: es parte de atender la conversación.
drop policy if exists conv_etiquetas_todo on public.conversacion_etiquetas;
create policy conv_etiquetas_todo on public.conversacion_etiquetas
  for all to authenticated using (true) with check (true);

-- ----------------------------------------------------------------- actividad
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_actividad') then
    execute 'drop trigger if exists trg_actividad_etiquetas on public.etiquetas';
    execute 'create trigger trg_actividad_etiquetas
      after insert or update or delete on public.etiquetas
      for each row execute function public.registrar_actividad(
        ''{nombre,color,activa}'', ''etiqueta'')';
  else
    raise notice 'todavía no está el registro de actividad; se omite su trigger';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 20260831120000_plantillas.sql
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- 20260901120000_abrir_chat.sql
-- --------------------------------------------------------------------------

-- Poder abrir un chat desde el CRM.
--
-- EL HUECO QUE TAPA
--
-- `conversaciones` tenía política para leer y para editar, pero ninguna para
-- insertar. No era un olvido: hasta ahora las conversaciones nacían siempre de
-- un mensaje entrante, y eso lo escribe el webhook con la llave de servicio,
-- que se saltea RLS por definición. Nadie había necesitado crear una desde una
-- sesión de navegador.
--
-- Con el botón «Nuevo chat» sí hace falta: es el asesor quien decide empezar la
-- conversación, y su sesión sí pasa por RLS.
--
-- POR QUÉ ALCANZA CON PEDIR SESIÓN
--
-- Una fila de `conversaciones` es un hilo vacío: un teléfono y a quién apunta.
-- No manda nada ni le llega a nadie —mandar es `mensajes`, que ya tiene su
-- propia política y exige que el saliente quede a nombre de quien lo mandó—.
-- Y cualquiera del equipo ya puede leer y editar todas las conversaciones, así
-- que dejar crear una no abre nada que no estuviera abierto.
--
-- Lo que sí protege la tabla es su restricción de unicidad sobre el teléfono:
-- dos personas abriendo el chat del mismo número a la vez no crean dos hilos.

drop policy if exists conversaciones_abrir on public.conversaciones;
create policy conversaciones_abrir on public.conversaciones
  for insert to authenticated with check (true);

commit;
