begin;

-- Los hilos sin dueño heredan el del lead.
--
-- ------------------------------------------------------------------------
-- QUÉ ARREGLA
-- ------------------------------------------------------------------------
--
-- El CRM guarda dos dueños distintos, y cada pantalla lee el suyo:
--
--   oportunidades.vendedor_id   de quién es el lead     → sale en el Pipeline
--   conversaciones.vendedor_id  de quién es el chat     → sale en la bandeja
--
-- El reparto automático ponía el primero y no el segundo. El lead entraba con
-- dueño, y el mismo contacto aparecía en la bandeja diciendo «sin asignar»:
-- la misma persona, dos respuestas distintas. El asesor al que le tocaba no
-- tenía cómo saber que era suyo mirando la bandeja, que es justamente donde
-- primero se entera de que alguien escribió.
--
-- El código ya quedó copiando el dueño al hilo. Esto es para los que se
-- crearon antes, y para los que venían de la época en que se asignaban a mano.
--
-- ------------------------------------------------------------------------
-- DE DÓNDE SALE EL DUEÑO
-- ------------------------------------------------------------------------
--
-- Del lead más reciente de ese cliente que tenga dueño puesto. Si tiene
-- varios, el último es el que se está atendiendo; los viejos pueden ser de
-- alguien que ya no está en la escuela.
--
-- Sólo toca los hilos que no tienen dueño. Uno asignado a mano es una decisión
-- de una persona y vale más que cualquier cosa que deduzca este archivo.
--
-- Se puede correr con gente trabajando, y dos veces.

do $$
declare
  arreglados int;
begin
  if to_regclass('public.conversaciones') is null then
    raise notice 'todavía no existe la bandeja; no hay nada que arreglar';
    return;
  end if;

  update public.conversaciones c
     set vendedor_id = (
       select o.vendedor_id
         from public.oportunidades o
        where o.cliente_id = c.cliente_id
          and o.vendedor_id is not null
        order by o.id desc
        limit 1
     )
   where c.vendedor_id is null
     and c.cliente_id is not null
     and exists (
       select 1 from public.oportunidades o
        where o.cliente_id = c.cliente_id and o.vendedor_id is not null
     );

  get diagnostics arreglados = row_count;

  if arreglados = 0 then
    raise notice 'ningún hilo estaba sin dueño teniendo lead asignado';
  else
    raise notice 'hilos que ahora muestran a su asesor: %', arreglados;
  end if;
end $$;

commit;
