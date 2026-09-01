-- ===========================================================================
-- La etapa «Cierre» pasa a llamarse «Perdido»
-- ===========================================================================
--
-- Lo pidió la escuela con estas palabras: «en el pipeline quiero que cambies
-- la palabra Cierre por Perdido, o sea que en la ficha del cliente, en la
-- opción de etapa, también cambies la palabra Cierre por Perdido».
--
-- ---------------------------------------------------------------------------
-- POR QUÉ ESTO ES UNA MIGRACIÓN Y NO UN CAMBIO EN LA PANTALLA
-- ---------------------------------------------------------------------------
--
-- Porque el nombre de la etapa no está escrito en el código: sale de esta
-- tabla. El tablero dibuja una columna por fila de `etapas` y la ficha llena
-- el desplegable con lo mismo, así que cambiándolo acá cambia en los dos
-- lugares a la vez, que es exactamente lo que se pidió.
--
-- Y por eso mismo NO se toca ninguna oportunidad: las que estaban en esa etapa
-- siguen apuntando a la misma fila, que ahora se llama distinto. No se mueve
-- ningún lead ni se pierde ninguna cuenta.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTO NO CAMBIA, PARA QUE NO SORPRENDA
-- ---------------------------------------------------------------------------
--
--   EL ESTADO «Perdido»       Es otra cosa y sigue igual. `estados` dice si el
--                             trato se ganó o se perdió y es lo que cuenta
--                             para los informes; `etapas` dice por dónde va en
--                             el embudo. Que ahora haya una etapa y un estado
--                             con el mismo nombre no los mezcla: son dos
--                             columnas distintas de `oportunidades`.
--
--   LOS RECORDATORIOS DE      El tipo «cierre» de `seguimientos` no sale de la
--   CIERRE                    etapa: lo dispara el texto de una nota que dice
--                             «seguimiento de cierre». Sigue funcionando igual
--                             y no había que tocarlo.
--
--   EL ORDEN EN EL TABLERO    La etapa se queda donde estaba, entre «Pago» y
--                             «Ganado». Sólo se cambió el nombre, que es lo
--                             que se pidió. Si además hay que moverla al final
--                             del embudo, es un `update` de `orden` aparte y
--                             conviene decidirlo mirando el tablero.
-- ===========================================================================

do $$
begin
  -- Si ya existe una etapa llamada «Perdido» no se hace nada: dos etapas con
  -- el mismo nombre dejarían dos columnas iguales en el tablero y nadie
  -- sabría a cuál arrastrar. Correr esto dos veces es seguro.
  if exists (select 1 from public.etapas where nombre = 'Perdido') then
    raise notice 'Ya hay una etapa «Perdido»; no se cambia nada.';
    return;
  end if;

  if not exists (select 1 from public.etapas where nombre = 'Cierre') then
    raise notice 'No hay ninguna etapa «Cierre»; no había nada que renombrar.';
    return;
  end if;

  update public.etapas set nombre = 'Perdido' where nombre = 'Cierre';

  raise notice 'La etapa «Cierre» ahora se llama «Perdido».';
end $$;

-- Comprobación: cuántos leads quedaron en esa etapa. No cambió ninguno; el
-- número es el mismo de antes y está para poder contrastarlo.
select e.nombre    as etapa,
       e.orden,
       count(o.id) as leads
  from public.etapas e
  left join public.oportunidades o on o.etapa_id = e.id
 group by e.nombre, e.orden
 order by e.orden;
