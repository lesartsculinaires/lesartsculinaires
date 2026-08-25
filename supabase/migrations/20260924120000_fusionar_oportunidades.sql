begin;

-- Unir dos leads que son el mismo.
--
-- ------------------------------------------------------------------------
-- POR QUÉ NO ALCANZABA CON FUSIONAR CONTACTOS
-- ------------------------------------------------------------------------
--
-- `fusionar_contactos` une fichas: dos «katy G» pasan a ser una. Pero después
-- de eso la persona queda con dos leads del mismo programa —uno en Propuesta y
-- otro en Cierre— porque cada canal abrió el suyo. Eso sigue estando mal: el
-- tablero cuenta dos oportunidades donde hay una sola venta posible, y el
-- pronóstico suma dos veces la misma plata.
--
-- Son dos operaciones distintas y van separadas a propósito. A veces hay que
-- hacer las dos, y a veces sólo ésta: cuando la ficha era una sola desde el
-- principio y lo que se duplicó fue el lead.
--
-- ------------------------------------------------------------------------
-- LO QUE HACE, EN ORDEN
-- ------------------------------------------------------------------------
--
-- 1. Comprueba que los dos leads sean de la misma persona. Sin eso, un id mal
--    tipeado movería el historial de un cliente al de otro, en silencio.
-- 2. Guarda el canal del lead que se va en el historial del contacto. Es el
--    motivo entero de esto: la persona SÍ llegó por Instagram y por WhatsApp,
--    y esa es la parte que hay que conservar cuando el lead desaparece.
-- 3. Mueve todo lo que cuelga: notas, adjuntos, eventos, links de pago,
--    recordatorios pospuestos, seguimientos y respuestas de formulario.
-- 4. Completa los huecos del lead que queda. Nunca pisa lo que ya está.
-- 5. Se queda con la fecha de registro más vieja: la persona llegó ese día,
--    no el día en que se abrió el lead repetido.
-- 6. Deja una nota en la bitácora diciendo qué se unió y con qué código. Esto
--    no se deshace con un botón, así que tiene que quedar escrito.
-- 7. Recién entonces borra el que sobra.
--
-- El orden es lo único que importa. Seis de las siete tablas que cuelgan de
-- una oportunidad borran en cascada: borrar antes de mover se llevaría las
-- notas, los comprobantes y los pagos.
--
-- Sólo dirección, por lo mismo que la otra.
--
-- Se puede correr con gente trabajando, y dos veces.

create or replace function public.fusionar_oportunidades(
  p_conservar bigint,
  p_absorber  bigint[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  absorbidas bigint[];
  duenio     bigint;
  codigos    text;
  fila       record;
  notas      int;
  resumen    text;
begin
  if not public.es_admin() then
    raise exception 'Sólo dirección puede unir leads.';
  end if;

  select cliente_id into duenio from public.oportunidades where id = p_conservar;
  if duenio is null then
    raise exception 'El lead que se quiere conservar (%) no existe.', p_conservar;
  end if;

  -- Sólo los que existen, son de la misma persona, y no son el que se conserva.
  select array_agg(o.id), string_agg(o.codigo, ', ' order by o.codigo)
    into absorbidas, codigos
    from public.oportunidades o
   where o.id = any(p_absorber)
     and o.id <> p_conservar
     and o.cliente_id = duenio;

  if absorbidas is null then
    -- Puede ser que ya se hayan unido, o que se hayan pasado leads de otra
    -- persona. Lo segundo es un error y hay que decirlo, no seguir de largo.
    if exists (select 1 from public.oportunidades
                where id = any(p_absorber) and id <> p_conservar
                  and cliente_id is distinct from duenio) then
      raise exception
        'Esos leads no son del mismo contacto. Unir contactos primero, con fusionar_contactos.';
    end if;
    return 'No había nada que unir.';
  end if;

  -- ------------------------------------------- 2. el canal, antes que nada

  if to_regclass('public.contactos_canal') is not null then
    -- También el del que se conserva, no sólo el de los que se van.
    --
    -- Normalmente ya está anotado —lo pone el alta o el webhook— pero de un
    -- lead viejo, importado o cargado a mano puede faltar. Si falta y sólo se
    -- anotara el del lead borrado, la ficha terminaría diciendo que llegó por
    -- Instagram y nada más, justo después de una operación que existía para
    -- conservar los dos.
    for fila in
      select o.canal_id, o.fecha_registro
        from public.oportunidades o
       where (o.id = any(absorbidas) or o.id = p_conservar)
         and o.canal_id is not null
    loop
      -- Al mediodía y en hora de El Salvador, no a medianoche UTC.
      --
      -- `fecha_registro` es una fecha sin hora. Convertirla derecho a marca de
      -- tiempo la clava a medianoche UTC, y eso en El Salvador —seis horas
      -- atrás— cae el día anterior: un lead del 12 de julio quedaría anotado
      -- como del 11. El mediodía deja doce horas de margen para cada lado, así
      -- que ninguna zona horaria lo corre de día.
      perform public.anotar_canal(
        duenio, fila.canal_id, null,
        (fila.fecha_registro + time '12:00') at time zone 'America/El_Salvador');
    end loop;
  end if;

  -- ------------------------------------------------------------- 3. mover

  update public.oportunidad_notas       set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.adjuntos                set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.eventos                 set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.enlaces_pago            set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.recordatorios_pospuestos set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);
  update public.formulario_respuestas   set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);

  -- Los seguimientos apuntan además a la nota que los creó, y esa nota se
  -- acaba de mudar, así que el enlace sigue siendo válido.
  update public.seguimientos            set oportunidad_id = p_conservar where oportunidad_id = any(absorbidas);

  -- ---------------------------------------------- 4 y 5. completar y fechar

  update public.oportunidades c
     set producto_id         = coalesce(c.producto_id,         o.producto_id),
         vendedor_id         = coalesce(c.vendedor_id,         o.vendedor_id),
         territorio_id       = coalesce(c.territorio_id,       o.territorio_id),
         canal_id            = coalesce(c.canal_id,            o.canal_id),
         estado_id           = coalesce(c.estado_id,           o.estado_id),
         motivo_perdida_id   = coalesce(c.motivo_perdida_id,   o.motivo_perdida_id),
         valor_oportunidad   = coalesce(c.valor_oportunidad,   o.valor_oportunidad),
         venta_cerrada       = coalesce(c.venta_cerrada,       o.venta_cerrada),
         reserva             = coalesce(c.reserva,             o.reserva),
         reserva_en          = coalesce(c.reserva_en,          o.reserva_en),
         fecha_cierre        = coalesce(c.fecha_cierre,        o.fecha_cierre),
         descuento_promocion = coalesce(c.descuento_promocion, o.descuento_promocion),
         -- La más vieja: la persona llegó ese día, no el día en que alguien
         -- abrió el lead repetido.
         fecha_registro      = least(c.fecha_registro, o.fecha_registro)
    from (
      select min(producto_id)         as producto_id,
             min(vendedor_id)         as vendedor_id,
             min(territorio_id)       as territorio_id,
             min(canal_id)            as canal_id,
             min(estado_id)           as estado_id,
             min(motivo_perdida_id)   as motivo_perdida_id,
             min(valor_oportunidad)   as valor_oportunidad,
             min(venta_cerrada)       as venta_cerrada,
             min(reserva)             as reserva,
             min(reserva_en)          as reserva_en,
             min(fecha_cierre)        as fecha_cierre,
             min(descuento_promocion) as descuento_promocion,
             min(fecha_registro)      as fecha_registro
        from public.oportunidades where id = any(absorbidas)
    ) as o
   where c.id = p_conservar;

  -- ------------------------------------------------- 6. que quede por escrito

  insert into public.oportunidad_notas (oportunidad_id, nota, origen)
  values (p_conservar,
          format('Se unió con %s: era el mismo lead, entrado por otro canal.', codigos),
          'sistema');
  get diagnostics notas = row_count;

  -- --------------------------------------------------------------- 7. borrar

  delete from public.oportunidades where id = any(absorbidas);

  resumen := format('Se unieron %s leads (%s) en el %s.',
                    array_length(absorbidas, 1), codigos,
                    (select codigo from public.oportunidades where id = p_conservar));
  raise notice '%', resumen;
  return resumen;
end $$;

revoke execute on function public.fusionar_oportunidades(bigint, bigint[]) from anon;
grant execute on function public.fusionar_oportunidades(bigint, bigint[]) to authenticated;

comment on function public.fusionar_oportunidades(bigint, bigint[]) is
  'Une leads repetidos del mismo contacto, guardando el canal del que se va. Sólo dirección.';

commit;
