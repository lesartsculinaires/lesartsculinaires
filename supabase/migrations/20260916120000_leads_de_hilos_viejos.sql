begin;

-- Los hilos que entraron antes del reparto automático también reciben su lead.
--
-- ------------------------------------------------------------------------
-- QUÉ LES PASA A ESOS HILOS
-- ------------------------------------------------------------------------
--
-- Antes del 20260912, un mensaje de WhatsApp dejaba el cliente, la
-- conversación y el mensaje, pero no la oportunidad. Esas conversaciones
-- existen en la bandeja y no están en ningún otro lado: no salen en el
-- Pipeline, no cuentan en el tablero, y no tienen a quién asignarle nada
-- porque no hay lead que asignar.
--
-- Se los ve así: en la bandeja aparecen con «Sin asignar» y, al mirar en la
-- base, su cliente no tiene ninguna oportunidad.
--
-- Este archivo les abre el lead con las mismas reglas que usa hoy el webhook:
-- etapa Prospectos, canal Whatsapp y un asesor sorteado entre los que reciben.
--
-- ------------------------------------------------------------------------
-- A CUÁLES NO LES TOCA
-- ------------------------------------------------------------------------
--
--   Archivados        archivar es decir «esto no era un lead»: proveedores,
--                     números equivocados, gente preguntando una dirección.
--                     Abrirles una oportunidad ahora sería volver a meter en
--                     el embudo justo lo que alguien sacó a mano.
--
--   Sin cliente       si la conversación no tiene ficha detrás no hay a qué
--                     colgar el lead. Son poquísimos —pasa sólo si falló el
--                     alta— y se resuelven desde la bandeja.
--
--   Los que ya tienen es la misma regla del webhook: un cliente con
--                     oportunidad, abierta o cerrada, no estrena otra.
--
-- Crea filas, así que conviene mirar antes cuántas van a ser. La consulta está
-- abajo, comentada. Se puede correr con gente trabajando, y dos veces.

do $$
declare
  fila        record;
  candidatos  int := 0;
  creados     int := 0;
  quien       bigint;
  siguiente   int;
  codigo      text;
begin
  if to_regclass('public.conversaciones') is null then
    raise notice 'todavía no existe la bandeja; no hay nada que hacer';
    return;
  end if;

  for fila in
    select c.id as conversacion_id, c.cliente_id
      from public.conversaciones c
     where c.cliente_id is not null
       and not c.archivada
       and not exists (
         select 1 from public.oportunidades o where o.cliente_id = c.cliente_id
       )
     order by c.id
  loop
    candidatos := candidatos + 1;

    /*
     * El asesor, sorteado por fila y no una vez para todas.
     *
     * Con un solo sorteo al principio, los diez hilos viejos caerían todos en
     * la misma persona: la carga quedaría peor repartida que sin hacer nada.
     */
    select v.id into quien
      from public.vendedores_para_reparto() v
     order by random()
     limit 1;

    -- El código, con el mismo formato que asigna la aplicación.
    select coalesce(max((regexp_replace(o.codigo, '\D', '', 'g'))::int), 0) + 1
      into siguiente
      from public.oportunidades o
     where o.codigo ~ '^CRM-\d+$';

    codigo := 'CRM-' || lpad(siguiente::text, 4, '0');

    insert into public.oportunidades
      (codigo, cliente_id, vendedor_id, canal_id, etapa_id, fecha_registro)
    values (
      codigo,
      fila.cliente_id,
      quien,
      (select id from public.canales where nombre ilike 'whatsapp' limit 1),
      coalesce(
        (select id from public.etapas where nombre ilike 'prospectos' limit 1),
        (select id from public.etapas order by orden limit 1)
      ),
      current_date
    );

    -- Y el hilo queda del mismo asesor, como hace el webhook.
    update public.conversaciones
       set vendedor_id = quien
     where id = fila.conversacion_id and vendedor_id is null;

    creados := creados + 1;
  end loop;

  if candidatos = 0 then
    raise notice 'ningún hilo activo se había quedado sin lead';
  else
    raise notice 'leads abiertos para hilos viejos: % de %', creados, candidatos;
  end if;
end $$;

commit;

-- Para mirar cómo quedó:
--
--   select c.telefono,
--          coalesce(vo.nombre, 'SIN LEAD')    as dueno_del_lead,
--          coalesce(vc.nombre, 'SIN ASIGNAR') as dueno_del_chat,
--          c.archivada
--     from public.conversaciones c
--     left join public.oportunidades o on o.cliente_id = c.cliente_id
--     left join public.vendedores vo on vo.id = o.vendedor_id
--     left join public.vendedores vc on vc.id = c.vendedor_id
--    order by c.id desc;
