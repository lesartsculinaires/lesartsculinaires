begin;

-- ============================================================================
-- Unificar tiene que COMPLETAR, no sólo evitar el duplicado
-- ============================================================================
--
-- Lo que pidió la escuela, con sus palabras:
--
--   «cada vez que se verifique una unificación de cualquier lead, si hay
--    información que no aparece, se agregue a la ficha; por ejemplo, si un
--    cliente tiene número de teléfono y nombre, y en otra base de datos
--    agregan ese mismo cliente y aparece otra información, como el correo, se
--    agrega, y así se va actualizando la ficha del cliente a modo que esté
--    bien completa.»
--
-- Por el importador eso ya pasa: `planificarFusion` llena los huecos del
-- contacto con lo que trae la planilla. Por WhatsApp NO pasaba, y WhatsApp es
-- por donde entra casi todo.
--
-- ----------------------------------------------------------------------------
-- QUÉ ESTABA MAL
-- ----------------------------------------------------------------------------
--
-- `cliente_de_whatsapp` hace dos cosas: si el número ya tiene ficha la
-- devuelve, y si no la crea. Cuando la crea sin nombre de perfil deja el
-- teléfono como nombre —a propósito, porque «50377972598» al menos se puede
-- buscar y «Sin nombre» no—. Pero cuando la encuentra, devolvía el id y nada
-- más.
--
-- El resultado es una ficha que se queda para siempre llamándose como su
-- número, aunque la persona haya escrito diez veces después con su nombre de
-- perfil puesto. Y lo mismo con las fichas que entraron por una base vieja que
-- traía sólo el teléfono: unificaban bien —no se duplicaban, que era el
-- problema anterior— pero no se completaban nunca.
--
-- ----------------------------------------------------------------------------
-- Y POR QUÉ NO PISA LO QUE YA HAY
-- ----------------------------------------------------------------------------
--
-- Porque un nombre de perfil de WhatsApp es lo que la persona quiso poner:
-- «Mami ❤», «Chef Andrea», una sola letra. Si eso pisara el nombre que la
-- asesora escribió a mano, unificar sería una forma elegante de romper la
-- base.
--
-- Así que se completa en un solo caso, el que es claramente un hueco: cuando
-- el nombre guardado está vacío o es el propio teléfono escrito como nombre.
-- Es la misma regla que en el resto del CRM —completar nunca borra— dicha en
-- SQL.
--
-- Se puede correr con gente trabajando, y dos veces: sólo reemplaza una
-- función.

create or replace function public.cliente_de_whatsapp(
  p_telefono text,
  p_nombre   text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  digitos    text;
  clave      text;
  limpio     text;
  id_cliente bigint;
begin
  digitos := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  if length(digitos) < 8 then
    return null;
  end if;

  clave  := right(digitos, 8);
  limpio := nullif(btrim(coalesce(p_nombre, '')), '');

  -- Desde acá y hasta el final de la transacción, ningún otro mensaje de este
  -- mismo número puede estar haciendo lo mismo.
  perform pg_advisory_xact_lock(hashtext('cliente_de_whatsapp:' || clave));

  select c.id
    into id_cliente
    from public.clientes c
   where right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 8) = clave
   order by c.id
   limit 1;

  if id_cliente is not null then
    /*
     * La ficha ya estaba: se completa lo que le falte.
     *
     * El nombre, sólo si el guardado es un hueco. `~ '^[0-9()+.\s-]+$'` es
     * «esto no es un nombre, es un número escrito en la casilla del nombre»:
     * cubre tanto lo que dejó esta misma función cuando el perfil venía sin
     * nombre como las bases viejas que traían la columna del teléfono
     * duplicada.
     *
     * Y el nombre entrante tiene que ser un nombre de verdad, no otro número:
     * cambiar un teléfono por otro teléfono no completa nada.
     */
    if limpio is not null and limpio !~ '^[0-9()+.\s-]+$' then
      update public.clientes c
         set nombre = limpio
       where c.id = id_cliente
         and (
           nullif(btrim(coalesce(c.nombre, '')), '') is null
           or c.nombre ~ '^[0-9()+.\s-]+$'
         );
    end if;

    -- El teléfono, si la ficha lo tenía vacío. No debería pasar —se la
    -- encontró justamente por el número—, pero cuesta nada y deja el dato
    -- escrito con el formato con el que llegó.
    update public.clientes c
       set telefono = p_telefono
     where c.id = id_cliente
       and nullif(btrim(coalesce(c.telefono, '')), '') is null
       and nullif(p_telefono, '') is not null;

    return id_cliente;
  end if;

  -- Sin nombre de perfil queda el teléfono, que es mejor que «Sin nombre»: al
  -- menos se puede buscar y reconocer en la lista.
  insert into public.clientes (nombre, telefono)
  values (coalesce(limpio, p_telefono), nullif(p_telefono, ''))
  returning clientes.id into id_cliente;

  return id_cliente;
end $$;

comment on function public.cliente_de_whatsapp(text, text) is
  'La ficha del número que escribió por WhatsApp: la que ya existe —completándole los huecos— o una nueva. Con candado.';

revoke execute on function public.cliente_de_whatsapp(text, text) from anon;
grant  execute on function public.cliente_de_whatsapp(text, text) to service_role;

commit;
