begin;

-- «Contacto de Messenger» × 23, todas iguales. Que se distingan.
--
-- ============================================================================
-- QUÉ SE VE HOY
-- ============================================================================
--
-- Cuando Meta no da el nombre de quien escribe, el CRM abre la ficha con un
-- nombre de respaldo: «Contacto de Instagram» o «Contacto de Messenger». En el
-- módulo de Clientes hay veintitrés filas con exactamente ese texto, así que no
-- hay manera de saber cuál es cuál sin abrirlas de a una.
--
-- En la BANDEJA eso ya está resuelto: el hilo se titula «Contacto de Messenger
-- · 8028», con los últimos cuatro dígitos del identificador. El razonamiento
-- está escrito en `src/lib/canales.ts` y es el mismo que vale acá: el número
-- entero —diecisiete dígitos— no le dice nada a nadie, pero los últimos cuatro
-- alcanzan para distinguir y para decirlos en voz alta.
--
-- Esto lleva esa misma regla a la ficha. Es un cambio de presentación: no
-- arregla que falte el nombre —eso depende de que Meta apruebe el Acceso
-- Avanzado— pero convierte veintitrés filas idénticas en veintitrés que se
-- pueden distinguir.
--
-- ============================================================================
-- LA PARTE DELICADA: QUÉ NOMBRE SE PUEDE PISAR
-- ============================================================================
--
-- El nombre de respaldo se usa para DOS cosas, y las dos tienen que seguir de
-- acuerdo:
--
--   1. Es el nombre con que se abre una ficha nueva.
--   2. Es la comparación que dice «esto lo puso el CRM por no tener nada
--      mejor, así que cuando llegue un nombre de verdad se puede reemplazar».
--
-- Si se cambia (1) y no (2), las fichas nuevas dejan de reconocerse como
-- reemplazables y el nombre bueno ya no entra nunca. Por eso acá la comparación
-- acepta LAS DOS FORMAS: la vieja —«Contacto de Messenger»— y la nueva —con los
-- cuatro dígitos—. Las fichas que ya existen se siguen pudiendo arreglar.
--
-- Y sigue siendo una comparación EXACTA, no un «Contacto de %»: una ficha que
-- alguien llamó a mano «Contacto de la feria de septiembre» no se toca. Esa
-- decisión ya estaba tomada y no cambia.
--
-- Se puede correr con gente trabajando, y dos veces.

create or replace function public.cliente_de_canal(
  p_canal         text,
  p_identificador text,
  p_usuario       text,
  p_nombre        text
) returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  clave        text;
  limpio       text;
  usuario      text;
  canal_limpio text;
  respaldo     text;   -- la forma vieja, sin dígitos
  respaldo_con text;   -- la nueva, con los últimos cuatro
  id_canal     bigint;
  id_cliente   bigint;
begin
  clave := nullif(btrim(coalesce(p_identificador, '')), '');
  if clave is null then
    return null;
  end if;

  limpio       := nullif(btrim(coalesce(p_nombre, '')), '');
  usuario      := nullif(btrim(coalesce(p_usuario, '')), '');
  canal_limpio := btrim(coalesce(p_canal, ''));

  -- Las dos formas se arman juntas, en un solo lugar. Si una se calculara acá
  -- y la otra más abajo, podrían discrepar y el reemplazo dejaría de reconocer
  -- al respaldo —que es exactamente el error que esto viene a no repetir—.
  respaldo     := 'Contacto de ' || canal_limpio;
  -- El separador es el mismo que usa la bandeja: espacio, punto medio, espacio.
  respaldo_con := respaldo || ' · ' || right(clave, 4);

  select c.id into id_canal
    from public.canales c
   where lower(c.nombre) = lower(canal_limpio)
   limit 1;

  if id_canal is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('cliente_de_canal:' || lower(p_canal) || ':' || clave)
  );

  select cc.cliente_id into id_cliente
    from public.contactos_canal cc
   where cc.canal_id = id_canal
     and cc.identificador = clave
   limit 1;

  if id_cliente is not null then
    /*
     * Se le completa el nombre si lo que hay es algo que puso el CRM por no
     * tener nada mejor: un hueco, el @usuario, o cualquiera de las dos formas
     * del nombre de respaldo.
     */
    if limpio is not null then
      update public.clientes c
         set nombre = limpio
       where c.id = id_cliente
         and (
           nullif(btrim(coalesce(c.nombre, '')), '') is null
           or c.nombre = usuario
           or c.nombre = '@' || coalesce(usuario, '')
           or btrim(c.nombre) = respaldo
           or btrim(c.nombre) = respaldo_con
         );
    end if;

    perform public.anotar_canal(id_cliente, id_canal, clave, now());
    return id_cliente;
  end if;

  -- Ficha nueva: el nombre visible si lo hay; si no, el @usuario; y si no, el
  -- respaldo CON los cuatro dígitos, que es lo que la vuelve distinguible.
  insert into public.clientes (nombre)
  values (coalesce(limpio, '@' || usuario, respaldo_con))
  returning clientes.id into id_cliente;

  perform public.anotar_canal(id_cliente, id_canal, clave, now());
  return id_cliente;
end $$;

revoke execute on function public.cliente_de_canal(text, text, text, text) from anon;
grant  execute on function public.cliente_de_canal(text, text, text, text) to authenticated;

commit;

-- ============================================================================
-- Y LAS QUE YA ESTÁN
-- ============================================================================
--
-- Lo de arriba vale para las fichas nuevas. Esto le agrega los cuatro dígitos a
-- las veintitrés que ya existen, tomándolos de su contacto de canal.
--
-- Sólo las que se llaman EXACTAMENTE como el respaldo viejo. Una ficha con
-- nombre propio, o una que ya tenga sus dígitos de una corrida anterior, no
-- entra: por eso correr esto dos veces no cambia nada la segunda.

with dato as (
  select distinct on (cc.cliente_id)
         cc.cliente_id,
         'Contacto de ' || btrim(ca.nombre) || ' · ' || right(cc.identificador, 4) as nombre
    from public.contactos_canal cc
    join public.canales ca on ca.id = cc.canal_id
   where lower(btrim(ca.nombre)) in ('instagram', 'messenger')
   order by cc.cliente_id, cc.ultima_vez desc nulls last
)
update public.clientes cl
   set nombre = dato.nombre
  from dato
 where dato.cliente_id = cl.id
   and btrim(cl.nombre) in ('Contacto de Instagram', 'Contacto de Messenger');

-- ------------------------------------------------------------- cómo quedó

select
  (select count(*) from public.clientes
    where btrim(nombre) in ('Contacto de Instagram', 'Contacto de Messenger'))
                                                      as sin_distinguir_todavia,
  (select count(*) from public.clientes
    where nombre like 'Contacto de Instagram · %'
       or nombre like 'Contacto de Messenger · %')    as ya_distinguibles,
  (select count(distinct nombre) from public.clientes
    where nombre like 'Contacto de Instagram · %'
       or nombre like 'Contacto de Messenger · %')    as nombres_distintos;
