begin;

-- «Suprême Diplôme» en el formulario, no «SUPRÊME DIPLÔME».
--
-- ------------------------------------------------------------------------
-- QUÉ CAMBIA
-- ------------------------------------------------------------------------
--
-- Sólo cómo se lee la opción en la pantalla de la feria. El programa detrás
-- es el mismo y el lead cae en el mismo lugar: la opción guarda el id, no el
-- texto, así que renombrarla no mueve ni un lead.
--
-- Con esto el nombre queda igual en los dos lados —formulario y catálogo—,
-- que era lo que quedaba disparejo.
--
-- ------------------------------------------------------------------------
-- POR QUÉ ATIENDE TRES CASOS Y NO UNO
-- ------------------------------------------------------------------------
--
-- Según si ya se corrió la migración anterior, la base puede estar de tres
-- maneras, y este archivo tiene que dejar las tres iguales:
--
--   1. Está en mayúsculas  →  se renombra.
--   2. Ya está bien        →  no se toca.
--   3. No está             →  se agrega, por si se corre esta sin la otra.
--
-- Lo que ya se contestó en ferias pasadas no se toca: esas respuestas son el
-- registro de lo que la persona vio y eligió ese día, y reescribirlas sería
-- cambiarle las palabras a algo que ya pasó.
--
-- Sólo cambia un texto. Se puede correr con gente trabajando, y dos veces.

do $$
declare
  id_programa bigint;
  renombradas int;
  agregadas   int;
begin
  if to_regclass('public.formulario_campos') is null then
    raise notice 'todavía no existen los formularios; no hay nada que renombrar';
    return;
  end if;

  -- El programa, por si esta migración corre sin la anterior.
  insert into public.productos (nombre, categoria)
  values ('Suprême Diplôme', 'Diplomado')
  on conflict (nombre) do nothing;

  select id into id_programa from public.productos where nombre = 'Suprême Diplôme';

  /*
   * Caso 1: renombrar la que está en mayúsculas.
   *
   * `jsonb_agg` sobre `jsonb_array_elements` rearma la lista entera. Es la
   * forma de tocar un elemento sin saber en qué posición quedó: si mañana se
   * agrega otra opción antes, esto sigue funcionando igual.
   *
   * `with ordinality` mantiene el orden original; sin eso `jsonb_agg` puede
   * devolver las opciones en cualquier orden y la lista se barajaría sola.
   */
  update public.formulario_campos c
     set opciones = (
           select jsonb_agg(
                    case when o ->> 'texto' = 'SUPRÊME DIPLÔME'
                         then jsonb_set(o, '{texto}', to_jsonb('Suprême Diplôme'::text))
                         else o end
                    order by n)
             from jsonb_array_elements(c.opciones) with ordinality as t(o, n)
         )
   where c.mapea_a = 'producto_id'
     and c.tipo in ('opcion', 'opciones')
     and exists (
       select 1 from jsonb_array_elements(c.opciones) as o
        where o ->> 'texto' = 'SUPRÊME DIPLÔME'
     );

  get diagnostics renombradas = row_count;

  -- Caso 3: no estaba de ninguna de las dos formas.
  update public.formulario_campos c
     set opciones = c.opciones || jsonb_build_array(
           jsonb_build_object('texto', 'Suprême Diplôme', 'valor', id_programa))
   where c.mapea_a = 'producto_id'
     and c.tipo in ('opcion', 'opciones')
     and not exists (
       select 1 from jsonb_array_elements(c.opciones) as o
        where o ->> 'texto' = 'Suprême Diplôme'
     );

  get diagnostics agregadas = row_count;

  if renombradas > 0 then
    raise notice 'renombrada a «Suprême Diplôme» en % pregunta(s)', renombradas;
  elsif agregadas > 0 then
    raise notice 'no estaba: agregada como «Suprême Diplôme» en % pregunta(s), programa %',
      agregadas, id_programa;
  else
    raise notice 'ya decía «Suprême Diplôme»; no hubo nada que cambiar';
  end if;
end $$;

commit;
