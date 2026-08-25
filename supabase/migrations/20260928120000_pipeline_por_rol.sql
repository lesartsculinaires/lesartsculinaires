begin;

-- Qué pipeline ve cada rol.
--
-- ------------------------------------------------------------------------
-- LO QUE SE PIDIÓ, Y LO QUE YA ESTABA
-- ------------------------------------------------------------------------
--
--   Administrador          todo el pipeline, y puede cambiarlo.
--   Gerente de ventas      todo el pipeline, y puede cambiarlo.
--   Jefe de ventas         todo el pipeline, y puede cambiarlo.
--   Ventas                 sólo los leads que tiene asignados.
--   Asesores               sólo los leads que tiene asignados.
--
-- La regla ya la hace cumplir la base desde antes, en la política de
-- `oportunidades`: se ve una fila si `ve_todo()`, o si es de uno mismo. Y para
-- editar, la misma condición. O sea que quien no ve todo tampoco puede tocar
-- lo ajeno, ni siquiera sabiendo el id: no es que la pantalla se lo esconda,
-- es que la base no se lo devuelve.
--
-- `ve_todo()` es «el rol es administrador, o tiene el alcance puesto». Así que
-- lo único que decide todo esto son dos casillas por rol, y este archivo se
-- limita a dejarlas como corresponde.
--
-- ------------------------------------------------------------------------
-- LO QUE SÍ FALTABA
-- ------------------------------------------------------------------------
--
-- El rol «Asesores» no existía. Se crea con el mismo alcance que Ventas: cada
-- quien ve lo suyo.
--
-- No se le prende `recibe_leads`. Esa casilla decide entre quiénes se sortean
-- los leads que entran por WhatsApp, y sumar un rol nuevo al sorteo cambiaría
-- de golpe a quién le caen los leads de la escuela. Eso se prende desde
-- Usuarios y Roles el día que se quiera, mirando.
--
-- ------------------------------------------------------------------------
-- LOS LEADS SIN ASIGNAR SE VEN, Y ES A PROPÓSITO
-- ------------------------------------------------------------------------
--
-- La política tiene una tercera condición: un lead sin vendedor lo ve todo el
-- equipo. Es de cuando se armó el reparto automático, y la razón sigue en pie:
-- un lead que no ve nadie no lo atiende nadie. Con el sorteo andando casi no
-- quedan, pero una importación puede dejarlos.
--
-- Si se prefiere que Ventas y Asesores tampoco vean esos, es sacar una línea
-- de la política. No se hace acá porque es una decisión distinta a la que se
-- pidió y tiene un costo que conviene mirar de frente: esos leads pasarían a
-- existir sólo para gerencia.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ----------------------------------------------------------- los que ven todo

update public.roles
   set ve_todo = true
 where nombre in ('Gerente de ventas', 'Jefe de ventas')
   and ve_todo is distinct from true;

-- El administrador no necesita la casilla: `ve_todo()` ya lo contempla por
-- `es_admin`. Se deja como está para no dar a entender que son dos permisos
-- distintos cuando es uno.

-- --------------------------------------------------- los que ven sólo lo suyo

update public.roles
   set ve_todo = false
 where nombre in ('Ventas', 'Asesores')
   and ve_todo is distinct from false;

insert into public.roles (nombre, descripcion, activo, es_admin, ve_todo)
values ('Asesores',
        'Ve y trabaja únicamente los leads que tiene asignados.',
        true, false, false)
on conflict (nombre) do update
  -- Si ya existía con otro alcance, se corrige; la descripción de ellos manda.
  set activo   = true,
      es_admin = false,
      ve_todo  = false;

commit;

-- Quién ve qué, dicho en palabras.
select
  r.nombre                                                   as rol,
  case when r.es_admin or r.ve_todo
       then 'todo el pipeline'
       else 'sólo sus propios leads' end                     as ve,
  case when r.es_admin or r.ve_todo
       then 'todo el pipeline'
       else 'sólo sus propios leads' end                     as puede_modificar,
  case when r.recibe_leads then 'sí' else 'no' end           as recibe_leads_de_whatsapp,
  (select count(*) from public.usuarios u
    where u.rol_id = r.id and u.activo)                      as personas
  from public.roles r
 where r.activo
 order by (r.es_admin or r.ve_todo) desc, r.nombre;
