-- ¿Quedó bien el reparto de permisos?
--
-- Pegá esto en el editor SQL de Supabase. No cambia nada: sólo mira y contesta.
--
-- Devuelve cuatro cosas, en orden de importancia:
--   1. Si la migración quedó instalada entera.
--   2. Quién ve qué, persona por persona.  <-- es la que hay que leer
--   3. Cuántas oportunidades quedaron sin dueño.
--   4. Un resumen de una línea.
--
-- Lo que más importa es el punto 2: alguien de ventas SIN ficha de vendedor
-- enlazada entra a un CRM vacío y no hay manera de que adivine por qué.

-- ---------------------------------------------------------------- 1. la instalación
select
  case when ok then '✓ puesto' else '✗ FALTA' end as estado,
  que
from (values
  ('La columna que enlaza cuenta con vendedor',
   exists (select 1 from information_schema.columns
            where table_schema='public' and table_name='vendedores' and column_name='usuario_id')),
  ('El permiso «ve todo» en los roles',
   exists (select 1 from information_schema.columns
            where table_schema='public' and table_name='roles' and column_name='ve_todo')),
  ('La función que dice quién ve todo',
   exists (select 1 from pg_proc where proname='ve_todo')),
  ('La función que dice qué vendedor es cada quien',
   exists (select 1 from pg_proc where proname='mi_vendedor_id')),
  ('La regla de lectura sobre las oportunidades',
   exists (select 1 from pg_policies where tablename='oportunidades' and policyname='oportunidades_ver')),
  ('La regla vieja que dejaba ver todo a todos, ya quitada',
   not exists (select 1 from pg_policies where tablename='oportunidades' and policyname='auth_all_oportunidades')),
  ('Las notas siguen a su ficha',
   exists (select 1 from pg_policies where tablename='oportunidad_notas' and policyname='oportunidad_notas_ver')),
  ('La vista del pipeline respeta los permisos de quien mira',
   exists (select 1 from pg_class where relname='vw_pipeline'
             and 'security_invoker=true' = any(reloptions)))
) as t(que, ok)
order by ok, que;

-- ------------------------------------------------------- 2. quién ve qué
--
-- «Ve todo» son dirección y quien tenga el permiso. «Sólo lo suyo» necesita
-- tener una ficha de vendedor enlazada; si no la tiene, no ve NADA.
--
-- El enlace y el permiso se leen con `to_jsonb(fila) ->> 'columna'` en vez de
-- nombrarlos derecho. Es a propósito: si la migración no se corrió, esas
-- columnas no existen y nombrarlas haría que esta consulta fallara con un
-- error de Postgres justo en el caso que viene a detectar. Así devuelve nulo y
-- la respuesta se lee igual.
select
  u.correo,
  coalesce(r.nombre, '(sin rol)')                       as rol,
  coalesce(v.nombre, '—')                               as ficha_de_vendedor,
  case
    when not u.activo                          then 'cuenta desactivada'
    when r.es_admin                            then 've todo (es admin)'
    when (to_jsonb(r) ->> 've_todo') = 'true'  then 've todo (por permiso)'
    when v.id is not null                      then 've lo suyo'
    else                                            '⚠ NO VE NADA: falta enlazar su ficha de vendedor'
  end                                                   as que_ve,
  (select count(*) from public.oportunidades o where o.vendedor_id = v.id) as sus_oportunidades
from public.usuarios u
left join public.roles r      on r.id = u.rol_id
left join public.vendedores v on (to_jsonb(v) ->> 'usuario_id') = u.id::text
order by
  case
    when not u.activo then 3
    when r.es_admin or (to_jsonb(r) ->> 've_todo') = 'true' then 2
    when v.id is not null then 1
    else 0                                    -- los problemas, arriba de todo
  end,
  u.correo;

-- ------------------------------------------ 3. las que no son de nadie
--
-- Las ve todo el equipo, a propósito: alguien tiene que levantarlas. Pero si
-- son muchas, es que el reparto quedó a medias.
select
  count(*)                                                   as sin_vendedor_asignado,
  (select count(*) from public.oportunidades)                as total,
  case
    when count(*) = 0 then 'Todas tienen dueño.'
    else 'Estas las ve todo el equipo hasta que alguien las tome.'
  end                                                        as nota
from public.oportunidades where vendedor_id is null;

-- ------------------------------------------------------------ 4. resumen
select
  case
    when (select count(*) from public.usuarios u
           left join public.roles r on r.id = u.rol_id
           left join public.vendedores v on (to_jsonb(v) ->> 'usuario_id') = u.id::text
          where u.activo and not coalesce(r.es_admin,false)
            and coalesce(to_jsonb(r) ->> 've_todo', 'false') <> 'true'
            and v.id is null) > 0
      then '⚠ Hay cuentas de ventas sin ficha de vendedor: esas personas no ven ninguna oportunidad. Mirá la lista de arriba y enlazalas desde Usuarios y Roles.'
    when not exists (select 1 from pg_policies
                      where tablename='oportunidades' and policyname='oportunidades_ver')
      then '✗ Falta correr la migración 20260902120000_cada_quien_lo_suyo.sql.'
    else '✓ Todo en orden: cada quien ve lo que le toca.'
  end as resumen;
