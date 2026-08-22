-- ¿Están andando los cambios en vivo?
--
-- Pegá esto en el editor SQL de Supabase. No cambia nada: sólo mira y contesta.
--
-- Sirve para cuando la cabecera del CRM dice «sin conexión en vivo» o «en vivo
-- sin activar» y hay que averiguar de qué lado está el problema. Son dos
-- lugares distintos y se arreglan distinto:
--
--   LA BASE          las tablas tienen que estar en la publicación
--                    `supabase_realtime`. Eso es lo que revisa este archivo.
--
--   EL PROYECTO      Realtime tiene que estar encendido en Supabase, en
--                    Settings → API → Realtime. Eso NO se puede consultar
--                    desde SQL; hay que mirarlo en el tablero.
--
--   LA RED           un proxy de oficina o un wifi que bloquee websockets deja
--                    todo lo demás bien y el aviso sin llegar igual. Se
--                    descarta probando desde otra conexión —el teléfono con
--                    datos, por ejemplo—.

-- ------------------------------------------------- 1. tabla por tabla
--
-- Éstas son las siete a las que el CRM se suscribe. Si falta alguna, esa
-- pantalla en particular se atrasa hasta el refresco automático.
select
  case when publicada then '✓ publicada' else '✗ FALTA' end as estado,
  tabla,
  para_que
from (
  select
    t.tabla,
    t.para_que,
    exists (
      select 1 from pg_publication_tables p
      where p.pubname = 'supabase_realtime'
        and p.schemaname = 'public'
        and p.tablename = t.tabla
    ) as publicada
  from (values
    ('oportunidades',     'Los leads: Pipeline, Clientes, Dashboard'),
    ('clientes',          'Los datos de contacto'),
    ('oportunidad_notas', 'La bitácora de cada ficha'),
    ('seguimientos',      'Los recordatorios que salen de las notas'),
    ('eventos',           'El Calendario'),
    ('conversaciones',    'La bandeja de WhatsApp'),
    ('mensajes',          'Los mensajes que entran'),
    ('actividad',         'Quién hizo qué, y el sonido de los avisos')
  ) as t(tabla, para_que)
) as r
order by publicada, tabla;

-- --------------------------------------- 2. lo que le contesta al CRM
--
-- El CRM le pregunta esto a la base antes de decir «En vivo». Si da falso,
-- muestra «en vivo sin activar» en vez de mentir con un punto verde.
select
  case
    when to_regclass('public.oportunidades') is null then 'La base no tiene ni las tablas del CRM.'
    when not exists (select 1 from pg_proc where proname = 'cambios_en_vivo_activos')
      then '✗ Falta correr 20260813213000_cambios_en_vivo.sql: no existe la función que avisa.'
    when public.cambios_en_vivo_activos()
      then '✓ La base está lista. Si igual dice «sin conexión en vivo», el problema está en Realtime del proyecto o en la red.'
    else '✗ Faltan tablas por publicar. Corré 20260813213000_cambios_en_vivo.sql en Supabase.'
  end as resumen;
