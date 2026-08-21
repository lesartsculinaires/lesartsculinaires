-- ¿Qué migraciones están puestas y cuáles faltan?
--
-- Pegá esto en el editor SQL de Supabase y dale correr. No cambia nada: sólo
-- mira y contesta. Devuelve una fila por migración con «puesta» o «FALTA».
--
-- No se fija en un registro de migraciones —Supabase no lleva uno cuando se
-- pegan a mano— sino en lo que cada una deja hecho: una columna, una tabla,
-- una política, un trigger. Eso es lo que la aplicación necesita de verdad,
-- así que es lo correcto para preguntar.

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
     to_regclass('public.motivos_perdida') is not null)

  ) as t(archivo, para_que, aplicada)
)
select
  case when aplicada then '✓ puesta' else '✗ FALTA' end as estado,
  archivo,
  para_que
from revisiones
order by aplicada, archivo;

-- Y el resumen en una línea, para no tener que leer la tabla entera.
with revisiones as (
  select * from (values
    ('adjuntos',            to_regclass('public.adjuntos') is not null),
    ('edad',                exists (select 1 from information_schema.columns
                                    where table_schema='public' and table_name='clientes' and column_name='edad')),
    ('responsable_17',      exists (select 1 from pg_indexes
                                    where schemaname='public' and indexname like '%responsable%')),
    ('enlaces_pago',        to_regclass('public.enlaces_pago') is not null),
    ('actividad',           to_regclass('public.actividad') is not null),
    ('reserva',             exists (select 1 from information_schema.columns
                                    where table_schema='public' and table_name='oportunidades' and column_name='reserva')),
    ('actividad_enlaces',   exists (select 1 from pg_trigger
                                    where tgname='trg_actividad_enlaces' and not tgisinternal)),
    ('cursos_realizados',   to_regclass('public.cursos_realizados') is not null),
    ('catalogo_programas',  exists (select 1 from pg_policies
                                    where schemaname='public' and tablename='productos'
                                      and policyname='productos_administrar')),
    ('catalogo_vendedores', exists (select 1 from pg_policies
                                    where schemaname='public' and tablename='vendedores'
                                      and policyname='vendedores_administrar')),
    ('media_whatsapp',      exists (select 1 from information_schema.columns
                                    where table_schema='public' and table_name='mensajes' and column_name='media_ruta')),
    ('etiquetas',           to_regclass('public.etiquetas') is not null),
    ('plantillas',          to_regclass('public.plantillas') is not null),
    ('abrir_chat',          exists (select 1 from pg_policies
                                    where schemaname='public' and tablename='conversaciones'
                                      and policyname='conversaciones_abrir')),
    ('cada_quien_lo_suyo',  exists (select 1 from pg_policies
                                    where schemaname='public' and tablename='oportunidades'
                                      and policyname='oportunidades_ver')),
    ('etapa_prospectos',    exists (select 1 from public.etapas where nombre='Prospectos')),
    ('roles_de_ventas',     (select count(*) from public.roles
                              where nombre in ('Gerente de ventas','Jefe de ventas')) = 2),
    ('recordatorio_reserva', exists (select 1 from information_schema.columns
                              where table_schema='public' and table_name='oportunidades'
                                and column_name='reserva_en')),
    ('formularios',        to_regclass('public.formularios') is not null),
    ('motivo_perdida',     to_regclass('public.motivos_perdida') is not null)
  ) as t(nombre, aplicada)
)
select
  case
    when count(*) filter (where not aplicada) = 0
      then 'Todo puesto: las ' || count(*) || ' están aplicadas.'
    else 'Faltan ' || count(*) filter (where not aplicada) || ': '
         || string_agg(nombre, ', ') filter (where not aplicada)
         || '. Corré supabase/PENDIENTES.sql.'
  end as resumen
from revisiones;
