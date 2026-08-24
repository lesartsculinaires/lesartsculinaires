-- ¿Qué migraciones están puestas y cuáles faltan?
--
-- Pegá esto en el editor SQL de Supabase y dale correr. No cambia nada: sólo
-- mira y contesta. La primera fila es el resumen, y abajo va una línea por
-- migración con «puesta» o «FALTA».
--
-- No se fija en un registro de migraciones —Supabase no lleva uno cuando se
-- pegan a mano— sino en lo que cada una deja hecho: una columna, una tabla,
-- una política, un trigger. Eso es lo que la aplicación necesita de verdad,
-- así que es lo correcto para preguntar.
--
-- ------------------------------------------------------------------------
-- POR QUÉ EL RESUMEN NOMBRA LOS ARCHIVOS
-- ------------------------------------------------------------------------
--
-- Antes decía «corré supabase/PENDIENTES.sql», que era un combinado armado a
-- mano en su momento. Envejeció sin avisar: seguía nombrando cuatro
-- migraciones viejas mientras la que faltaba de verdad era otra. Quien lo
-- corriera no habría arreglado nada y no habría tenido cómo darse cuenta.
--
-- Ahora el resumen sale de esta misma lista y nombra el archivo que falta. No
-- puede quedar desactualizado: es el mismo dato que la fila de arriba.

with revisiones as (
  select * from (values

    ('20260818120000_adjuntos',
     'Botón de adjuntar archivos',
     to_regclass('public.adjuntos') is not null),

    ('20260820120000_edad_y_responsable',
     'Edad, y datos del responsable si es menor',
     exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='clientes' and column_name='edad')),

    ('20260821120000_responsable_hasta_17',
     'El responsable se pide desde los 17 para abajo',
     exists (select 1 from pg_indexes
             where schemaname='public' and indexname like '%responsable%')),

    ('20260822120000_enlaces_pago',
     'Link de registro',
     to_regclass('public.enlaces_pago') is not null),

    ('20260823120000_actividad',
     'Notificaciones y registro de actividad',
     to_regclass('public.actividad') is not null),

    ('20260824120000_reserva',
     'Reserva: el dinero con que apartan el cupo',
     exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='oportunidades' and column_name='reserva')),

    ('20260825120000_actividad_enlaces',
     'Los links de registro salen en las notificaciones',
     exists (select 1 from pg_trigger
             where tgname='trg_actividad_enlaces' and not tgisinternal)),

    ('20260826120000_cursos_realizados',
     'Diplomados y cursos ya realizados',
     to_regclass('public.cursos_realizados') is not null),

    ('20260827120000_catalogo_programas',
     'Sólo dirección crea programas',
     exists (select 1 from pg_policies
             where schemaname='public' and tablename='productos'
               and policyname='productos_administrar')),

    ('20260828120000_catalogo_vendedores',
     'Sólo dirección agrega o da de baja vendedores',
     exists (select 1 from pg_policies
             where schemaname='public' and tablename='vendedores'
               and policyname='vendedores_administrar')),

    ('20260829120000_media_whatsapp',
     'Las fotos y documentos que llegan por WhatsApp',
     exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='mensajes' and column_name='media_ruta')),

    ('20260830120000_etiquetas',
     'Etiquetas de la bandeja',
     to_regclass('public.etiquetas') is not null),

    ('20260831120000_plantillas',
     'Plantillas de WhatsApp',
     to_regclass('public.plantillas') is not null),

    ('20260901120000_abrir_chat',
     'Abrir un chat desde el CRM',
     exists (select 1 from pg_policies
             where schemaname='public' and tablename='conversaciones'
               and policyname='conversaciones_abrir')),

    ('20260902120000_cada_quien_lo_suyo',
     'Cada asesor ve sus clientes; dirección y coordinación ven todo',
     exists (select 1 from pg_policies
             where schemaname='public' and tablename='oportunidades'
               and policyname='oportunidades_ver')),

    ('20260903120000_etapa_prospectos',
     'Prospectos, la primera etapa del embudo',
     exists (select 1 from public.etapas where nombre='Prospectos')),

    ('20260904120000_roles_de_ventas',
     'Los roles de Gerente de ventas y Jefe de ventas',
     (select count(*) from public.roles
       where nombre in ('Gerente de ventas','Jefe de ventas')) = 2),

    ('20260905120000_recordatorio_reserva',
     'Recordatorio de reserva: 15 días para completar el pago',
     exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='oportunidades'
               and column_name='reserva_en')),

    ('20260906120000_formularios',
     'Formularios de feria: un lead que entra ya cargado',
     to_regclass('public.formularios') is not null),

    ('20260907120000_motivo_perdida',
     'Por qué se pierde un lead, y la métrica en el tablero',
     to_regclass('public.motivos_perdida') is not null),

    ('20260908120000_formulario_sin_obligatorios',
     'Ninguna pregunta del formulario frena el guardado',
     to_regclass('public.formulario_campos') is null
       or not exists (select 1 from public.formulario_campos where requerido)),

    ('20260909120000_supreme_diplome',
     'Suprême Diplôme como área de interés en el formulario',
     exists (select 1 from public.productos where nombre = 'Suprême Diplôme')),

    ('20260910120000_supreme_diplome_minuscula',
     'La opción se lee «Suprême Diplôme», no en mayúsculas',
     to_regclass('public.formulario_campos') is null
       or not exists (select 1 from public.formulario_campos c,
                             jsonb_array_elements(c.opciones) as o
                       where o ->> 'texto' = 'SUPRÊME DIPLÔME')),

    ('20260911120000_seguimientos',
     'Las notas que dicen «seguimiento de pago» crean el recordatorio',
     to_regclass('public.seguimientos') is not null),

    ('20260912120000_reparto_automatico',
     'El lead de WhatsApp entra solo y se sortea entre los que reciben',
     exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='roles'
               and column_name='recibe_leads')),

    -- El de la corrección: el 20260913 cambiaba el motivo equivocado y este
    -- lo deshace, así que lo que hay que comprobar es el estado final.
    ('20260914120000_cercania_en_vez_de_economico',
     '«Objeciones por cercanía» en lugar de «Problema económico», y «Muy caro» se queda',
     to_regclass('public.motivos_perdida') is null
       or (exists (select 1 from public.motivos_perdida
                    where nombre = 'Objeciones por cercanía' and activo)
           and exists (select 1 from public.motivos_perdida
                        where nombre = 'Muy caro' and activo)
           and not exists (select 1 from public.motivos_perdida
                            where nombre = 'Problema económico' and activo))),

    ('20260915120000_dueno_del_hilo',
     'El chat de la bandeja muestra al mismo asesor que el lead',
     to_regclass('public.conversaciones') is null
       or not exists (
            select 1 from public.conversaciones c
             where c.vendedor_id is null and c.cliente_id is not null
               and exists (select 1 from public.oportunidades o
                            where o.cliente_id = c.cliente_id
                              and o.vendedor_id is not null)))

  ) as t(archivo, para_que, aplicada)
),

/*
 * El detalle y el resumen salen de la misma lista.
 *
 * Antes eran dos consultas con la lista escrita dos veces, y agregar una
 * migración a una sola de las dos era cuestión de tiempo: el detalle decía una
 * cosa y el resumen otra. Con `union all` hay una sola verdad.
 */
todo as (
  select case when aplicada then 2 else 1 end as orden,
         case when aplicada then '✓ puesta' else '✗ FALTA' end as estado,
         archivo,
         para_que
    from revisiones

  union all

  select 0,
         case when count(*) filter (where not aplicada) = 0
              then '✓ TODO PUESTO'
              else '✗ FALTA ' || count(*) filter (where not aplicada) end,
         coalesce(
           string_agg(archivo || '.sql', ' · ' order by archivo)
             filter (where not aplicada),
           '—'),
         case when count(*) filter (where not aplicada) = 0
              then 'Las ' || count(*) || ' migraciones están aplicadas.'
              else 'Corré ese archivo desde supabase/migrations/, en el editor '
                   || 'SQL de Supabase. Se puede con gente trabajando.' end
    from revisiones
)
select estado, archivo, para_que
  from todo
 order by orden, archivo;
