begin;

-- Quién puede subir bases y quién puede abrirlas.
--
-- ------------------------------------------------------------------------
-- LO QUE YA ESTABA Y NO SE USABA
-- ------------------------------------------------------------------------
--
-- `rol_permisos` tiene cuatro casillas por módulo desde el principio —ver,
-- crear, editar, eliminar— y la pantalla de Usuarios y Roles las dibuja las
-- cuatro. Pero sólo «ver» hacía algo: las otras tres se guardaban y nadie las
-- leía. Una casilla que se puede tildar y no cambia nada es peor que no tener
-- la casilla, porque dirección la tilda creyendo que decidió algo.
--
-- Acá empiezan a valer para Bases, que es donde se pidieron:
--
--   ver        aparece el módulo en la barra.
--   crear      aparece el botón «Subir base» y la importación se acepta.
--   editar     se puede abrir una base y ver sus registros adentro.
--
-- «eliminar» sigue sin uso en este módulo: nadie pidió borrar bases, y una
-- casilla que promete algo que no existe es el problema de arriba otra vez.
--
-- ------------------------------------------------------------------------
-- POR QUÉ TAMBIÉN EN LA BASE Y NO SÓLO EN LA PANTALLA
-- ------------------------------------------------------------------------
--
-- Esconder un botón acomoda la pantalla; no impide nada. Quien tenga la llave
-- pública del proyecto puede hablarle a PostgREST directamente. Así que la
-- regla vive acá y la pantalla sólo la refleja.
--
-- Lo que se cierra es abrir una base: es la fila de `importaciones` la que
-- convierte un montón de filas sueltas en «la base de la feria de agosto».
-- Cargar clientes de a uno sigue pudiendo cualquiera, porque es exactamente lo
-- que hace el botón «+ Nuevo cliente» y sacárselo a ventas sería sacarles el
-- trabajo.
--
-- ------------------------------------------------------------------------
-- CON QUÉ ARRANCA CADA ROL
-- ------------------------------------------------------------------------
--
--   Administrador                 todo, siempre. No se puede restringir.
--   Gerente y Jefe de ventas      ven, suben y abren.
--   Ventas y Asesores             ven la lista; no suben ni abren el detalle.
--
-- Es un punto de partida, no una traba: las tres casillas se cambian desde
-- Usuarios y Roles cuando haga falta.
--
-- Se elige así porque es lo más parecido a como venía funcionando —el detalle
-- de una base ya era sólo de dirección— y porque subir una base es la única
-- acción del CRM que crea cientos de fichas de una vez: si sale mal, lo que
-- hay que deshacer no son dos filas.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ------------------------------------------------------- la función que decide

/*
 * ¿El rol de quien está pidiendo tiene esta casilla en este módulo?
 *
 * `security definer` porque tiene que leer `usuarios` y `rol_permisos` de
 * cualquiera, y la política de esas tablas no le deja a un asesor mirar filas
 * ajenas. Lee las suyas igual, pero mejor que no dependa de eso.
 *
 * Los dos valores por omisión no son iguales, y la diferencia es a propósito:
 *
 *   sin fila, «ver» es SÍ      no haber decidido no es haber dicho que no. Con
 *                              la regla al revés, agregar un módulo nuevo lo
 *                              haría desaparecer para todos hasta que alguien
 *                              lo habilitara rol por rol.
 *
 *   sin fila, el resto es NO   hacer algo requiere que alguien lo haya
 *                              habilitado. Es la misma asimetría que ya usa la
 *                              pantalla de Usuarios y Roles al dibujar un rol
 *                              recién creado.
 */
create or replace function public.puede(p_modulo text, p_accion text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mi_rol   bigint;
  es_admin boolean;
  fila     public.rol_permisos%rowtype;
begin
  if p_accion not in ('ver', 'crear', 'editar', 'eliminar') then
    return false;
  end if;

  select u.rol_id into mi_rol
    from public.usuarios u
   where u.id = (select auth.uid());

  if mi_rol is null then
    return false;
  end if;

  select r.es_admin into es_admin from public.roles r where r.id = mi_rol;
  if es_admin then
    return true;
  end if;

  select * into fila
    from public.rol_permisos rp
   where rp.rol_id = mi_rol and rp.modulo = p_modulo;

  if not found then
    return p_accion = 'ver';
  end if;

  return case p_accion
           when 'ver'      then fila.ver
           when 'crear'    then fila.crear
           when 'editar'   then fila.editar
           when 'eliminar' then fila.eliminar
         end;
end $$;

comment on function public.puede(text, text) is
  'Si el rol de quien pide tiene esa casilla en ese módulo. Sin fila: «ver» sí, el resto no.';

revoke execute on function public.puede(text, text) from anon;
grant  execute on function public.puede(text, text) to authenticated;

-- --------------------------------------------------- subir una base se cierra

drop policy if exists auth_all_importaciones  on public.importaciones;
drop policy if exists importaciones_ver       on public.importaciones;
drop policy if exists importaciones_subir     on public.importaciones;
drop policy if exists importaciones_actualizar on public.importaciones;
drop policy if exists importaciones_borrar    on public.importaciones;

/*
 * Ver la lista, todo el equipo.
 *
 * Y no `puede('bases','ver')`: si el módulo se le esconde a alguien, lo que
 * corresponde es que no vea la pantalla, no que la vea vacía. Además esta
 * tabla la lee la agrupación de Clientes, que no es el módulo Bases.
 */
create policy importaciones_ver on public.importaciones
  for select to authenticated using (true);

-- Abrir una base nueva, sólo quien puede subirlas.
create policy importaciones_subir on public.importaciones
  for insert to authenticated with check (public.puede('bases', 'crear'));

/*
 * Actualizar, también: la importación acumula el contador de filas lote a
 * lote, así que quien puede subir tiene que poder tocar su propia fila. Si
 * esto quedara abierto, cerrar el `insert` no serviría de nada —se podría
 * pisar una base ajena— y si quedara cerrado, la importación se cortaría en el
 * segundo lote de doscientas filas.
 */
create policy importaciones_actualizar on public.importaciones
  for update to authenticated
  using (public.puede('bases', 'crear'))
  with check (public.puede('bases', 'crear'));

create policy importaciones_borrar on public.importaciones
  for delete to authenticated using (public.es_admin());

commit;

-- ---------------------------------------------------- los valores de arranque

begin;

/*
 * Sólo si el rol no tiene ya una fila decidida para «bases».
 *
 * `on conflict do nothing` y no `do update`: si alguien ya configuró esto a
 * mano en Usuarios y Roles, su decisión vale más que este valor por omisión, y
 * pisarla sería deshacerle el trabajo sin avisar.
 */
insert into public.rol_permisos (rol_id, modulo, ver, crear, editar, eliminar)
select r.id,
       'bases',
       true,
       r.nombre in ('Gerente de ventas', 'Jefe de ventas'),
       r.nombre in ('Gerente de ventas', 'Jefe de ventas'),
       false
  from public.roles r
 where not r.es_admin
on conflict (rol_id, modulo) do nothing;

commit;

-- Cómo quedó. Los administradores no salen en la lista porque no dependen de
-- estas casillas: pueden todo por definición.
select
  r.nombre                                                    as rol,
  case when r.es_admin then 'sí (siempre)'
       when coalesce(rp.ver, true)    then 'sí' else 'no' end as ve_el_modulo,
  case when r.es_admin then 'sí (siempre)'
       when coalesce(rp.crear, false) then 'sí' else 'no' end as puede_subir_bases,
  case when r.es_admin then 'sí (siempre)'
       when coalesce(rp.editar, false) then 'sí' else 'no' end as puede_abrir_una_base,
  (select count(*) from public.usuarios u
    where u.rol_id = r.id and u.activo)                       as personas
  from public.roles r
  left join public.rol_permisos rp
         on rp.rol_id = r.id and rp.modulo = 'bases'
 where r.activo
 order by r.es_admin desc, r.nombre;
