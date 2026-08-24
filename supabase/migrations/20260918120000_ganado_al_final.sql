begin;

-- «Ganado» va al final del tablero, después de Cierre.
--
-- ------------------------------------------------------------------------
-- QUÉ CAMBIA
-- ------------------------------------------------------------------------
--
-- El archivo anterior la puso entre Pago y Cierre. Va al final: es donde
-- termina el proceso, y un tablero se lee de izquierda a derecha como una
-- línea de tiempo. Una columna de «ganado» en el medio hace pensar que
-- después de ganar todavía queda algo por hacer.
--
-- Sólo mueve el orden. La etapa es la misma fila, así que las fichas que ya
-- estén en Ganado se quedan donde están: cambia la columna de lugar, no las
-- tarjetas de columna.
--
-- El vínculo con el Estado no se toca: sigue igual, mover una ficha a Ganado
-- le pone el Estado en Ganado.
--
-- Sólo cambia números de orden. Se puede correr con gente trabajando, y dos
-- veces.

do $$
declare
  ultimo smallint;
  actual smallint;
begin
  select orden into actual from public.etapas where nombre = 'Ganado';

  if actual is null then
    raise notice 'no existe la etapa Ganado; corré antes 20260917120000_etapa_ganado.sql';
    return;
  end if;

  select max(orden) into ultimo from public.etapas;

  if actual = ultimo then
    raise notice 'Ganado ya estaba al final; no se toca nada';
    return;
  end if;

  /*
   * El corrimiento va en dos pasos porque `orden` es único.
   *
   * Primero se la manda a un número que no puede chocar con nadie —negativo—,
   * y con el lugar libre las de atrás suben una posición. Recién entonces
   * vuelve, al final. Haciéndolo directo, el primer update chocaría contra la
   * fila que todavía ocupa el lugar de destino.
   */
  update public.etapas set orden = -1 where nombre = 'Ganado';
  update public.etapas set orden = orden - 1 where orden > actual;
  update public.etapas set orden = ultimo where nombre = 'Ganado';

  raise notice 'Ganado quedó al final, después de la que venía última';
end $$;

commit;
