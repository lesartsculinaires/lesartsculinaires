begin;

-- Alta de vendedores: quién puede, y que quede anotado.
--
-- LO QUE HAY QUE TENER CLARO ANTES DE TOCAR ESTO
--
-- «Vendedor» y «usuario del CRM» son dos cosas distintas y viven en tablas
-- separadas, sin ninguna columna que las una:
--
--   `vendedores`  es el catálogo al que se le asignan oportunidades. Tiene
--                 nombre, correo y teléfono. No da acceso a nada.
--   `usuarios`    son las cuentas que entran al CRM, y son las que tienen rol
--                 y permisos. Se administran desde «Usuarios y Roles».
--
-- Crear un vendedor NO crea una cuenta, y crear una cuenta NO crea un
-- vendedor. Las dos cosas hacen falta para alguien que atiende y entra al
-- sistema, y olvidarse de una da los dos síntomas típicos: alguien que puede
-- entrar pero no aparece para asignarle leads, o alguien que recibe leads pero
-- no puede entrar a verlos.
--
-- De qué cuelga un vendedor, que es lo que se rompe si se lo borra: las
-- oportunidades (`vendedor_id`), los eventos del calendario, las
-- conversaciones de la bandeja y los cursos del historial. Todas esas
-- referencias son `on delete set null`, así que borrar un vendedor no borra
-- trabajo: lo deja sin asignar. Aun así lo correcto es desactivarlo —`activo`
-- en falso— y no borrarlo, para que su historial siga diciendo quién atendió.
--
-- Sólo cambia una política y agrega un trigger. No toca datos.

-- ------------------------------------------------------------------ permisos

drop policy if exists auth_all_vendedores on public.vendedores;

-- Leer, todo el equipo: sin esta lista no se puede asignar ni filtrar nada.
drop policy if exists vendedores_leer on public.vendedores;
create policy vendedores_leer on public.vendedores
  for select to authenticated using (true);

-- Escribir, sólo dirección. Un vendedor de más aparece en todos los
-- desplegables del CRM y en la API que reparte leads; quién entra a esa lista
-- es una decisión de dirección, no de quien está atendiendo.
drop policy if exists vendedores_administrar on public.vendedores;
create policy vendedores_administrar on public.vendedores
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ----------------------------------------------------------------- actividad
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_actividad') then
    execute 'drop trigger if exists trg_actividad_vendedores on public.vendedores';
    execute 'create trigger trg_actividad_vendedores
      after insert or update or delete on public.vendedores
      for each row execute function public.registrar_actividad(
        ''{nombre,correo,telefono,activo}'', ''vendedor'')';
  else
    raise notice 'todavía no está el registro de actividad; se omite su trigger';
  end if;
end $$;

commit;
