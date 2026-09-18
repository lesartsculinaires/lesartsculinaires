begin;

-- ============================================================================
-- El área de interés admite varias, y debajo una caja para escribir
-- ============================================================================
--
-- Lo que pidió la escuela: «en el área de interés principal que se pueda elegir
-- opción múltiple, y en la parte de abajo de esa área colocar una caja de texto
-- para poder escribir».
--
-- ----------------------------------------------------------------------------
-- POR QUÉ ESTO ES UNA MIGRACIÓN Y NO CÓDIGO
-- ----------------------------------------------------------------------------
--
-- Porque el CRM ya sabe hacer las dos cosas. Los formularios se arman con datos:
-- cada pregunta es una fila de `formulario_campos` con su `tipo`, y los tipos
-- «opciones» (elegir varias) y «parrafo» (texto largo) existen desde el primer
-- día, con su casilla en el armador y su dibujo en la pantalla que se llena.
--
-- Y lo más importante, que es donde esto se podría haber roto en silencio: el
-- alta del lead ya reparte las marcas. Una pregunta de elegir-varias que
-- alimenta el programa guarda la primera en `producto_id` —el que lleva la plata
-- del trato— y TODAS en `programas_interes`, que terminan en los programas de la
-- oportunidad. O sea que alguien interesado en Pastelería y Barismo entra con
-- los dos, no con el primero y el resto perdido.
--
-- Así que acá no hay nada que programar: hay que cambiar la pregunta.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ LA CAJA DE TEXTO VA JUSTO DEBAJO Y NO AL FINAL
-- ----------------------------------------------------------------------------
--
-- Porque es la continuación de la pregunta anterior. Quien acaba de marcar tres
-- áreas tiene, en ese momento, algo que aclarar —«me interesan las dos pero
-- primero pastelería», «¿hay horario sábado?»— y es ahí donde lo va a escribir.
-- Al final del formulario, después de otras preguntas, ese comentario ya no
-- llega: la persona ya cerró ese tema en la cabeza.
--
-- No mapea a ninguna columna, y es a propósito: va a la nota del lead. Lo que
-- alguien escribe suelto no tiene una casilla donde encaje, y forzarlo dentro de
-- una que casi sirve es peor que dejarlo escrito donde se lee entero.
--
-- Se puede correr con gente llenando formularios, y dos veces.

-- ------------------------------------------------- 1. de elegir una a varias

update public.formulario_campos
   set tipo   = 'opciones',
       /*
        * La ayuda cambia junto con el tipo, no aparte.
        *
        * Las casillas cuadradas ya insinúan que se puede marcar más de una,
        * pero mucha gente rellena la primera y sigue de largo por costumbre.
        * Una línea que lo diga cuesta nada y es la diferencia entre enterarse
        * de que le interesan tres programas o de uno.
        */
       ayuda  = coalesce(nullif(trim(ayuda), ''), 'Podés marcar más de una.')
 where etiqueta ilike '%interés principal%'
   and tipo = 'opcion';

-- --------------------------------- 2. la caja de texto, pegada a esa pregunta

do $$
declare
  campo   record;
  destino smallint;
begin
  for campo in
    select id, formulario_id, orden
      from public.formulario_campos
     where etiqueta ilike '%interés principal%'
       and tipo = 'opciones'
  loop
    -- Ya la tiene: correr esto dos veces no agrega dos cajas.
    if exists (
      select 1 from public.formulario_campos
       where formulario_id = campo.formulario_id
         and tipo = 'parrafo'
         and orden = campo.orden + 1
    ) then
      continue;
    end if;

    destino := campo.orden + 1;

    /*
     * Correr un lugar lo que venía después, en dos pasos.
     *
     * `formulario_campos` tiene `unique (formulario_id, orden)`, y un update
     * que suma 1 a varias filas a la vez choca consigo mismo: la fila 7 intenta
     * ser 8 mientras la 8 todavía existe. Mandarlas primero a un rango alto y
     * traerlas después esquiva ese cruce sin tener que tocar la restricción,
     * que es lo que evita que dos preguntas terminen en el mismo lugar.
     */
    update public.formulario_campos
       set orden = orden + 1000
     where formulario_id = campo.formulario_id
       and orden >= destino;

    update public.formulario_campos
       set orden = orden - 999
     where formulario_id = campo.formulario_id
       and orden >= 1000 + destino;

    insert into public.formulario_campos
      (formulario_id, orden, etiqueta, ayuda, tipo, requerido, opciones, mapea_a)
    values (
      campo.formulario_id,
      destino,
      '¿Querés contarnos algo más?',
      'Por ejemplo, qué horarios te sirven, si ya tenés experiencia, o cualquier duda.',
      'parrafo',
      -- Nunca obligatoria: una pregunta abierta y con asterisco hace que la
      -- gente escriba «nada» para poder seguir, y eso ensucia la nota de todos
      -- los leads sin aportar un dato.
      false,
      '[]'::jsonb,
      -- Sin columna: va a la nota. Ver el encabezado.
      null
    );
  end loop;
end $$;

commit;

-- ------------------------------------------------------------- cómo quedó

select
  f.nombre                                as formulario,
  c.orden,
  c.etiqueta,
  case c.tipo
    when 'opciones' then '✓ elegir varias'
    when 'opcion'   then '· elegir una'
    when 'parrafo'  then '✓ caja de texto'
    else c.tipo
  end                                     as tipo,
  case when c.requerido then 'obligatoria' else 'opcional' end as pide
from public.formulario_campos c
join public.formularios f on f.id = c.formulario_id
where c.formulario_id in (
  select formulario_id from public.formulario_campos
   where etiqueta ilike '%interés principal%'
)
order by f.nombre, c.orden;
