begin;

-- ============================================================================
-- Instagram en la bandeja: la parte de la base
-- ============================================================================
--
-- La escuela va a conectar los mensajes directos de Instagram, con la misma
-- bandeja, las mismas etiquetas y el mismo reparto entre asesoras que ya tiene
-- WhatsApp.
--
-- El código de la pantalla ya estaba preparado para esto: `src/lib/canales.ts`
-- existe desde hace meses justamente para que agregar un canal no sea rehacer
-- la bandeja. Lo que faltaba es esto de acá abajo, que es lo único que no se
-- podía dejar listo de antemano.
--
-- ============================================================================
-- EL PROBLEMA DE FONDO: UNA PERSONA DE INSTAGRAM NO TIENE TELÉFONO
-- ============================================================================
--
-- `conversaciones` nació para WhatsApp y su identidad es `telefono`: la
-- columna es NOT NULL y tiene un índice único. En Instagram no hay teléfono.
-- Lo que hay es un IGSID —un número largo que Meta le asigna a esa persona
-- FRENTE A ESTA CUENTA, distinto del que le daría a otra— y, si el perfil lo
-- deja ver, un @usuario.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ NO SE GUARDA EL IGSID EN `telefono`
-- ----------------------------------------------------------------------------
--
-- Era la salida corta: tres líneas y a otra cosa. No se hizo, y el motivo no
-- es estético.
--
-- El CRM reconoce personas por los ÚLTIMOS OCHO DÍGITOS del teléfono. Lo hacen
-- `cliente_de_whatsapp` y `buscarDuplicados`, y es lo que evita que quien
-- escribe por WhatsApp abra una ficha nueva al lado de la que ya tiene. Un
-- IGSID es un número de diecisiete dígitos. Guardado en la casilla del
-- teléfono, sus últimos ocho compiten en ese mismo sorteo contra los teléfonos
-- de verdad: tarde o temprano un IGSID coincide con el celular de alguien y el
-- CRM funde a dos personas que no tienen nada que ver.
--
-- Además el botón de llamar se ofrece por teléfono. Con el IGSID ahí, el CRM
-- ofrecería llamar a un número que no existe.
--
-- ----------------------------------------------------------------------------
-- LA SOLUCIÓN: UNA COLUMNA QUE DIGA QUÉ ES
-- ----------------------------------------------------------------------------
--
-- `identificador` guarda con qué identidad llegó esa conversación, sea la que
-- sea: el teléfono en WhatsApp, el IGSID en Instagram. La unicidad pasa a ser
-- por canal, que es lo correcto —el mismo número puede ser un teléfono en un
-- canal y otra cosa en otro— y `telefono` queda para lo que es un teléfono.
--
-- Es el mismo criterio que ya usa `contactos_canal.identificador`, que se
-- escribió en su día pensando en este momento.
-- ============================================================================

-- --------------------------------------------------------- la identidad del hilo

alter table public.conversaciones
  add column if not exists identificador text;

/*
 * Lo que ya está es todo de WhatsApp, y ahí la identidad ES el teléfono.
 *
 * Se copia en vez de dejarlo vacío porque la columna va a ser obligatoria y
 * porque es la verdad: esas conversaciones se reconocen por el número.
 */
update public.conversaciones
   set identificador = telefono
 where identificador is null;

alter table public.conversaciones
  alter column identificador set not null;

/*
 * Y el teléfono deja de ser obligatorio.
 *
 * Una conversación de Instagram no tiene ninguno, y ponerle algo inventado
 * para cumplir con la columna sería exactamente el error que este archivo
 * viene evitando.
 */
alter table public.conversaciones
  alter column telefono drop not null;

/*
 * La unicidad, ahora por canal.
 *
 * Antes: un teléfono, una conversación. Ahora: una identidad POR CANAL, una
 * conversación. Es lo que permite que la misma persona tenga su hilo de
 * WhatsApp y su hilo de Instagram sin que uno pise al otro —son dos
 * conversaciones distintas, y la ficha del cliente es la que los junta—.
 */
alter table public.conversaciones
  drop constraint if exists conversaciones_telefono_key;

create unique index if not exists ux_conversaciones_canal_identidad
  on public.conversaciones (canal, identificador);

comment on column public.conversaciones.identificador is
  'Con qué identidad llegó: el teléfono en WhatsApp, el IGSID en Instagram.';

-- ------------------------------------------------------- el @usuario, si se ve

/*
 * El @usuario de Instagram, aparte del nombre visible.
 *
 * Son dos cosas distintas y las dos sirven. `nombre_perfil` es cómo se llama
 * —«Sofía Martínez»— y el usuario es cómo se la encuentra —«@sofi.mtz»—.
 * Quien atiende necesita el segundo para poder mirar el perfil antes de
 * contestar, que es lo que en WhatsApp resuelve el teléfono.
 *
 * Puede venir vacío: Meta sólo lo entrega si la persona no lo tiene
 * restringido. Por eso no reemplaza al identificador ni se usa para reconocer
 * a nadie; es para mostrar.
 */
alter table public.conversaciones
  add column if not exists usuario text;

comment on column public.conversaciones.usuario is
  'El @usuario de Instagram, cuando Meta lo entrega. Sólo para mostrar.';

-- ------------------------------------------- de quién es esta persona de Instagram

/*
 * El equivalente de `cliente_de_whatsapp`, y con una diferencia importante.
 *
 * Aquélla busca por teléfono, que es un dato que la persona comparte entre
 * canales. Ésta busca por el IGSID en `contactos_canal`, que es la identidad
 * de Instagram y de ningún otro lado.
 *
 * ----------------------------------------------------------------------------
 * LO QUE ESTA FUNCIÓN NO HACE, Y ES A PROPÓSITO
 * ----------------------------------------------------------------------------
 *
 * NO junta a la persona de Instagram con una ficha existente. No hay con qué:
 * Meta no entrega el teléfono ni el correo de quien escribe por Instagram, y
 * lo único que queda para comparar es el nombre. Juntar por nombre fundiría a
 * dos «María González» que no se conocen, y eso no se deshace.
 *
 * Así que abre una ficha nueva, y unir es una decisión de una persona: la
 * pantalla de Clientes ya tiene el unificador, con su aviso de qué dato se
 * conserva y cuál queda anotado.
 *
 * Es más trabajo para la escuela y es lo correcto. Un duplicado se ve y se
 * arregla; dos personas fundidas por error se descubren meses después, cuando
 * alguien le habla a una de las cosas que dijo la otra.
 */
create or replace function public.cliente_de_instagram(
  p_igsid   text,
  p_usuario text,
  p_nombre  text
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
  clave := nullif(btrim(coalesce(p_igsid, '')), '');
  if clave is null then
    return null;
  end if;

  limpio  := nullif(btrim(coalesce(p_nombre, '')), '');
  usuario := nullif(btrim(coalesce(p_usuario, '')), '');

  select c.id into id_canal
    from public.canales c
   where lower(c.nombre) = 'instagram'
   limit 1;

  -- Sin el canal en el catálogo no se inventa uno: la ficha se crearía sin
  -- poder anotar por dónde llegó, que es la mitad del dato.
  if id_canal is null then
    return null;
  end if;

  -- Igual que en WhatsApp: dos mensajes de la misma persona entrando a la vez
  -- no pueden crear dos fichas.
  perform pg_advisory_xact_lock(hashtext('cliente_de_instagram:' || clave));

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
   * atiende la va a reconocer. El IGSID nunca: es un número de diecisiete
   * dígitos que no le dice nada a nadie.
   */
  insert into public.clientes (nombre)
  values (coalesce(limpio, '@' || usuario, 'Contacto de Instagram'))
  returning clientes.id into id_cliente;

  perform public.anotar_canal(id_cliente, id_canal, clave, now());
  return id_cliente;
end $$;

commit;

-- ------------------------------------------------------------- cómo quedó
--
-- `hilos_sin_identidad` tiene que dar cero: es la comprobación de que el
-- copiado de arriba alcanzó a todas las conversaciones que ya estaban.
-- ============================================================================
select
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'conversaciones'
       and column_name = 'identificador'
  ) then '✓ los hilos ya tienen identidad propia' else '⚠ REVISAR' end   as identidad,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cliente_de_instagram'
  ) then '✓ y se sabe de quién es cada una' else '⚠ falta la función' end as quien_es,
  (select count(*) from public.conversaciones
    where nullif(btrim(coalesce(identificador, '')), '') is null)        as hilos_sin_identidad,
  (select count(*) from public.conversaciones where canal = 'whatsapp')  as hilos_de_whatsapp,
  (select count(*) from public.conversaciones where canal = 'instagram') as hilos_de_instagram;
