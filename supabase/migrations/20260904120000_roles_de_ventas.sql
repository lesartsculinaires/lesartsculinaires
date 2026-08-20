begin;

-- Gerente de ventas y Jefe de ventas.
--
-- Los dos niveles de alcance ya existen desde `cada_quien_lo_suyo`; lo que
-- faltaba eran los roles con los nombres que usa la escuela.
--
--   Sin `ve_todo`   el asesor abre el CRM y ve las oportunidades que tiene
--                   asignadas, más las que no son de nadie. Las de sus
--                   compañeros no le llegan: las filtra la base, no la
--                   pantalla, así que no hay pantalla ni enlace por donde se
--                   asome una ficha ajena.
--
--   Con `ve_todo`   ve las de todo el equipo. Además, en el Pipeline le
--                   aparece un selector para mirar el tablero de un asesor
--                   solo, que es lo que hace falta para revisar la cartera de
--                   cada quien sin pedirle la pantalla prestada.
--
-- Ninguno de los dos es administrador. Es a propósito: supervisar al equipo de
-- ventas y administrar el sistema —crear cuentas, repartir permisos, borrar
-- programas— son cosas distintas, y juntarlas obligaría a dar la segunda para
-- conseguir la primera.
--
-- Se crean los dos aunque hoy hagan lo mismo. El rol es también el cartel que
-- lleva la persona en la pantalla de usuarios; meter a un jefe de ventas en un
-- rol llamado «Gerente» obliga a recordar de memoria que ahí adentro hay dos
-- puestos. Y si mañana se les separa algún permiso, ya están separados.
--
-- Los permisos por pantalla quedan como los de Ventas: todo menos «Usuarios y
-- Roles», y sin borrar nada. Borrar es de administración, y esto se puede
-- ampliar desde la pantalla de Roles y Permisos sin volver a tocar SQL.
--
-- Sólo agrega filas. Se puede correr con gente trabajando, y dos veces.

insert into public.roles (nombre, descripcion, es_admin, ve_todo) values
  ('Gerente de ventas',
   'Ve el pipeline completo y el de cada asesor. No administra el sistema.',
   false, true),
  ('Jefe de ventas',
   'Ve el pipeline completo y el de cada asesor. No administra el sistema.',
   false, true)
on conflict (nombre) do update
  -- Si alguno ya existía con otro alcance, el alcance es justamente lo que
  -- este archivo viene a dejar puesto. El nombre y la descripción no se
  -- pisan por si los editaron a mano.
  set ve_todo = true;

-- Las pantallas: las mismas que Ventas, sin la de administración y sin borrar.
insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
select r.id, m.clave,
       m.clave <> 'usuarios',
       m.clave <> 'usuarios',
       m.clave <> 'usuarios',
       false
from public.roles r
cross join public.modulos m
where r.nombre in ('Gerente de ventas', 'Jefe de ventas')
on conflict (rol_id, modulo) do nothing;

commit;
