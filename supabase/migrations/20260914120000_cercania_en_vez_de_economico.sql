begin;

-- Corrección: «Muy caro» se queda, y el que cambia es «Problema económico».
--
-- ------------------------------------------------------------------------
-- QUÉ PASÓ
-- ------------------------------------------------------------------------
--
-- El archivo anterior —20260913120000— cambiaba «Muy caro» por «Objeciones
-- por cercanía». Era el motivo equivocado. Éste deja el catálogo como se
-- pidió, se haya corrido aquél o no:
--
--   Si no se corrió    no hay nada que deshacer y se hace sólo el cambio
--                      bueno.
--   Si sí se corrió    se devuelve «Muy caro» a su lugar y después se hace el
--                      cambio bueno.
--
-- Por eso mira el estado en vez de suponerlo. Un archivo que dé por sentado
-- que el anterior corrió deja la base rota justo en la mitad de los casos.
--
-- ------------------------------------------------------------------------
-- LA MISMA REGLA DE SIEMPRE CON LOS RENOMBRES
-- ------------------------------------------------------------------------
--
-- Renombrar un motivo cambia lo que dicen los leads que ya lo tienen puesto.
-- Un lead perdido por plata no se perdió por la distancia. Así que:
--
--   Nadie lo usó       se renombra, y listo.
--   Ya hay leads       se conserva el viejo apagado —la pantalla sólo ofrece
--                      los activos, así que desaparece de los botones— y se
--                      crea el nuevo al lado. La historia queda intacta.
--
-- Sólo toca el catálogo. Se puede correr con gente trabajando, y dos veces.

do $$
declare
  id_cercania  bigint;
  id_muy_caro  bigint;
  id_economico bigint;
  en_uso       int;
begin
  if to_regclass('public.motivos_perdida') is null then
    raise notice 'todavía no existen los motivos de pérdida; no hay nada que cambiar';
    return;
  end if;

  -- ------------------------------------------------- ¿ya está como se pidió?
  --
  -- Sin esta salida, una segunda corrida vuelve a recorrer todo: toma la fila
  -- buena por «la de más», la borra —porque todavía no la usa nadie— y la
  -- vuelve a crear. Termina bien, pero con otro id y con avisos que no tienen
  -- nada que ver con lo que pasó. Que correr algo dos veces no haga nada es
  -- mejor que haga lo mismo dando un rodeo.

  if exists (select 1 from public.motivos_perdida where nombre = 'Objeciones por cercanía' and activo)
     and exists (select 1 from public.motivos_perdida where nombre = 'Muy caro' and activo)
     and not exists (select 1 from public.motivos_perdida where nombre = 'Problema económico' and activo)
  then
    raise notice 'el catálogo ya está como se pidió; no se toca nada';
    return;
  end if;

  -- ------------------------------------------------------ deshacer lo otro

  select id into id_cercania  from public.motivos_perdida where nombre = 'Objeciones por cercanía';
  select id into id_muy_caro  from public.motivos_perdida where nombre = 'Muy caro';

  if id_cercania is not null and id_muy_caro is null then
    -- El anterior renombró «Muy caro» en el lugar: ésta es esa misma fila.
    update public.motivos_perdida
       set nombre = 'Muy caro', activo = true
     where id = id_cercania;
    id_muy_caro := id_cercania;
    id_cercania := null;
    raise notice '«Muy caro» vuelve a su nombre';

  elsif id_cercania is not null and id_muy_caro is not null then
    -- El anterior apagó «Muy caro» y creó una fila nueva al lado.
    update public.motivos_perdida set activo = true where id = id_muy_caro;

    select count(*) into en_uso
      from public.oportunidades where motivo_perdida_id = id_cercania;

    if en_uso = 0 then
      delete from public.motivos_perdida where id = id_cercania;
      id_cercania := null;
      raise notice '«Muy caro» reactivado; la fila de más se quitó';
    else
      -- Alguien ya marcó leads con ella. Borrarla los dejaría sin motivo, así
      -- que se queda; el cambio de abajo se saltea para no chocar con el
      -- nombre, que es único.
      raise notice
        'ATENCIÓN: % lead(s) ya usan «Objeciones por cercanía». Se deja como está y NO se toca «Problema económico»: hacerlo necesitaría decidir qué pasa con esos leads.',
        en_uso;
      return;
    end if;
  end if;

  -- ------------------------------------------------------- el cambio bueno

  select id into id_economico from public.motivos_perdida where nombre = 'Problema económico';

  if id_economico is null then
    insert into public.motivos_perdida (nombre, orden)
    values ('Objeciones por cercanía', 1)
    on conflict (nombre) do update set activo = true;
    raise notice '«Problema económico» ya no estaba; «Objeciones por cercanía» queda puesto';
    return;
  end if;

  select count(*) into en_uso
    from public.oportunidades where motivo_perdida_id = id_economico;

  if en_uso = 0 then
    update public.motivos_perdida
       set nombre = 'Objeciones por cercanía'
     where id = id_economico;
    raise notice 'renombrado: nadie tenía puesto «Problema económico»';
  else
    update public.motivos_perdida set activo = false where id = id_economico;

    insert into public.motivos_perdida (nombre, orden)
    values ('Objeciones por cercanía', 1)
    on conflict (nombre) do update set activo = true;

    raise notice
      '% lead(s) ya decían «Problema económico»: se conserva apagado y se agrega el nuevo al lado',
      en_uso;
  end if;
end $$;

commit;
