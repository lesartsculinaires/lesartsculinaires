begin;

-- Documentos de hasta 50 MB saliendo por el chat.
--
-- ------------------------------------------------------------------------
-- POR QUÉ NO ALCANZABA CON SUBIR UN NÚMERO
-- ------------------------------------------------------------------------
--
-- El tope de 4 MB no lo ponía WhatsApp —acepta 100— ni el bucket: lo ponía el
-- camino. El archivo viajaba adentro de la petición a la función de Netlify, y
-- ese cuerpo se corta en 6 MB. Subir la constante habría hecho que un PDF de
-- 20 MB fallara igual, pero más tarde y sin mensaje que se entienda.
--
-- Así que cambia el camino: el navegador sube el archivo derecho a este
-- bucket, sin pasar por Netlify, y al servidor le llega nada más la ruta. De
-- ahí en más el servidor tampoco mueve los bytes —le pasa a Meta un enlace
-- firmado que caduca— así que mandar 50 MB le cuesta lo mismo que mandar 50 KB.
--
-- ------------------------------------------------------------------------
-- LO QUE CAMBIA ACÁ
-- ------------------------------------------------------------------------
--
--   El tope del bucket        de 15 MB a 50.
--   PowerPoint                faltaba, y ese es un error que ya estaba
--                             mordiendo: un .pptx se le mandaba bien al
--                             cliente pero la copia para el hilo la rechazaba
--                             el bucket, y como esa copia se guarda sin
--                             reclamar, el mensaje quedaba en la conversación
--                             como un hueco. Igual .xlsx, que tampoco estaba.
--   Escribir desde el navegador   antes nadie podía, a propósito. Ahora sí,
--                             pero sólo bajo «saliente/», que es la carpeta de
--                             lo que mandamos nosotros.
--
-- ------------------------------------------------------------------------
-- POR QUÉ LA CARPETA APARTE, Y NO PERMISO SOBRE TODO EL BUCKET
-- ------------------------------------------------------------------------
--
-- Debajo de «wa/» está lo que mandó el cliente: capturas de transferencia,
-- fotos de documentos, comprobantes. Eso lo escribe el webhook con la llave de
-- servicio y tiene que seguir siendo intocable desde una sesión de navegador,
-- porque es prueba de lo que pasó. Si la política dejara escribir en todo el
-- bucket, cualquiera con sesión podría reemplazar un comprobante por otro.
--
-- Por eso el permiso llega hasta «saliente/» y ni un carácter más, y además
-- cada archivo queda a nombre de quien lo subió.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ---------------------------------------------------------------- el bucket

update storage.buckets
   set file_size_limit = 50 * 1024 * 1024,
       allowed_mime_types = array[
         -- Fotos: es como llegan las capturas de transferencia.
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         -- Notas de voz. WhatsApp usa ogg/opus; los iPhone a veces mandan mp4.
         'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/aac',
         -- Videos cortos.
         'video/mp4', 'video/3gpp',
         -- Documentos, en las dos direcciones.
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/plain',
         -- Lo que WhatsApp mande y no esté acá arriba se guarda igual: perder
         -- un comprobante por no haber previsto su tipo sería peor.
         'application/octet-stream'
       ]
 where id = 'whatsapp';

-- ------------------------------------------------------------- quién escribe

/*
 * Subir, sólo bajo «saliente/» y a nombre propio.
 *
 * `split_part` toma el primer tramo de la ruta y lo compara entero. Se hace
 * así y no con `like 'saliente%'`, que dejaría pasar «salientefalso/…», ni con
 * `storage.foldername`, que es la función que usa Supabase para esto pero no
 * existe en el banco de pruebas: sin ella la política no se podría probar
 * antes de llegar a producción, que es donde importa que esté bien.
 */
drop policy if exists whatsapp_subir_saliente on storage.objects;
create policy whatsapp_subir_saliente on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'whatsapp'
    and split_part(name, '/', 1) = 'saliente'
    and owner = auth.uid()
  );

/*
 * Borrar lo propio, también sólo en «saliente/».
 *
 * Hace falta para limpiar: si el archivo sube pero WhatsApp rechaza el envío,
 * queda un archivo que nadie va a ver nunca. Sin esto se juntarían para
 * siempre, y son de hasta 50 MB cada uno.
 */
drop policy if exists whatsapp_borrar_saliente on storage.objects;
create policy whatsapp_borrar_saliente on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'whatsapp'
    and split_part(name, '/', 1) = 'saliente'
    and owner = auth.uid()
  );

commit;

-- Cómo quedó.
select
  case when file_size_limit >= 50 * 1024 * 1024 then '✓' else '· revisar' end as estado,
  file_size_limit / 1024 / 1024 || ' MB'                                     as tope,
  case when 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            = any(allowed_mime_types)
       then '✓ PowerPoint permitido' else '· falta PowerPoint' end           as pptx,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('whatsapp_subir_saliente', 'whatsapp_borrar_saliente'))
                                                                             as politicas_nuevas
  from storage.buckets
 where id = 'whatsapp';
