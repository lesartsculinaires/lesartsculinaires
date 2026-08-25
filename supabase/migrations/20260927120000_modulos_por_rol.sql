begin;

-- Que la casilla «ver» de cada rol sirva para algo.
--
-- ------------------------------------------------------------------------
-- LO QUE PASABA
-- ------------------------------------------------------------------------
--
-- La pantalla de Usuarios y Roles ya deja marcar, por rol y por módulo, si
-- puede ver, crear, editar y eliminar. Se guardaba bien en `rol_permisos`. Lo
-- que no había era nadie que leyera «ver»: la barra lateral dibujaba los trece
-- módulos siempre, para todo el mundo. O sea que se podía destildar Bases para
-- Ventas, guardar, y no pasaba nada.
--
-- Un control que no hace nada es peor que no tenerlo: quien lo usa se queda
-- creyendo que configuró algo.
--
-- ------------------------------------------------------------------------
-- ESTO NO ES SEGURIDAD, ES ORDEN
-- ------------------------------------------------------------------------
--
-- Hay que decirlo porque se confunde fácil. Esconder un módulo de la barra
-- ordena la pantalla; no protege los datos. Quien puede ver qué información
-- sigue decidiéndose donde se decide de verdad —las políticas de la base— y
-- eso no cambia acá. Sirve para que una asesora no tenga a la vista seis
-- pantallas que no usa, no para guardarle algo.
--
-- ------------------------------------------------------------------------
-- QUÉ HACE ESTE ARCHIVO
-- ------------------------------------------------------------------------
--
-- Nada más poner el catálogo `modulos` al día. Tenía nueve filas de cuando el
-- CRM tenía nueve pantallas, y hoy son trece: faltaban Inbox, Bases,
-- Formularios, Plantillas, Recordatorios y Notificaciones, así que ni siquiera
-- aparecían para poder marcarlas.
--
-- Los que ya estaban no se tocan: conservan su clave, que es a la que apuntan
-- los permisos ya guardados. Cambiarla los desconectaría en silencio.
--
-- ------------------------------------------------------------------------
-- Y POR QUÉ EMPIEZA CON TODO EN «VER»
-- ------------------------------------------------------------------------
--
-- Porque los «no» que hay guardados no los decidió nadie.
--
-- La pantalla arranca cada módulo con las cuatro casillas apagadas, y al
-- guardar escribe las filas de todos los módulos, no sólo las tocadas. Como
-- «ver» no hacía nada, editar «crear» en un módulo dejaba un «no ver» en los
-- otros doce sin que se notara. En la base de la escuela, hoy, el rol Ventas
-- tiene «no ver» en Dashboard, Clientes, Pipeline, Calendario, Equipos y
-- Programas: casi todo su trabajo.
--
-- Si la regla empezara a valer sobre eso, la próxima vez que una asesora
-- entrara se encontraría sin sus pantallas, y nadie sabría por qué —porque
-- nadie lo eligió—. Así que las filas que ya están se ponen en «ver»: la
-- función arranca sin cambiar nada de lo que hoy se ve, y a partir de ahí
-- cada módulo que se esconda es una decisión de verdad.
--
-- Sólo toca `ver`. Crear, editar y eliminar quedan como están, que esos sí se
-- venían usando.
--
-- Se puede correr con gente trabajando, y dos veces.

insert into public.modulos (clave, nombre, padre, orden) values
  ('dashboard',      'Dashboard',        null,  10),
  ('inbox',          'Inbox',            null,  15),
  ('clientes',       'Clientes',         null,  20),
  ('bases',          'Bases',            null,  25),
  ('pipeline',       'Pipeline',         null,  30),
  ('calendario',     'Calendario',       null,  40),
  ('equipos',        'Equipos',          null,  50),
  ('programas',      'Programas',        null,  60),
  ('formularios',    'Formularios',      null,  62),
  ('plantillas',     'Plantillas',       null,  64),
  ('recordatorios',  'Recordatorios',    null,  66),
  ('notificaciones', 'Notificaciones',   null,  68),
  ('usuarios',       'Usuarios y Roles', null,  70)
on conflict (clave) do update
  -- El nombre y el orden se refrescan; la clave nunca, porque es lo que
  -- enlaza con `rol_permisos`.
  set nombre = excluded.nombre,
      orden  = excluded.orden;

-- Los «no ver» que quedaron de cuando la casilla no hacía nada.
do $$
declare
  cuantos int;
begin
  update public.rol_permisos set ver = true where ver = false;
  get diagnostics cuantos = row_count;
  raise notice 'se pusieron en «ver» % permisos que nadie había decidido', cuantos;
end $$;

commit;

-- El catálogo, y cuántos roles tienen algo decidido sobre cada módulo.
select
  m.orden,
  m.nombre                                                     as modulo,
  m.clave,
  (select count(*) from public.rol_permisos p
    where p.modulo = m.clave)                                  as roles_configurados,
  (select count(*) from public.rol_permisos p
    where p.modulo = m.clave and p.ver = false)                as roles_que_no_lo_ven
  from public.modulos m
 where m.padre is null
 order by m.orden;
