begin;

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

commit;
