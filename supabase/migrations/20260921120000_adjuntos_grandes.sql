begin;

-- Documentos grandes saliendo por el chat.
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
-- firmado que caduca— así que mandar veinte megas le cuesta lo mismo que mandar
-- veinte kilos.
--
-- ------------------------------------------------------------------------
-- LO QUE CAMBIA ACÁ
-- ------------------------------------------------------------------------
--
--   El tope del bucket        de 15 MB a 20.
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
-- ------------------------------------------------------------------------
-- POR QUÉ 20 MB Y NO MÁS
-- ------------------------------------------------------------------------
--
-- No es un techo técnico: WhatsApp acepta 100 MB y el camino nuevo no tiene
-- otro límite. Es una decisión sobre el espacio total.
--
-- Lo que sale por el chat se queda guardado para siempre, porque es la única
-- copia de lo que se le mandó al cliente. En el plan gratuito de Supabase hay
-- 1 GB para todo, y ahí un tope de 50 MB alcanza para llenarlo con veinte
-- archivos. Con 20 MB entran dos veces y media más, y sigue estando muy por
-- encima de lo que pesa de verdad una lista de precios o un temario, que
-- andan entre uno y diez megas.
--
-- Para cambiarlo hay que mover dos cosas a la vez, y las dos están señaladas:
-- la línea de acá abajo y `TOPE_DOCUMENTO_BYTES` en
-- `src/lib/whatsapp/adjuntos.ts`. Si sólo se cambia una, el archivo se elige
-- en la pantalla y rebota al subir, o al revés.
--
-- Y hay un tercero que no vive acá: el límite global del proyecto, en
-- Supabase → Storage → Settings. El del bucket no puede pasarlo. En el plan
-- gratuito ese global llega hasta 50 MB; en Pro sube mucho más.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ---------------------------------------------------------------- el bucket

update storage.buckets
   -- EL TOPE. Su gemelo en la aplicación es `TOPE_DOCUMENTO_BYTES`, en
   -- `src/lib/whatsapp/adjuntos.ts`: los dos se cambian juntos o ninguno.
   set file_size_limit = 20 * 1024 * 1024,
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
 * siempre, y son de hasta veinte megas cada uno.
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
  case when file_size_limit = 20 * 1024 * 1024 then '✓' else '· revisar' end as estado,
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
