begin;

-- Prospectos: la primera etapa del embudo.
--
-- Antes el embudo arrancaba en «Primer contacto», y eso obligaba a que todo
-- lo que entraba ya estuviera contactado. Los nombres que llegan de una base
-- comprada, de una feria o de una campaña no lo están: son gente que todavía
-- no sabe que existimos. Metidos en «Primer contacto» inflan esa columna y
-- hacen que el pipeline mienta sobre cuánto trabajo hay hecho.
--
-- Con Prospectos adelante, «Primer contacto» vuelve a significar lo que dice:
-- alguien ya le habló.
--
-- Sólo mueve el catálogo de etapas. No toca ninguna oportunidad: las que
-- están en «Primer contacto» siguen ahí, y quien quiera bajarlas a Prospectos
-- las arrastra. Mover fichas por nuestra cuenta sería decidir por el equipo
-- de ventas cuáles ya trabajó.
--
-- Se puede correr con gente trabajando, y dos veces sin romper nada.

do $$
begin
  if exists (select 1 from public.etapas where nombre = 'Prospectos') then
    raise notice 'Prospectos ya estaba: no se toca nada';
    return;
  end if;

  -- El corrimiento va en dos pasos porque `orden` es único: pasando de una a
  -- la otra directo, la primera fila en moverse chocaría con la que todavía
  -- ocupa el lugar siguiente. Yéndose todas a negativo primero, ningún paso
  -- pisa un número ocupado.
  update public.etapas set orden = -orden;
  update public.etapas set orden = -orden + 1;

  -- El id lo pone la secuencia, pero las etapas de fábrica se cargaron con
  -- ids escritos a mano; si la secuencia quedó atrás, el insert chocaría con
  -- una clave que ya existe. Esto la deja donde corresponde antes de insertar.
  perform setval(
    pg_get_serial_sequence('public.etapas', 'id'),
    coalesce((select max(id) from public.etapas), 1)
  );

  insert into public.etapas (nombre, orden) values ('Prospectos', 1);
  raise notice 'Prospectos quedó primera; las demás corrieron un lugar';
end $$;

commit;
