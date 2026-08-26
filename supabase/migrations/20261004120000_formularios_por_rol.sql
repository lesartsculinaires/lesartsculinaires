begin;

-- Los formularios de feria, por casilla de rol y no por «sos administrador».
--
-- ------------------------------------------------------------------------
-- QUÉ ESTABA PASANDO
-- ------------------------------------------------------------------------
--
-- Dirección tildó «crear» y «editar» en Formularios para el Jefe de ventas, y
-- no pasó nada: el botón «Nuevo formulario» seguía sin aparecer.
--
-- No era que la casilla no se guardara. Se guardaba bien. Lo que pasaba es que
-- nadie la leía: la pantalla preguntaba «¿sos administrador?», las acciones del
-- servidor preguntaban lo mismo, y las políticas de estas tablas también. Tres
-- lugares distintos con la misma pregunta equivocada.
--
-- Es el mismo arreglo que ya se hizo en Bases, y por las mismas razones. Una
-- casilla que se puede tildar y no cambia nada es peor que no tener la casilla:
-- dirección la marca creyendo que decidió algo, y se entera de que no cuando
-- alguien no puede trabajar.
--
-- ------------------------------------------------------------------------
-- QUÉ SIGNIFICA CADA UNA
-- ------------------------------------------------------------------------
--
--   ver        aparece el módulo en la barra.
--   crear      aparece «Nuevo formulario», y se puede armar uno.
--   editar     se pueden cambiar las preguntas, y cerrar o reabrir el
--              formulario.
--   eliminar   borrarlo. Hoy la pantalla no lo ofrece; la política queda
--              puesta igual para que el día que se ofrezca ya esté decidido.
--
-- Llenar un formulario no pide ninguna: es lo que hace el equipo en la feria y
-- es la razón de que esto exista.
--
-- ------------------------------------------------------------------------
-- POR QUÉ LAS PREGUNTAS ACEPTAN «CREAR» TAMBIÉN
-- ------------------------------------------------------------------------
--
-- Armar un formulario son dos escrituras: la ficha del formulario y sus
-- preguntas. Si las preguntas exigieran «editar», quien tiene sólo «crear»
-- crearía el formulario y se quedaría trabado al guardar la primera pregunta,
-- con un formulario vacío ya creado y sin forma de completarlo.
--
-- Se puede correr con gente trabajando, y dos veces.

-- ------------------------------------------------------------ formularios

drop policy if exists formularios_administrar on public.formularios;
drop policy if exists formularios_ver        on public.formularios;
drop policy if exists formularios_crear      on public.formularios;
drop policy if exists formularios_editar     on public.formularios;
drop policy if exists formularios_borrar     on public.formularios;

-- Verlos, todo el equipo: hay que poder llenarlos.
create policy formularios_ver on public.formularios
  for select to authenticated using (true);

create policy formularios_crear on public.formularios
  for insert to authenticated
  with check (public.puede('formularios', 'crear'));

create policy formularios_editar on public.formularios
  for update to authenticated
  using (public.puede('formularios', 'editar'))
  with check (public.puede('formularios', 'editar'));

create policy formularios_borrar on public.formularios
  for delete to authenticated
  using (public.puede('formularios', 'eliminar'));

-- --------------------------------------------------------------- preguntas

drop policy if exists campos_administrar on public.formulario_campos;
drop policy if exists campos_ver         on public.formulario_campos;
drop policy if exists campos_crear       on public.formulario_campos;
drop policy if exists campos_editar      on public.formulario_campos;
drop policy if exists campos_borrar      on public.formulario_campos;

create policy campos_ver on public.formulario_campos
  for select to authenticated using (true);

-- «crear» o «editar»: ver arriba por qué las dos.
create policy campos_crear on public.formulario_campos
  for insert to authenticated
  with check (
    public.puede('formularios', 'crear') or public.puede('formularios', 'editar')
  );

create policy campos_editar on public.formulario_campos
  for update to authenticated
  using (
    public.puede('formularios', 'crear') or public.puede('formularios', 'editar')
  )
  with check (
    public.puede('formularios', 'crear') or public.puede('formularios', 'editar')
  );

/*
 * Borrar preguntas también entra en «editar».
 *
 * No en «eliminar»: esa casilla es sobre el formulario entero. Sacar una
 * pregunta de un formulario es editarlo, y quien está reordenando las
 * preguntas las borra y las vuelve a escribir todo el tiempo.
 */
create policy campos_borrar on public.formulario_campos
  for delete to authenticated
  using (
    public.puede('formularios', 'crear') or public.puede('formularios', 'editar')
  );

commit;

-- ------------------------------------------------------------ cómo quedó

select
  r.nombre                                                     as rol,
  case when r.es_admin then 'sí (siempre)'
       when coalesce(rp.ver, true)      then 'sí' else 'no' end as ve_el_modulo,
  case when r.es_admin then 'sí (siempre)'
       when coalesce(rp.crear, false)   then 'sí' else 'no' end as puede_crear,
  case when r.es_admin then 'sí (siempre)'
       when coalesce(rp.editar, false)  then 'sí' else 'no' end as puede_editar_preguntas,
  (select count(*) from public.usuarios u
    where u.rol_id = r.id and u.activo)                        as personas
  from public.roles r
  left join public.rol_permisos rp
         on rp.rol_id = r.id and rp.modulo = 'formularios'
 where r.activo
 order by r.es_admin desc, r.nombre;
