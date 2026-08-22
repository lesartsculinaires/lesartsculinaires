begin;

-- «SUPRÊME DIPLÔME» como área de interés en el formulario de feria.
--
-- ------------------------------------------------------------------------
-- POR QUÉ TAMBIÉN SE CREA EL PROGRAMA
-- ------------------------------------------------------------------------
--
-- Las cinco opciones que ya están llevan el id de su programa: se pregunta
-- «Pastelería Internacional» y el lead cae en el Diplomado de Pastelería. Eso
-- es lo que hace que después aparezca en Programas, en el Dashboard y en el
-- filtro de Clientes.
--
-- Una opción sin programa detrás se guarda igual, pero el lead entra sin
-- programa: se lee en la nota de su ficha y en ningún otro lado. Con el tiempo
-- son leads que no se pueden contar, y contar por programa es justamente para
-- lo que sirve preguntar el área de interés.
--
-- Así que el programa se crea si no está. Si ya existe con ese nombre no se
-- toca nada y la opción se engancha al que hay.
--
-- ------------------------------------------------------------------------
-- EL NOMBRE, EN DOS LUGARES Y CON DOS FORMAS
-- ------------------------------------------------------------------------
--
--   En el formulario   SUPRÊME DIPLÔME, tal cual se pidió. Es lo que lee la
--                      persona en la feria.
--   En el catálogo     Suprême Diplôme, como los demás programas. Ese nombre
--                      sale en Programas, en el Dashboard y en los filtros,
--                      donde catorce programas en mayúsculas se leerían peor.
--
-- Si se prefiere en mayúsculas también en el catálogo, se renombra desde el
-- módulo Programas sin tocar nada de esto: la opción guarda el id, no el texto.
--
-- Sólo agrega una fila y una opción. Se puede correr con gente trabajando, y
-- dos veces.

do $$
declare
  id_programa bigint;
  tocadas     int;
begin
  if to_regclass('public.formulario_campos') is null then
    raise notice 'todavía no existen los formularios; no hay dónde agregarla';
    return;
  end if;

  -- El programa. `on conflict` por si ya está cargado en producción.
  insert into public.productos (nombre, categoria)
  values ('Suprême Diplôme', 'Diplomado')
  on conflict (nombre) do nothing;

  select id into id_programa from public.productos where nombre = 'Suprême Diplôme';

  /*
   * La opción, al final de la lista y sólo si no está.
   *
   * Se busca por el texto dentro del jsonb y no por la cantidad de opciones:
   * correr esto dos veces con un contador dejaría la opción repetida, y en la
   * feria se vería dos veces lo mismo sin que nadie entienda por qué.
   */
  update public.formulario_campos c
     set opciones = c.opciones || jsonb_build_array(
           jsonb_build_object('texto', 'SUPRÊME DIPLÔME', 'valor', id_programa))
   where c.mapea_a = 'producto_id'
     and c.tipo in ('opcion', 'opciones')
     and not exists (
       select 1 from jsonb_array_elements(c.opciones) as o
        where o ->> 'texto' = 'SUPRÊME DIPLÔME'
     );

  get diagnostics tocadas = row_count;

  if tocadas = 0 then
    raise notice 'ya estaba, o el formulario no tiene una pregunta de programa';
  else
    raise notice 'SUPRÊME DIPLÔME agregada en % pregunta(s), enlazada al programa %',
      tocadas, id_programa;
  end if;
end $$;

commit;
