-- Cambiar qué pipeline ve un rol.
--
-- ------------------------------------------------------------------------
-- PARA QUÉ ES
-- ------------------------------------------------------------------------
--
-- Viene preparado para «Asesor Secundario», que en la base de la escuela tiene
-- hoy el pipeline completo y tres personas adentro. Si ese es el rol de
-- asesores del que hablamos —«ven su propio pipeline y no el de los demás»—
-- este archivo lo deja así.
--
-- Para otro rol se cambia la línea marcada «CAMBIAR ACÁ».
--
-- ------------------------------------------------------------------------
-- ESTO SE NOTA AL TOQUE, Y EN GENTE
-- ------------------------------------------------------------------------
--
-- No es un cambio de configuración que nadie ve. Las personas de ese rol van a
-- dejar de tener a la vista los leads que no son suyos, la próxima vez que
-- carguen la pantalla. Antes de correrlo conviene estar seguro de que ese rol
-- es lo que uno cree: el archivo empieza mostrando quiénes son.
--
-- Lo que NO se pierde: sus propios leads siguen enteros, y los leads que
-- dejen de ver siguen ahí para gerencia. Esto cambia quién los ve, no los
-- datos. Se puede volver atrás poniendo `true` donde dice `false`.
--
-- Se puede correr con gente trabajando, y dos veces.

begin;

do $$
declare
  -- ------------------------------------------------------- CAMBIAR ACÁ
  el_rol constant text := 'Asesor Secundario';
  -- --------------------------------------------------------------------

  cuantos int;
  antes   boolean;
begin
  select r.ve_todo, (select count(*) from public.usuarios u
                      where u.rol_id = r.id and u.activo)
    into antes, cuantos
    from public.roles r where r.nombre = el_rol;

  if antes is null then
    raise exception 'No existe el rol «%». Revisá el nombre, tal cual está escrito.', el_rol;
  end if;

  if not antes then
    perform set_config('lac.rol', format('«%s» ya veía sólo sus propios leads. No se cambió nada.', el_rol), false);
    return;
  end if;

  update public.roles set ve_todo = false where nombre = el_rol;

  perform set_config(
    'lac.rol',
    format('«%s» pasa de ver todo el pipeline a ver sólo sus propios leads. Afecta a %s persona(s).',
           el_rol, cuantos),
    false);
end $$;

/*
 * Y el rol «Asesores» que quedó vacío, si sobra.
 *
 * Lo creó la migración anterior porque no había ninguno con ese alcance. Si el
 * rol de asesores de la escuela resultó ser otro —«Asesor Secundario»— este
 * queda al pedo y conviene sacarlo: dos roles que quieren decir lo mismo se
 * asignan mal tarde o temprano.
 *
 * Sólo se borra si no tiene a nadie. Un rol con gente adentro no se toca ni
 * aunque parezca repetido: mover personas de rol es una decisión, no una
 * limpieza.
 */
do $$
declare
  usados int;
begin
  select count(*) into usados
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
   where r.nombre = 'Asesores';

  if usados > 0 then
    perform set_config('lac.asesores',
      format('El rol «Asesores» tiene %s persona(s); se deja como está.', usados), false);
    return;
  end if;

  if not exists (select 1 from public.roles where nombre = 'Asesores') then
    perform set_config('lac.asesores', 'El rol «Asesores» no existe; nada que limpiar.', false);
    return;
  end if;

  delete from public.rol_permisos
   where rol_id = (select id from public.roles where nombre = 'Asesores');
  delete from public.roles where nombre = 'Asesores';

  perform set_config('lac.asesores', 'Se borró el rol «Asesores», que estaba vacío.', false);
end $$;

commit;

-- Qué pasó, y cómo quedaron todos.
select current_setting('lac.rol', true)      as cambio,
       current_setting('lac.asesores', true) as limpieza;

select
  r.nombre                                                   as rol,
  case when r.es_admin or r.ve_todo
       then 'todo el pipeline'
       else 'sólo sus propios leads' end                     as ve_y_modifica,
  case when r.recibe_leads then 'sí' else 'no' end           as recibe_leads_de_whatsapp,
  (select count(*) from public.usuarios u
    where u.rol_id = r.id and u.activo)                      as personas
  from public.roles r
 where r.activo
 order by (r.es_admin or r.ve_todo) desc, r.nombre;
