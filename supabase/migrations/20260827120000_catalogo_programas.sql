begin;

-- Crear programas: quién puede, y que quede anotado.
--
-- POR QUÉ ESTO NO ES UN CAMPO MÁS
--
-- `productos` no es una tabla que use una pantalla: es el catálogo del que
-- cuelga medio CRM. Un programa nuevo aparece solo en la ficha del cliente, en
-- el alta, en el selector de cursos realizados, en el emparejado por nombre de
-- la importación de bases, en los catálogos que consume n8n y en los cortes
-- por programa del Dashboard. Un nombre mal escrito acá se propaga a todo eso,
-- y como `nombre` es único, el «Diplomado de Cocina» duplicado entra como
-- «Diplomado Cocina» y a partir de ahí los reportes cuentan dos programas
-- donde hay uno.
--
-- Por eso el alta pasa a ser cosa de dirección. Hasta ahora cualquiera con
-- sesión podía escribir el catálogo; el resto de las tablas se queda como
-- está, esto cambia sólo `productos`.
--
-- Sólo cambia una política y agrega un trigger. No toca datos.

-- ------------------------------------------------------------------ permisos

drop policy if exists auth_all_productos on public.productos;

-- Leer, todo el equipo: sin el catálogo no se puede ni abrir una ficha.
drop policy if exists productos_leer on public.productos;
create policy productos_leer on public.productos
  for select to authenticated using (true);

-- Escribir, sólo dirección. La pantalla además esconde el botón, pero eso es
-- comodidad: lo que impide de verdad que se cuele un programa es esto.
drop policy if exists productos_administrar on public.productos;
create policy productos_administrar on public.productos
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ----------------------------------------------------------------- actividad
--
-- Crear o cambiar un programa mueve los reportes de todos, así que tiene que
-- quedar dicho quién lo hizo. La guarda es porque el registro de actividad
-- puede no estar corrido todavía.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_actividad') then
    execute 'drop trigger if exists trg_actividad_productos on public.productos';
    execute 'create trigger trg_actividad_productos
      after insert or update or delete on public.productos
      for each row execute function public.registrar_actividad(
        ''{nombre,categoria,precio,activo}'', ''programa'')';
  else
    raise notice 'todavía no está el registro de actividad; se omite su trigger';
  end if;
end $$;

commit;
