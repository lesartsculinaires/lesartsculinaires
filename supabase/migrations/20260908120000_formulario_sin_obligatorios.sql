begin;

-- Ninguna pregunta del formulario es obligatoria.
--
-- ------------------------------------------------------------------------
-- POR QUÉ
-- ------------------------------------------------------------------------
--
-- El formulario se llena de pie, en un stand, con la persona enfrente y
-- mirando. Ahí, un campo que frena el guardado no consigue que se complete:
-- consigue que el asesor cierre la pantalla y pierda el contacto entero. Un
-- lead con el teléfono y nada más vale muchísimo más que ninguno.
--
-- Lo que se pregunta no cambia: las siete preguntas siguen ahí y se contestan
-- igual cuando hay tiempo. Lo que se saca es el bloqueo.
--
-- ------------------------------------------------------------------------
-- LO QUE NO SE PUEDE QUITAR
-- ------------------------------------------------------------------------
--
-- `clientes.nombre` es `not null`: un cliente sin ninguna palabra en el nombre
-- no se puede guardar, y no es un capricho del CRM sino de cómo se lista gente
-- en todas las pantallas. Eso NO se resuelve acá sino en la aplicación, que
-- cuando el nombre llega vacío lo arma con el teléfono o el correo —«Contacto
-- 7100-4455»— en vez de frenar. Así el asesor nunca queda trabado y la ficha
-- se puede encontrar y renombrar después.
--
-- La casilla «Obligatoria» del constructor sigue existiendo: esto apaga las
-- que están puestas hoy, no la posibilidad de usarlas mañana.
--
-- Sólo cambia banderas. Se puede correr con gente trabajando, y dos veces.

do $$
declare
  cuantas int;
begin
  if to_regclass('public.formulario_campos') is null then
    raise notice 'todavía no existen los formularios; no hay nada que aflojar';
    return;
  end if;

  update public.formulario_campos
     set requerido = false
   where requerido;

  get diagnostics cuantas = row_count;
  raise notice 'preguntas que dejaron de ser obligatorias: %', cuantas;
end $$;

commit;
