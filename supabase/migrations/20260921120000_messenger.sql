begin;

-- ============================================================================
-- Messenger: el canal en el catálogo, y una función que sirve para los dos
-- ============================================================================
--
-- Lo que pidió la escuela: conectar Messenger al CRM «sin que genere conflicto
-- con los mensajes de WhatsApp, Instagram o TikTok».
--
-- ----------------------------------------------------------------------------
-- LO QUE NO HACE FALTA CAMBIAR, Y POR QUÉ ESO ES LA BUENA NOTICIA
-- ----------------------------------------------------------------------------
--
-- Nada de la estructura. Se revisó antes de escribir esto:
--
--   `conversaciones.canal` es `text` sin lista cerrada, así que «messenger»
--   entra sin tocar ninguna restricción.
--
--   La unicidad de los hilos ya es `unique (canal, identificador)`. Esa es,
--   exactamente, la garantía que la escuela pidió: el PSID de alguien en
--   Messenger no puede pisar el IGSID de otro en Instagram ni el teléfono de un
--   tercero en WhatsApp, aunque los números coincidieran por casualidad. No hay
--   que agregar nada; hay que no romperlo.
--
--   `telefono` sigue siendo sólo de WhatsApp. Un hilo de Messenger nace sin
--   teléfono, igual que uno de Instagram.
--
-- ----------------------------------------------------------------------------
-- LO QUE SÍ FALTA
-- ----------------------------------------------------------------------------
--
-- Dos cosas, y las dos chicas.
--
-- 1. La fila «Messenger» en el catálogo `canales`. Sin ella, `contactos_canal`
--    —que apunta al catálogo por id— no tendría dónde anotar que esta persona
--    llegó por ahí, y la ficha nacería sin saber de dónde vino.
--
-- 2. Una función que resuelva «¿de quién es este identificador?» para cualquier
--    canal. Hoy existe `cliente_de_instagram`, y adentro tiene «instagram»
--    escrito a mano. Copiarla y cambiarle la palabra dejaría dos funciones
--    gemelas que hay que arreglar de a dos cada vez; la tercera —TikTok, el día
--    que abra su API— serían tres.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ `cliente_de_instagram` SIGUE EXISTIENDO
-- ----------------------------------------------------------------------------
--
-- Porque el webhook de Instagram que está corriendo en producción la llama por
-- ese nombre. Si desapareciera, entre que corre esta migración y se despliega el
-- código nuevo habría una ventana —minutos, pero con gente escribiendo— en la
-- que cada mensaje de Instagram se perdería.
--
-- Así que queda, convertida en una línea que llama a la general. Mismo nombre,
-- mismos argumentos, mismo resultado: para quien la usa no cambió nada.
--
-- Se puede correr con gente escribiendo, y dos veces.

-- ------------------------------------------------ 1. el canal en el catálogo

/*
 * Van los dos, no sólo Messenger.
 *
 * «Instagram» ya tendría que estar —la función vieja no funciona sin él— pero
 * esto se corre en bases que pueden venir de cualquier punto de la historia, y
 * un `on conflict do nothing` no cuesta nada. Que falte el canal no da error:
 * hace que la ficha se cree sin origen, que es peor porque no se nota.
 */
insert into public.canales (nombre) values ('Messenger')
on conflict (nombre) do nothing;
insert into public.canales (nombre) values ('Instagram')
on conflict (nombre) do nothing;

-- ---------------------------------------- 2. la función, ahora para cualquiera

/**
 * ¿De quién es este identificador, en este canal?
 *
 * Es la misma lógica que tenía `cliente_de_instagram`, con el canal como
 * argumento en vez de escrito adentro.
 *
 * LO QUE NO HACE, Y ES A PROPÓSITO
 *
 * No junta personas por nombre. Dos «Carlos Martínez» que escriben por
 * Messenger son dos fichas hasta que alguien mire y decida. Es más trabajo para
 * la escuela y es lo correcto: un duplicado se ve y se arregla; dos personas
 * fundidas por error se descubren meses después, cuando alguien le contesta a
 * una de las cosas que dijo la otra.
 *
 * El reconocimiento es SIEMPRE por identificador y SIEMPRE dentro del mismo
 * canal. Un PSID de Messenger nunca se compara contra un IGSID de Instagram.
 */
create or replace function public.cliente_de_canal(
  /** El nombre tal como está en el catálogo: «Instagram», «Messenger». */
  p_canal         text,
  /** El PSID, el IGSID, lo que sea que identifica a la persona en ese canal. */
  p_identificador text,
  /** El @usuario, cuando el canal lo entrega. Messenger no. */
  p_usuario       text,
  /** El nombre visible del perfil, si Meta lo da. */
  p_nombre        text
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  clave      text;
  limpio     text;
  usuario    text;
  id_canal   bigint;
  id_cliente bigint;
begin
  clave := nullif(btrim(coalesce(p_identificador, '')), '');
  if clave is null then
    return null;
  end if;

  limpio  := nullif(btrim(coalesce(p_nombre, '')), '');
  usuario := nullif(btrim(coalesce(p_usuario, '')), '');

  select c.id into id_canal
    from public.canales c
   where lower(c.nombre) = lower(btrim(coalesce(p_canal, '')))
   limit 1;

  -- Sin el canal en el catálogo no se inventa uno: la ficha se crearía sin
  -- poder anotar por dónde llegó, que es la mitad del dato.
  if id_canal is null then
    return null;
  end if;

  /*
   * El candado lleva el canal adentro.
   *
   * Es para que dos mensajes de la misma persona entrando a la vez no creen dos
   * fichas. Con la clave sin el canal, un PSID y un IGSID que por casualidad
   * fueran el mismo número se esperarían entre ellos sin motivo. No estaría
   * mal, pero sería lento y raro de explicar.
   */
  perform pg_advisory_xact_lock(
    hashtext('cliente_de_canal:' || lower(p_canal) || ':' || clave)
  );

  select cc.cliente_id into id_cliente
    from public.contactos_canal cc
   where cc.canal_id = id_canal
     and cc.identificador = clave
   limit 1;

  if id_cliente is not null then
    -- Ya la conocíamos. Se le completa el nombre si en la ficha hay un hueco
    -- o quedó guardado el @usuario como nombre.
    if limpio is not null then
      update public.clientes c
         set nombre = limpio
       where c.id = id_cliente
         and (
           nullif(btrim(coalesce(c.nombre, '')), '') is null
           or c.nombre = usuario
           or c.nombre = '@' || coalesce(usuario, '')
         );
    end if;

    perform public.anotar_canal(id_cliente, id_canal, clave, now());
    return id_cliente;
  end if;

  /*
   * Ficha nueva.
   *
   * El nombre visible si lo hay; si no, el @usuario, que es con lo que quien
   * atiende la va a reconocer. El identificador nunca: es un número largo que no
   * le dice nada a nadie.
   *
   * El nombre de respaldo lleva el canal —«Contacto de Messenger»— y no un
   * genérico: en una bandeja con cuatro redes, saber por dónde entró alguien que
   * todavía no dijo su nombre es lo único que hay para ubicarlo.
   */
  insert into public.clientes (nombre)
  values (coalesce(limpio, '@' || usuario, 'Contacto de ' || btrim(p_canal)))
  returning clientes.id into id_cliente;

  perform public.anotar_canal(id_cliente, id_canal, clave, now());
  return id_cliente;
end $$;

revoke execute on function public.cliente_de_canal(text, text, text, text) from anon;
grant  execute on function public.cliente_de_canal(text, text, text, text) to authenticated;

/**
 * La de Instagram, ahora una línea.
 *
 * Se mantiene por el código que ya está corriendo en producción y la llama por
 * este nombre. Ver el encabezado: borrarla abriría una ventana de minutos en la
 * que los mensajes de Instagram se perderían.
 */
create or replace function public.cliente_de_instagram(
  p_igsid   text,
  p_usuario text,
  p_nombre  text
)
returns bigint
language sql
security definer
set search_path to ''
as $$
  select public.cliente_de_canal('Instagram', p_igsid, p_usuario, p_nombre);
$$;

revoke execute on function public.cliente_de_instagram(text, text, text) from anon;
grant  execute on function public.cliente_de_instagram(text, text, text) to authenticated;

commit;

-- ------------------------------------------------------------- cómo quedó

select
  case when exists (
    select 1 from public.canales where lower(nombre) = 'messenger'
  ) then '✓ Messenger está en el catálogo' else '⚠ falta el canal' end      as el_canal,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cliente_de_canal'
  ) then '✓ la función sirve para cualquier canal' else '⚠ falta' end       as la_funcion,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cliente_de_instagram'
  ) then '✓ y la de Instagram sigue respondiendo' else '⚠ SE PERDIÓ' end    as instagram_intacto,
  (select count(*) from public.conversaciones where canal = 'whatsapp')     as hilos_whatsapp,
  (select count(*) from public.conversaciones where canal = 'instagram')    as hilos_instagram,
  (select count(*) from public.conversaciones where canal = 'messenger')    as hilos_messenger;
