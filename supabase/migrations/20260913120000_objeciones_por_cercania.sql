begin;

-- «Muy caro» pasa a ser «Objeciones por cercanía».
--
-- ------------------------------------------------------------------------
-- POR QUÉ NO ES UN SIMPLE UPDATE
-- ------------------------------------------------------------------------
--
-- Renombrar un motivo cambia lo que dicen los leads que ya lo tienen puesto.
-- Un lead marcado «Muy caro» en agosto no se perdió por la distancia, y
-- después del renombre el CRM diría que sí: el número del tablero seguiría
-- igual pero significaría otra cosa, y nadie tendría manera de notarlo.
--
-- Así que se mira antes:
--
--   Nadie lo usó todavía   se renombra y listo. No hay historia que torcer.
--
--   Ya hay leads marcados   se conserva «Muy caro» —apagado, para que deje de
--                           ofrecerse— y se crea el motivo nuevo al lado. Los
--                           leads viejos siguen diciendo lo que decían, los
--                           nuevos usan el nuevo, y el tablero puede comparar
--                           los dos sin mezclarlos.
--
-- La pantalla sólo ofrece los activos, así que apagarlo alcanza para que
-- desaparezca de los botones sin borrar nada.
--
-- ------------------------------------------------------------------------
-- POR QUÉ NO SE BORRA NUNCA
-- ------------------------------------------------------------------------
--
-- `oportunidades.motivo_perdida_id` apunta acá. Borrar la fila dejaría a esos
-- leads sin motivo —o directamente rompería el borrado, según la regla de la
-- clave— y perdería el único dato que explica por qué se cayó una venta.
--
-- Sólo toca el catálogo. Se puede correr con gente trabajando, y dos veces.

do $$
declare
  id_viejo bigint;
  en_uso   int;
begin
  if to_regclass('public.motivos_perdida') is null then
    raise notice 'todavía no existen los motivos de pérdida; no hay nada que cambiar';
    return;
  end if;

  select id into id_viejo from public.motivos_perdida where nombre = 'Muy caro';

  if id_viejo is null then
    -- O ya se corrió esto, o el motivo se editó a mano. En cualquier caso, lo
    -- único que hace falta es que el nuevo exista.
    insert into public.motivos_perdida (nombre, orden)
    values ('Objeciones por cercanía', 3)
    on conflict (nombre) do nothing;
    raise notice '«Muy caro» ya no estaba; «Objeciones por cercanía» queda puesto';
    return;
  end if;

  select count(*) into en_uso
    from public.oportunidades
   where motivo_perdida_id = id_viejo;

  if en_uso = 0 then
    update public.motivos_perdida
       set nombre = 'Objeciones por cercanía'
     where id = id_viejo;
    raise notice 'renombrado: nadie lo tenía puesto';
  else
    update public.motivos_perdida set activo = false where id = id_viejo;

    insert into public.motivos_perdida (nombre, orden)
    values ('Objeciones por cercanía', 3)
    on conflict (nombre) do update set activo = true;

    raise notice
      '% lead(s) ya decían «Muy caro»: se conserva apagado y se agrega el nuevo al lado',
      en_uso;
  end if;
end $$;

commit;
