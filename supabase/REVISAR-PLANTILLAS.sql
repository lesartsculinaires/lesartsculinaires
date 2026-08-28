-- ¿Por qué no se manda una plantilla de WhatsApp?
--
-- ------------------------------------------------------------------------
-- ESTO NO CAMBIA NADA
-- ------------------------------------------------------------------------
--
-- Son consultas. Se puede correr en horario de trabajo las veces que haga
-- falta.
--
-- ------------------------------------------------------------------------
-- QUÉ CONTESTA, Y CÓMO LEERLO
-- ------------------------------------------------------------------------
--
-- Hay cuatro motivos posibles y esta consulta los separa. El que aplique se
-- reconoce por la columna `diagnostico`:
--
--   «nunca se sincronizó»        el CRM nunca pudo traer las plantillas de
--                                Meta. Casi siempre falta una variable en
--                                Netlify: WHATSAPP_WABA_ID o WHATSAPP_TOKEN.
--                                Sin eso el botón «Sincronizar» del módulo
--                                Plantillas ni siquiera aparece.
--
--   «la última falló»            sí se intentó, y Meta contestó que no. El
--                                motivo textual sale en `ultimo_error`: suele
--                                ser el token vencido o un WABA equivocado.
--
--   «no hay ninguna aprobada»    se sincronizó bien, pero todas están en
--                                PENDING o REJECTED. Sólo las APPROVED se
--                                pueden mandar, y eso lo decide Meta, no el
--                                CRM.
--
--   «hay plantillas listas»      el problema no está en las plantillas.
--                                Mirá el segundo bloque y el tercero.
--
-- El SEGUNDO bloque lista cada plantilla con su estado. El TERCERO cuenta
-- cuántos intentos de envío quedaron registrados, que sirve para saber si el
-- CRM llegó a intentarlo o ni siquiera eso.

-- ============================================================ 1. el resumen

select
  case
    when (select count(*) from public.plantillas) = 0
     and (select logrado_en from public.plantillas_sync where id = 1) is null
      then 'nunca se sincronizó — revisá WHATSAPP_WABA_ID y WHATSAPP_TOKEN en Netlify'
    when (select error from public.plantillas_sync where id = 1) is not null
      then 'la última sincronización falló — mirá ultimo_error acá al lado'
    when (select count(*) from public.plantillas
           where upper(estado) = 'APPROVED') = 0
      then 'no hay ninguna aprobada — Meta las tiene en PENDING o REJECTED'
    else 'hay plantillas listas — el problema no son las plantillas'
  end                                                          as diagnostico,
  (select count(*) from public.plantillas)                     as plantillas_guardadas,
  (select count(*) from public.plantillas
    where upper(estado) = 'APPROVED')                          as aprobadas,
  (select to_char(intentado_en at time zone 'America/El_Salvador', 'DD/MM/YYYY HH24:MI')
     from public.plantillas_sync where id = 1)                 as ultimo_intento,
  (select to_char(logrado_en at time zone 'America/El_Salvador', 'DD/MM/YYYY HH24:MI')
     from public.plantillas_sync where id = 1)                 as ultima_vez_que_salio_bien,
  (select error from public.plantillas_sync where id = 1)      as ultimo_error;

-- ====================================================== 2. una por una
--
-- El editor de Supabase muestra sólo el resultado de la ÚLTIMA consulta, así
-- que para ver este bloque hay que seleccionarlo y correrlo aparte.
--
-- select nombre, idioma, estado, categoria, variables,
--        case when upper(estado) = 'APPROVED' then '✓ se puede mandar'
--             else '· no' end as se_puede_mandar
--   from public.plantillas
--  order by (upper(estado) = 'APPROVED') desc, nombre;

-- ====================================================== 3. ¿se intentó?
--
-- Un envío de plantilla deja un mensaje de tipo `template` en el hilo. Si acá
-- hay cero, el CRM nunca llegó a mandar ninguna: el problema está antes.
--
-- select count(*)                                        as plantillas_enviadas,
--        max(creado_en at time zone 'America/El_Salvador') as la_ultima,
--        count(*) filter (where estado = 'failed')       as rebotadas
--   from public.mensajes
--  where tipo = 'template';
