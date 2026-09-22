/**
 * Que el nombre de respaldo se deje reemplazar cuando por fin llega el de verdad.
 *
 * ============================================================================
 * QUÉ PASÓ
 * ============================================================================
 *
 * Cuando alguien escribe por Instagram o por Messenger, Meta manda el
 * identificador y el texto, y el nombre hay que ir a pedirlo aparte. Mientras la
 * aplicación de Meta está en modo desarrollo, esa consulta responde que no hay
 * permiso, así que la ficha se abre con el nombre de respaldo —«Contacto de
 * Instagram»— y el hilo queda titulado con el identificador.
 *
 * Hasta acá, correcto: es mejor guardar el mensaje sin nombre que perderlo.
 *
 * El problema es lo que pasaba DESPUÉS. `cliente_de_canal` sólo pisa el nombre
 * de una ficha que ya existe si está vacío o si es el @usuario. «Contacto de
 * Instagram» no es ninguna de las dos cosas, así que el día que Meta apruebe la
 * revisión y el nombre real empiece a llegar, todas las fichas abiertas durante
 * la espera se quedarían llamándose «Contacto de Instagram» para siempre.
 *
 * ============================================================================
 * QUÉ CAMBIA
 * ============================================================================
 *
 * Una sola cosa: el nombre de respaldo pasa a contar como hueco. Si la ficha se
 * llama «Contacto de <canal>» y llega un nombre de verdad, se reemplaza.
 *
 * Lo que NO cambia es lo importante: un nombre escrito por una persona sigue sin
 * tocarse. Si alguien de ventas corrigió la ficha a mano —«Sra. Martínez, la de
 * los brownies»— eso gana siempre, aunque después Meta mande otro. La regla
 * completa es: se pisa lo que puso el CRM por no tener nada mejor, nunca lo que
 * puso una persona.
 *
 * Es `create or replace` sobre la misma función y se puede correr dos veces sin
 * consecuencias. No toca datos: sólo cambia la condición para adelante.
 */

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
  clave      text;
  limpio     text;
  usuario    text;
  respaldo   text;
  id_canal   bigint;
  id_cliente bigint;
begin
  clave := nullif(btrim(coalesce(p_identificador, '')), '');
  if clave is null then
    return null;
  end if;

  limpio  := nullif(btrim(coalesce(p_nombre, '')), '');
  usuario := nullif(btrim(coalesce(p_usuario, '')), '');

  -- El mismo texto que se usa más abajo para las fichas nuevas. Se arma una vez
  -- para que las dos ramas no puedan discrepar: si acá dijera una cosa y abajo
  -- otra, el reemplazo dejaría de reconocer al respaldo y volveríamos a esto.
  respaldo := 'Contacto de ' || btrim(coalesce(p_canal, ''));

  select c.id into id_canal
    from public.canales c
   where lower(c.nombre) = lower(btrim(coalesce(p_canal, '')))
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
     * tener nada mejor: un hueco, el @usuario, o el nombre de respaldo.
     *
     * La comparación del respaldo es exacta a propósito. Con un `like` del
     * estilo «Contacto de %» se pisaría también una ficha que alguien llamó a
     * mano «Contacto de la feria de septiembre», que es justo lo contrario de
     * lo que esto tiene que hacer.
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
         );
    end if;

    perform public.anotar_canal(id_cliente, id_canal, clave, now());
    return id_cliente;
  end if;

  insert into public.clientes (nombre)
  values (coalesce(limpio, '@' || usuario, respaldo))
  returning clientes.id into id_cliente;

  perform public.anotar_canal(id_cliente, id_canal, clave, now());
  return id_cliente;
end $$;

revoke execute on function public.cliente_de_canal(text, text, text, text) from anon;
grant  execute on function public.cliente_de_canal(text, text, text, text) to authenticated;
